-- hackgorithmic: pedidos dentro de la web (sin correo).
-- Usa las tablas del marketplace (stores, products, orders, order_items) y agrega:
--   private.hg_catalog        tipo de pedido → producto de la tienda hackgorithmic
--   public.order_events       historial y mensajes de cada pedido (lo ven el cliente y la tienda)
--   bucket "order-files"      archivos del pedido (STL, foto del dibujo). PRIVADO.
--   public.print_quotes       medición de cada archivo subido (volumen y medidas), la escribe la función precio-archivo
--   private.print_price       tarifas de impresión (mismas que app.js): precio y gramos según volumen, material, relleno, colores, cantidad
--   private.shipping_cents    envío por peso (EE.UU.) · recoger o digital = gratis
--   quote_total               precio real (subtotal + envío) de un archivo medido, para mostrarlo en el checkout
--   create_order              el cliente crea su pedido. Con archivo (STL o dibujo en 3D): precio real y queda "awaiting_payment".
--                             Sin archivo (diseño a medida, IA): queda "awaiting_quote" y la tienda pone el precio con la vista previa.
--   cancel_my_order           el cliente cancela antes de pagar
--   owner_orders              la tienda ve sus pedidos, con el correo del cliente
--   owner_update_order        la tienda cotiza, marca pagado, producción, enviado, entregado o cancelado
--   private.hg_setup(correo)  crea la tienda "hackgorithmic" y su catálogo con la cuenta del dueño
-- Pegar COMPLETO en Supabase → SQL Editor → Run. Se puede volver a ejecutar sin problema.
-- Después, una sola vez y con la cuenta del dueño ya confirmada:  select private.hg_setup('correo-del-dueño');

create schema if not exists private;

-- ============ Catálogo: cada tipo de pedido apunta a un producto de la tienda ============
create table if not exists private.hg_catalog (
  kind text primary key check (kind ~ '^[a-z-]{2,30}$'),
  product_id uuid not null unique references public.products (id)
);
alter table private.hg_catalog enable row level security;
revoke all on private.hg_catalog from public, anon, authenticated;

-- ============ Historial y mensajes de cada pedido ============
create table if not exists public.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  created_at timestamptz not null default now(),
  actor text not null check (actor in ('cliente', 'tienda', 'sistema', 'agente')),
  status text check (status is null or status in ('awaiting_quote', 'awaiting_payment', 'paid', 'processing', 'shipped', 'completed', 'cancelled')),
  message text not null default '' check (char_length(message) <= 1000)
);
create index if not exists order_events_order on public.order_events (order_id, created_at);
alter table public.order_events enable row level security;
drop policy if exists order_events_read_participant on public.order_events;
-- Lo ve quien puede ver el pedido (el comprador o el dueño de la tienda, por la política de orders).
create policy order_events_read_participant on public.order_events for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_events.order_id));
revoke all on public.order_events from anon;
revoke insert, update, delete, truncate on public.order_events from authenticated;
grant select on public.order_events to authenticated;

-- ============ Archivos del pedido: bucket PRIVADO, cada persona sube solo a su carpeta ============
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('order-files', 'order-files', false, 26214400, array['model/stl', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "order files upload own" on storage.objects;
drop policy if exists "order files read" on storage.objects;
-- Subir: solo a la carpeta propia (uid/…) y máximo 40 archivos por persona.
create policy "order files upload own" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'order-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select count(*) from storage.objects o
          where o.bucket_id = 'order-files' and (storage.foldername(o.name))[1] = (select auth.uid())::text) < 40
  );
-- Ver/descargar: la persona que lo subió o el dueño de la tienda hackgorithmic.
create policy "order files read" on storage.objects for select to authenticated
  using (
    bucket_id = 'order-files'
    and ((storage.foldername(name))[1] = (select auth.uid())::text
         or exists (select 1 from public.stores s where s.slug = 'hackgorithmic' and s.owner_id = (select auth.uid())))
  );

