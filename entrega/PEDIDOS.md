# Pedidos dentro de la web

Todos los pedidos se hacen desde hackgorithmic.com con una cuenta. Ya no hay pedidos por correo.

## Cómo pide un cliente

1. Crea algo y pulsa **Pedirlo impreso** (o **Pedir esta impresión** / **Elegir plan** / **Pedir un diseño a medida**):
   - hackgorithmic Studio: describe tu idea (modelo con IA o lo modela el equipo) o Tu dibujo en 3D.
   - Tu dibujo en 3D: placa en relieve o figura completa.
   - Imprimir: su archivo STL.
   - Planes: Creador $8 o Pro $24.
   - Contacto: diseño a medida.
2. Si no tiene cuenta, se la pide (correo confirmado).
3. **Checkout**: nombre, teléfono (opcional), entrega (envío en EE.UU., recoger en Florida o digital) y notas.
   - **Con archivo (tu STL o tu dibujo en 3D):** el archivo se sube al entrar, la función `precio-archivo` lo mide y la base de datos calcula el **precio real + envío** (mismas tarifas que la página). El pedido queda **Listo para pagar**.
   - **Sin archivo (diseño a medida, IA):** dice "Con tu vista previa"; la tienda pone el precio desde el Panel.
4. Ve la confirmación con su número de pedido (HG-XXXXXXXX) y lo sigue en **Mis pedidos**.

Envío en EE.UU. por peso (pieza + 100 g): hasta 250 g $6 · hasta 1 kg $9 · hasta 3 kg $15 · más $25. Recoger en Florida: gratis. Se cambia en `private.shipping_cents` (SQL) y en `envio()` de `pedidos.js`.

## Cómo lo atiende la tienda (Panel)

Menú **Panel** (solo aparece para la cuenta dueña de la tienda):

| Estado | Qué haces | El cliente ve |
|---|---|---|
| Por cotizar | Pones precio + envío + mensaje → **Enviar cotización** | Listo para pagar, con el total |
| Por cobrar | Cuando recibes el pago → **Marcar como pagado** | Pagado |
| En curso | **Empezar producción** → **Marcar como enviado** (guía en el mensaje) o **Marcar como entregado** si recoge | Producción / Enviado |
| Cerrados | Entregado o cancelado | — |

- **Descargar archivo**: baja el STL o la foto del cliente (enlace de 5 minutos).
- **Abrir en Studio**: vuelve a generar la pieza con texto del cliente.
- **Enviar mensaje**: le escribe al cliente dentro de su pedido.
- El cliente puede cancelar mientras no haya pagado.

Mientras no esté conectado Stripe, el pago se acuerda en el mensaje de la cotización y se marca a mano. Cuando `payments-config.js` tenga los enlaces de Stripe de los planes, el checkout de planes manda directo al pago.

## Puesta en marcha (una sola vez)

1. `supabase/pedidos.sql` ya está instalado en el proyecto (se puede volver a correr sin problema).
2. El dueño crea su cuenta en hackgorithmic.com y confirma el correo.
3. En Supabase → SQL Editor: `select private.hg_setup('correo-del-dueño');`
   Crea la tienda **hackgorithmic** (activa), la liga a esa cuenta y crea el catálogo de tipos de pedido.

Hasta el paso 3, quien intente pedir ve: "Estamos terminando de abrir la tienda en línea".

## Seguridad

- Las funciones solo las puede usar una cuenta con correo confirmado; nadie anónimo crea, ve ni cambia pedidos.
- Cada cliente solo ve sus pedidos; la tienda solo los de su tienda (RLS).
- El precio lo calcula la base de datos con la medición del archivo (función precio-archivo): la página nunca decide cuánto se cobra. Los diseños a medida los cotiza la tienda.
- Límites: 15 pedidos por persona al día, 40 archivos por persona, 25 MB por archivo (STL, JPG, PNG, WEBP).
- Archivos en el bucket privado `order-files`: solo los ven quien los subió y la tienda.

## Modo prueba

Con el acceso de prueba (`?prueba=…`) todo funciona en ese navegador sin tocar Supabase, y la cuenta de prueba también es la tienda: sirve para ver el checkout, Mis pedidos y el Panel de punta a punta.
