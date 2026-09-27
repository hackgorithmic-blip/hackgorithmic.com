// Supabase Edge Function "precio-archivo": mide el STL que la persona subió al bucket privado "order-files"
// (volumen en cm³ y medidas en mm) y guarda la medición en public.print_quotes. El PRECIO lo calcula la base de datos
// (quote_total / create_order, con private.print_price): así el navegador nunca decide cuánto se cobra.
//   POST {path}  →  { quote, volume_cm3, size_mm }      path = "<uid de la persona>/<nombre>.stl"
// "Verify JWT with legacy secret" APAGADO en Settings: esta función valida la sesión con auth.getUser antes de hacer nada.
// SITE_ORIGIN (opcional): orígenes permitidos separados por coma. SUPABASE_URL y la llave de servidor las pone Supabase.
import { createClient } from "npm:@supabase/supabase-js@2.117.2";

const BUCKET = "order-files";
const MAX_BYTES = 25 * 1024 * 1024;
const MAX_MM = 265;            // cama de la impresora: más grande se pide como diseño a medida
const HOURLY_LIMIT = 40;       // mediciones por persona por hora
const ORIGINS = (Deno.env.get("SITE_ORIGIN") ?? "https://hackgorithmic.com,https://www.hackgorithmic.com")
  .split(",").map((s) => s.trim()).filter(Boolean);

function serviceKey(): string | null {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try {
    const m = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}") as Record<string, string>;
    return m.default ?? Object.values(m)[0] ?? null;
  } catch { return null; }
}

function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGINS.includes(origin) ? origin : ORIGINS[0],
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "600",
  };
}

/* Mide un STL binario o de texto: volumen (fórmula del tetraedro con signo) y caja que lo contiene. Igual que app.js. */
function measure(buf: ArrayBuffer): { cm3: number; size: number[] } {
  const dv = new DataView(buf);
  const n0 = buf.byteLength >= 84 ? dv.getUint32(80, true) : 0;
  const fit = Math.max(0, Math.floor((buf.byteLength - 84) / 50));
  const head = new TextDecoder().decode(buf.slice(0, Math.min(1024, buf.byteLength)));
  const ascii = /^\s*solid/.test(head) && /facet|vertex/.test(head);
  const n = n0 > 0 && n0 <= fit ? n0 : fit;
  let vol = 0, tris = 0;
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  const add = (a: number[]) => {
    if (!a.every(Number.isFinite)) throw new Error("coords");
    vol += (a[0] * (a[4] * a[8] - a[5] * a[7]) - a[1] * (a[3] * a[8] - a[5] * a[6]) + a[2] * (a[3] * a[7] - a[4] * a[6])) / 6;
    for (let k = 0; k < 9; k++) { const ax = k % 3; if (a[k] < mn[ax]) mn[ax] = a[k]; if (a[k] > mx[ax]) mx[ax] = a[k]; }
    tris++;
  };
  if (buf.byteLength >= 134 && (buf.byteLength === 84 + n0 * 50 || !ascii)) {
    for (let i = 0; i < n; i++) {
      const o = 84 + i * 50 + 12, v: number[] = [];
      for (let k = 0; k < 9; k++) v.push(dv.getFloat32(o + k * 4, true));
      add(v);
    }
  } else {
    const t = new TextDecoder().decode(buf);
    const re = /vertex\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)/g;
    let m: RegExpExecArray | null, v: number[] = [];
    while ((m = re.exec(t))) { v.push(+m[1], +m[2], +m[3]); if (v.length === 9) { add(v); v = []; } }
    if (v.length) throw new Error("incomplete");
  }
  const size = mx.map((x, i) => x - mn[i]);
  const cm3 = Math.abs(vol) / 1000;
  if (!tris || !Number.isFinite(cm3) || cm3 <= 0 || !size.every((x) => Number.isFinite(x) && x > 0)) throw new Error("geometry");
  return { cm3: Math.round(cm3 * 1000) / 1000, size: size.map((x) => Math.round(x * 10) / 10) };
}

Deno.serve(async (req) => {
  const cors = corsFor(req);
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const url = Deno.env.get("SUPABASE_URL"), key = serviceKey();
  if (!url || !key) return json({ error: "not_configured" }, 503);
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "auth" }, 401);
  const { data: who } = await admin.auth.getUser(jwt);
  const user = who?.user;
  if (!user) return json({ error: "auth" }, 401);
  if (!user.email_confirmed_at) return json({ error: "confirm" }, 403);

  let body: { path?: unknown };
  try { body = await req.json(); } catch { return json({ error: "path" }, 400); }
  const path = typeof body.path === "string" ? body.path : "";
  if (!new RegExp("^" + user.id + "/[A-Za-z0-9_-]{8,80}\\.stl$").test(path)) return json({ error: "path" }, 400);

  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await admin.from("print_quotes").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("created_at", since);
  if ((count ?? 0) >= HOURLY_LIMIT) return json({ error: "limit" }, 429);

  const { data: file, error: dlErr } = await admin.storage.from(BUCKET).download(path);
  if (dlErr || !file) return json({ error: "file" }, 404);
  if (file.size > MAX_BYTES) return json({ error: "size" }, 413);

  let m: { cm3: number; size: number[] };
  try { m = measure(await file.arrayBuffer()); } catch { return json({ error: "stl" }, 422); }
  if (Math.max(...m.size) > MAX_MM) return json({ error: "too_big", size_mm: m.size }, 422);
  if (m.cm3 > 20000) return json({ error: "too_big", size_mm: m.size }, 422);

  const { data: q, error: insErr } = await admin.from("print_quotes")
    .insert({ user_id: user.id, file: path, volume_cm3: m.cm3, size_mm: m.size }).select("id").single();
  if (insErr || !q) return json({ error: "save" }, 500);
  return json({ quote: q.id, volume_cm3: m.cm3, size_mm: m.size });
});