-- ============ Precio real por archivo ============
-- La función precio-archivo mide el STL que la persona subió (volumen y medidas) y guarda la medición aquí.
create table if not exists public.print_quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  file text not null check (char_length(file) <= 200),
  volume_cm3 numeric not null check (volume_cm3 > 0 and volume_cm3 <= 20000),
  size_mm numeric[] not null check (array_length(size_mm, 1) = 3),
  created_at timestamptz not null default now()
);
create index if not exists print_quotes_user on public.print_quotes (user_id, created_at desc);
alter table public.print_quotes enable row level security;
revoke all on public.print_quotes from anon, authenticated;

-- Tarifas (editar aquí y en app.js → T): PLA $22/kg, PETG $26/kg, +15 % merma, $3/h de máquina, margen x2,
-- $3 de preparación, +20 % por color extra, piezas extra al 85 % de máquina, mínimo $8 por pedido y $5 por pieza, 25 g/h.
create or replace function private.print_price(p_volume numeric, p_material text, p_infill numeric, p_colors integer, p_qty integer)
returns table (grams numeric, cents integer) language sql immutable set search_path = '' as $$
  with b as (
    select case when p_material = 'petg' then 26.0 else 22.0 end as kg,
           p_volume * (case when p_material = 'petg' then 1.27 else 1.24 end) * (p_infill + (1 - p_infill) * exp(-p_volume / 8.0)) as g,
           1 + 0.20 * (p_colors - 1) as cx
  ), c as (
    select b.kg, b.g * b.cx * 1.15 * p_qty as gt, (b.g / 25.0 + 0.15) * b.cx * (1 + (p_qty - 1) * 0.85) as ht from b
  )
  select c.gt, round(greatest(8.0, (c.gt / 1000 * c.kg + c.ht * 3.0) * 2.0 + 3.0, p_qty * 5.0) * 100)::integer from c;
$$;

-- Envío en EE.UU. por peso (pieza + 100 g de empaque). Recoger en Florida o entrega digital: gratis.
create or replace function private.shipping_cents(p_grams numeric, p_delivery text)
returns integer language sql immutable set search_path = '' as $$
  select case when p_delivery <> 'shipping' then 0
              when p_grams + 100 <= 250 then 600
              when p_grams + 100 <= 1000 then 900
              when p_grams + 100 <= 3000 then 1500
              else 2500 end;
$$;

-- Precio de un archivo medido: tu STL (material, relleno y colores que eligió) o tu dibujo en 3D (PLA, 2 colores, desde $10).
create or replace function private.order_price(p_user uuid, p_quote uuid, p_file text, p_kind text, p_qty integer, p_custom jsonb, p_delivery text)
returns jsonb language plpgsql stable set search_path = '' as $$
declare v_q public.print_quotes; v_mat text; v_inf numeric; v_col integer; v_p record; v_sub integer; v_ship integer;
begin
  select * into v_q from public.print_quotes where id = p_quote and user_id = p_user and created_at > now() - interval '24 hours';
  if not found or (p_file is not null and v_q.file <> p_file) then raise exception 'quote' using errcode = '22023'; end if;
  if p_qty is null or p_qty not between 1 and 50 or p_custom is null or jsonb_typeof(p_custom) <> 'object' then raise exception 'print_options' using errcode = '22023'; end if;
  if p_kind = 'dibujo' then
    v_mat := 'pla'; v_inf := 0.35; v_col := 2;
  else
    v_mat := coalesce(p_custom->>'mat', 'pla');
    v_inf := case coalesce(p_custom->>'inf', '0.35') when '0.35' then 0.35 when '0.55' then 0.55 when '1' then 1 end;
    v_col := case when coalesce(p_custom->>'col', '1') ~ '^[1-4]$' then coalesce(p_custom->>'col', '1')::integer end;
  end if;
  if v_mat not in ('pla', 'petg') or v_inf is null or v_col is null then raise exception 'print_options' using errcode = '22023'; end if;
  select * into v_p from private.print_price(v_q.volume_cm3, v_mat, v_inf, v_col, p_qty);
  v_sub := case when p_kind = 'dibujo' then greatest(v_p.cents, 1000 * p_qty) else v_p.cents end;
  v_ship := private.shipping_cents(v_p.grams, p_delivery);
  return jsonb_build_object('subtotal_cents', v_sub, 'shipping_cents', v_ship, 'total_cents', v_sub + v_ship,
    'grams', round(v_p.grams), 'material', v_mat, 'infill', v_inf, 'colors', v_col, 'size_mm', to_jsonb(v_q.size_mm));
end $$;

-- Lo que ve la persona en el checkout: el mismo cálculo que usa create_order.
create or replace function public.quote_total(p_quote uuid, p_kind text, p_quantity integer, p_customization jsonb, p_delivery text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.require_verified_user();
begin
  if p_kind not in ('stl', 'dibujo') or p_delivery not in ('shipping', 'pickup') then raise exception 'print_options' using errcode = '22023'; end if;
  return private.order_price(v_user, p_quote, null, p_kind, p_quantity, p_customization, p_delivery);
end $$;

-- ============ El cliente crea su pedido ============
-- Con archivo (tu STL o tu dibujo en 3D): el precio y el envío los calcula la base de datos con la medición del archivo
-- (print_quotes) y el pedido queda "awaiting_payment". Sin archivo (diseño a medida, IA): queda "awaiting_quote" y la tienda
-- pone el precio con la vista previa (owner_update_order 'quote'). La página nunca decide cuánto se cobra.
drop function if exists public.create_order(text, text, integer, integer, jsonb, text, text, jsonb, text, uuid);
drop function if exists public.create_order(text, text, integer, integer, jsonb, text, text, jsonb, text, uuid, uuid);
create or replace function public.create_order(
  p_kind text, p_title text, p_quantity integer, p_estimate_cents integer, p_customization jsonb,
  p_file text, p_buyer_name text, p_shipping_address jsonb, p_note text, p_request_key uuid, p_quote uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := private.require_verified_user();
  v_product public.products; v_store public.stores; v_existing public.orders;
  v_order uuid; v_delivery text; v_title text; v_line integer; v_estimate integer; v_payload jsonb;
  v_price jsonb; v_status text := 'awaiting_quote'; v_ship integer; v_total integer;
begin
  if p_request_key is null then raise exception 'request_key' using errcode = '22023'; end if;
  select p.* into v_product from private.hg_catalog c join public.products p on p.id = c.product_id where c.kind = p_kind;
  if not found then raise exception 'store_not_ready' using errcode = '55000'; end if;
  select * into v_store from public.stores where id = v_product.store_id;
  if not found or v_store.status <> 'active' or v_product.status <> 'published' then
    raise exception 'store_not_ready' using errcode = '55000';
  end if;

  if p_quantity is null or p_quantity not between 1 and 50 then raise exception 'quantity' using errcode = '22023'; end if;
  v_title := btrim(coalesce(p_title, ''));
  if char_length(v_title) not between 2 and 120 then raise exception 'title' using errcode = '22023'; end if;
  if p_customization is null or jsonb_typeof(p_customization) <> 'object' or char_length(p_customization::text) > 1500 then
    raise exception 'customization' using errcode = '22023';
  end if;
  if p_buyer_name is null or char_length(btrim(p_buyer_name)) not between 2 and 120 or char_length(coalesce(p_note, '')) > 1000 then
    raise exception 'buyer' using errcode = '22023';
  end if;

  -- Entrega: envío (EE.UU.), recoger en persona o digital (planes / solo archivo).
  if p_shipping_address is null or jsonb_typeof(p_shipping_address) <> 'object' or char_length(p_shipping_address::text) > 1000
     or exists (select 1 from jsonb_object_keys(p_shipping_address) k
                 where k not in ('delivery', 'country', 'line1', 'line2', 'city', 'region', 'postal_code', 'phone'))
     or exists (select 1 from jsonb_each(p_shipping_address) e where jsonb_typeof(e.value) <> 'string') then
    raise exception 'address' using errcode = '22023';
  end if;
  v_delivery := p_shipping_address->>'delivery';
  if v_delivery is null or v_delivery not in ('shipping', 'pickup', 'digital') or p_shipping_address->>'country' is distinct from 'US'
     or (p_kind like 'plan-%' and v_delivery <> 'digital') then
    raise exception 'address' using errcode = '22023';
  end if;
  if v_delivery = 'shipping' and (
       char_length(btrim(coalesce(p_shipping_address->>'line1', ''))) not between 3 and 160
    or char_length(btrim(coalesce(p_shipping_address->>'city', ''))) not between 2 and 100
    or coalesce(p_shipping_address->>'region', '') !~ '^[A-Z]{2}$'
    or coalesce(p_shipping_address->>'postal_code', '') !~ '^[0-9]{5}(-[0-9]{4})?$') then
    raise exception 'address' using errcode = '22023';
  end if;
  if char_length(coalesce(p_shipping_address->>'line2', '')) > 160
     or (p_shipping_address ? 'phone' and (p_shipping_address->>'phone') !~ '^[0-9+() .-]{7,30}$') then
    raise exception 'address' using errcode = '22023';
  end if;

  -- Archivo (opcional): tiene que estar en la carpeta de quien pide y existir en el bucket.
  if p_file is not null and (
       p_file !~ ('^' || v_user::text || '/[A-Za-z0-9_-]{8,80}\.(stl|jpg|png|webp)$')
    or not exists (select 1 from storage.objects o where o.bucket_id = 'order-files' and o.name = p_file)) then
    raise exception 'file' using errcode = '22023';
  end if;

  if p_kind in ('stl', 'dibujo') then
    -- Precio real: se cobra por lo que mide el archivo que subió (lo mismo que vio en el checkout).
    if p_quote is null or p_file is null or v_delivery = 'digital' then raise exception 'quote' using errcode = '22023'; end if;
    v_price := private.order_price(v_user, p_quote, p_file, p_kind, p_quantity, p_customization, v_delivery);
    v_line := (v_price->>'subtotal_cents')::integer; v_ship := (v_price->>'shipping_cents')::integer;
    v_total := v_line + v_ship; v_status := 'awaiting_payment'; v_estimate := null;
  else
    if p_kind like 'plan-%' then v_estimate := v_product.price_cents * p_quantity;
    elsif p_estimate_cents is null then v_estimate := null;
    elsif p_estimate_cents between 100 and 1000000 then v_estimate := p_estimate_cents;
    else raise exception 'estimate' using errcode = '22023';
    end if;
    v_line := greatest(v_product.price_cents, coalesce(v_estimate, v_product.price_cents * p_quantity));
  end if;

  v_payload := jsonb_build_object('kind', p_kind, 'title', v_title, 'quantity', p_quantity, 'estimate_cents', v_estimate,
    'customization', p_customization, 'file', p_file, 'buyer_name', btrim(p_buyer_name),
    'shipping_address', p_shipping_address, 'note', coalesce(btrim(p_note), ''), 'quote', p_quote);

  -- Reintentos del mismo envío devuelven el mismo pedido.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_user::text), pg_catalog.hashtext(p_request_key::text));
  select * into v_existing from public.orders where buyer_id = v_user and request_key = p_request_key;
  if found then
    if v_existing.request_payload is distinct from v_payload then raise exception 'request_key' using errcode = '22023'; end if;
    return jsonb_build_object('id', v_existing.id);
  end if;

  -- Máximo 15 pedidos por persona en 24 horas.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('orders:' || v_user::text));
  if (select count(*) from public.orders where buyer_id = v_user and created_at > now() - interval '24 hours') >= 15 then
    raise exception 'order_limit' using errcode = '54000';
  end if;

  insert into public.orders (buyer_id, store_id, status, subtotal_cents, shipping_cents, total_cents, buyer_name, shipping_address, note, request_key, request_payload)
  values (v_user, v_store.id, v_status, v_line, v_ship, v_total, btrim(p_buyer_name), p_shipping_address, coalesce(btrim(p_note), ''), p_request_key, v_payload)
  returning id into v_order;
  insert into public.order_items (order_id, product_id, title, quantity, unit_price_cents, line_total_cents, customization)
  values (v_order, v_product.id, left(v_product.title || ' · ' || v_title, 160), p_quantity, greatest(1, v_line / p_quantity), v_line,
          jsonb_strip_nulls(p_customization || jsonb_build_object('kind', p_kind, 'estimate_cents', v_estimate, 'file', p_file, 'grams', v_price->'grams')));
  insert into public.order_events (order_id, actor, status, message) values (v_order, 'cliente', v_status, 'Pedido recibido.');
  return jsonb_build_object('id', v_order, 'status', v_status, 'total_cents', v_total);
end $$;

-- ============ El cliente cancela antes de pagar ============
create or replace function public.cancel_my_order(p_order uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.require_verified_user(); v_status text;
begin
  select status into v_status from public.orders where id = p_order and buyer_id = v_user for update;
  if not found then raise exception 'not_found' using errcode = '42501'; end if;
  if v_status not in ('awaiting_quote', 'awaiting_payment') then raise exception 'state' using errcode = '55000'; end if;
  update public.orders set status = 'cancelled' where id = p_order;
  insert into public.order_events (order_id, actor, status, message) values (p_order, 'cliente', 'cancelled', 'Pedido cancelado por el cliente.');
  return 'cancelled';
end $$;

-- ============ La tienda ve sus pedidos (con el correo del cliente) ============
create or replace function public.owner_orders(p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.require_verified_user(); v_result jsonb;
begin
  select coalesce(jsonb_agg(t.x order by t.created_at desc), '[]'::jsonb) into v_result from (
    select o.created_at, jsonb_build_object(
      'id', o.id, 'created_at', o.created_at, 'status', o.status,
      'subtotal_cents', o.subtotal_cents, 'shipping_cents', o.shipping_cents, 'total_cents', o.total_cents,
      'buyer_name', o.buyer_name, 'buyer_email', u.email, 'shipping_address', o.shipping_address, 'note', o.note,
      'order_items', (select coalesce(jsonb_agg(jsonb_build_object('title', i.title, 'quantity', i.quantity,
                        'line_total_cents', i.line_total_cents, 'customization', i.customization)), '[]'::jsonb)
                      from public.order_items i where i.order_id = o.id),
      'order_events', (select coalesce(jsonb_agg(jsonb_build_object('created_at', e.created_at, 'actor', e.actor,
                        'status', e.status, 'message', e.message) order by e.created_at), '[]'::jsonb)
                       from public.order_events e where e.order_id = o.id)) as x
    from public.orders o
    join public.stores s on s.id = o.store_id
    left join auth.users u on u.id = o.buyer_id
    where s.owner_id = v_user
    order by o.created_at desc
    limit least(greatest(coalesce(p_limit, 100), 1), 300)
  ) t;
  return v_result;
end $$;

-- ============ La tienda avanza el pedido ============
-- quote: fija precio y envío → awaiting_payment · paid · processing · shipped · completed · cancel · message
create or replace function public.owner_update_order(p_order uuid, p_action text, p_subtotal_cents integer default null,
  p_shipping_cents integer default null, p_message text default '')
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := private.require_verified_user(); v_order public.orders; v_next text;
  v_msg text := btrim(coalesce(p_message, ''));
begin
  if char_length(v_msg) > 1000 then raise exception 'message' using errcode = '22023'; end if;
  select o.* into v_order from public.orders o join public.stores s on s.id = o.store_id
   where o.id = p_order and s.owner_id = v_user for update of o;
  if not found then raise exception 'not_found' using errcode = '42501'; end if;

  if p_action = 'message' then
    if v_msg = '' then raise exception 'message' using errcode = '22023'; end if;
    insert into public.order_events (order_id, actor, status, message) values (p_order, 'tienda', null, v_msg);
    return v_order.status;
  elsif p_action = 'quote' then
    if v_order.status not in ('awaiting_quote', 'awaiting_payment') then raise exception 'state' using errcode = '55000'; end if;
    if p_subtotal_cents is null or p_subtotal_cents not between 100 and 10000000
       or p_shipping_cents is null or p_shipping_cents not between 0 and 1000000 then
      raise exception 'amount' using errcode = '22023';
    end if;
    update public.orders set subtotal_cents = p_subtotal_cents, shipping_cents = p_shipping_cents,
           total_cents = p_subtotal_cents + p_shipping_cents, status = 'awaiting_payment' where id = p_order;
    if (select count(*) from public.order_items where order_id = p_order) = 1 then
      update public.order_items set line_total_cents = p_subtotal_cents, unit_price_cents = greatest(1, p_subtotal_cents / quantity)
       where order_id = p_order;
    end if;
    v_next := 'awaiting_payment';
  elsif p_action = 'paid' and v_order.status = 'awaiting_payment' then v_next := 'paid';
  elsif p_action = 'processing' and v_order.status = 'paid' then v_next := 'processing';
  elsif p_action = 'shipped' and v_order.status = 'processing' then v_next := 'shipped';
  elsif p_action = 'completed' and v_order.status in ('paid', 'processing', 'shipped') then v_next := 'completed';
  elsif p_action = 'cancel' and v_order.status not in ('completed', 'cancelled') then v_next := 'cancelled';
  elsif p_action in ('paid', 'processing', 'shipped', 'completed', 'cancel') then raise exception 'state' using errcode = '55000';
  else raise exception 'action' using errcode = '22023';
  end if;

  if p_action <> 'quote' then update public.orders set status = v_next where id = p_order; end if;
  insert into public.order_events (order_id, actor, status, message) values (p_order, 'tienda', v_next, v_msg);
  return v_next;
end $$;

-- ============ Puesta en marcha: tienda "hackgorithmic" + catálogo ============
-- Precio = mínimo "desde" que se muestra como estimado; la tienda confirma el total de cada pedido.
create or replace function private.hg_setup(p_owner_email text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_owner uuid; v_store uuid; v_product uuid; r record;
begin
  select id into v_owner from auth.users where lower(email) = lower(btrim(p_owner_email)) and email_confirmed_at is not null;
  if v_owner is null then raise exception 'Primero crea y confirma la cuenta de % en hackgorithmic.com', p_owner_email; end if;
  insert into public.profiles (id, display_name) values (v_owner, 'hackgorithmic') on conflict (id) do nothing;
  select id into v_store from public.stores where slug = 'hackgorithmic';
  if v_store is null then
    insert into public.stores (owner_id, name, slug, description, status)
    values (v_owner, 'hackgorithmic', 'hackgorithmic', 'Estudio de diseño e impresión 3D en Florida.', 'active')
    returning id into v_store;
  else
    update public.stores set owner_id = v_owner, status = 'active' where id = v_store;
  end if;
  for r in select * from (values
      ('taller',        'Pieza de Studio',              700),
      ('ia',            'Modelo 3D con IA impreso',     100),
      ('idea',          'Diseño a medida',              100),
      ('dibujo',        'Tu dibujo en 3D (relieve)',   1000),
      ('dibujo-figura', 'Figura 3D de tu dibujo',       100),
      ('stl',           'Impresión de tu archivo STL',  800),
      ('plan-creador',  'Plan Creador (mensual)',       800),
      ('plan-pro',      'Plan Pro (mensual)',          2400)
    ) as t(kind, title, price)
  loop
    select c.product_id into v_product from private.hg_catalog c where c.kind = r.kind;
    if v_product is null then
      insert into public.products (store_id, title, description, price_cents, stock, status)
      values (v_store, r.title, '', r.price, 0, 'published') returning id into v_product;
      insert into private.hg_catalog (kind, product_id) values (r.kind, v_product);
    else
      update public.products set store_id = v_store, title = r.title, price_cents = r.price, status = 'published', updated_at = now()
       where id = v_product;
    end if;
    v_product := null;
  end loop;
  return v_store;
end $$;

-- ============ Permisos ============
revoke all on function public.create_order(text, text, integer, integer, jsonb, text, text, jsonb, text, uuid, uuid) from public, anon;
grant execute on function public.create_order(text, text, integer, integer, jsonb, text, text, jsonb, text, uuid, uuid) to authenticated;
revoke all on function public.quote_total(uuid, text, integer, jsonb, text) from public, anon;
grant execute on function public.quote_total(uuid, text, integer, jsonb, text) to authenticated;
revoke all on function private.print_price(numeric, text, numeric, integer, integer) from public, anon, authenticated;
revoke all on function private.shipping_cents(numeric, text) from public, anon, authenticated;
revoke all on function private.order_price(uuid, uuid, text, text, integer, jsonb, text) from public, anon, authenticated;
revoke all on function public.cancel_my_order(uuid) from public, anon;
grant execute on function public.cancel_my_order(uuid) to authenticated;
revoke all on function public.owner_orders(integer) from public, anon;
grant execute on function public.owner_orders(integer) to authenticated;
revoke all on function public.owner_update_order(uuid, text, integer, integer, text) from public, anon;
grant execute on function public.owner_update_order(uuid, text, integer, integer, text) to authenticated;
revoke all on function private.hg_setup(text) from public, anon, authenticated;
