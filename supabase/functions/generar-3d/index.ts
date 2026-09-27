// Supabase Edge Function "generar-3d": texto → modelo 3D con la API de Tripo.
// Secretos (Edge Functions → Secrets): TRIPO_API_KEY (obligatorio), DAILY_LIMIT (por persona, 5),
// GLOBAL_DAILY_LIMIT (todo el sitio, 50), IP_DAILY_LIMIT (por dirección IP, 10),
// SITE_ORIGIN (orígenes permitidos separados por coma), MODEL_HOSTS (opcional: dominios de los .glb de Tripo).
// SUPABASE_URL y la llave de servidor (SUPABASE_SERVICE_ROLE_KEY o SUPABASE_SECRET_KEYS) las pone Supabase y NUNCA salen de aquí.
//   POST {prompt}          → { task }             reserva cupo (atómico, en la base de datos) y crea el trabajo
//   GET  ?task=ID          → { status, progress } consulta medida (máx. 1 cada 2 s, 400 por trabajo)
//   GET  ?task=ID&file=1   → { url }              enlace firmado de 5 min al .glb guardado en Storage
// "Verify JWT with legacy secret" APAGADO en Settings: esta función valida la sesión con auth.getUser antes de hacer nada.
import { createClient } from "npm:@supabase/supabase-js@2.117.2";

const TRIPO = "https://api.tripo3d.ai/v2/openapi";
const BUCKET = "ai-models";
const TASK_RE = /^[\w-]{6,80}$/;
const MAX_MODEL_BYTES = 50 * 1024 * 1024;
const ORIGINS = (Deno.env.get("SITE_ORIGIN") ?? "https://hackgorithmic.com,https://www.hackgorithmic.com")
  .split(",").map((s) => s.trim()).filter(Boolean);
const MODEL_HOSTS = (Deno.env.get("MODEL_HOSTS") ?? "")
  .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

/* Llave de servidor: la clásica (service_role) o, en proyectos con llaves nuevas, la primera "secret". Nunca sale de aquí. */
function serviceKey(): string | null {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try {
    const m = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}") as Record<string, string>;
    return m.default ?? Object.values(m)[0] ?? null;
  } catch { return null; }
}

function intEnv(name: string, def: number): number | null {
  const raw = Deno.env.get(name);
  const n = raw === undefined || raw === "" ? def : Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null; // mal configurado → null → la función se niega (falla cerrado)
}

function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGINS.includes(origin) ? origin : ORIGINS[0],
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "600",
  };
}

/* Descarga con límite de tiempo para los encabezados, por inactividad y total, y tope de tamaño. */
async function download(url: URL): Promise<Uint8Array | null> {
  const ac = new AbortController();
  const total = setTimeout(() => ac.abort(), 120_000);
  let idle = setTimeout(() => ac.abort(), 30_000);
  const arm = () => { clearTimeout(idle); idle = setTimeout(() => ac.abort(), 30_000); };
  try {
    const f = await fetch(url, { redirect: "error", signal: ac.signal });
    if (!f.ok || !f.body) { await f.body?.cancel(); return null; }
    if (Number(f.headers.get("content-length") ?? "0") > MAX_MODEL_BYTES) { await f.body.cancel(); return null; }
    const parts: Uint8Array[] = []; let seen = 0;
    const reader = f.body.getReader();
    for (;;) {
      arm();
      const { done, value } = await reader.read();
      if (done) break;
      seen += value.byteLength;
      if (seen > MAX_MODEL_BYTES) { await reader.cancel(); return null; }
      parts.push(value);
    }
    const out = new Uint8Array(seen); let o = 0;
    for (const p of parts) { out.set(p, o); o += p.byteLength; }
    return out;
  } catch (e) { console.error("generar-3d: descarga del modelo", e); return null; }
  finally { clearTimeout(total); clearTimeout(idle); }
}

Deno.serve(async (req: Request) => {
  const cors = corsFor(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const USER_LIMIT = intEnv("DAILY_LIMIT", 5);
  const GLOBAL_LIMIT = intEnv("GLOBAL_DAILY_LIMIT", 50);
  const IP_LIMIT = intEnv("IP_DAILY_LIMIT", 10);
  const key = Deno.env.get("TRIPO_API_KEY");
  const url = Deno.env.get("SUPABASE_URL");
  const service = serviceKey();
  if (!key || !url || !service || !USER_LIMIT || !GLOBAL_LIMIT || !IP_LIMIT) {
    console.error("generar-3d: configuración incompleta o límites inválidos");
    return json({ error: "not_configured" }, 503);
  }

  // Cliente de servidor: solo se usa DESPUÉS de verificar al usuario y siempre filtrando por su id.
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "auth" }, 401);
  const { data: { user }, error: authErr } = await admin.auth.getUser(jwt);
  if (authErr || !user) return json({ error: "auth" }, 401);
  if (!user.email_confirmed_at) return json({ error: "confirm" }, 403);

  const H = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  const tripo = (path: string, init: RequestInit = {}) =>
    fetch(`${TRIPO}${path}`, { ...init, headers: H, signal: AbortSignal.timeout(20_000) });

  if (req.method === "POST") {
    let body: { prompt?: unknown } = {};
    try { body = await req.json(); } catch { return json({ error: "prompt" }, 400); }
    const p = typeof body.prompt === "string" ? body.prompt.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 400) : "";
    if (p.length < 3) return json({ error: "prompt" }, 400);
    // IP real: la da Cloudflare (cf-connecting-ip); si no, el ÚLTIMO valor de x-forwarded-for (el primero lo controla el cliente).
    const xff = (req.headers.get("x-forwarded-for") ?? "").split(",").map((v) => v.trim()).filter(Boolean);
    const ip = (req.headers.get("cf-connecting-ip") ?? xff[xff.length - 1] ?? "unknown").trim().slice(0, 64) || "unknown";

    // Reserva atómica ANTES de gastar créditos: cuenta con más de 24 h, cupo por persona, por IP y global.
    const { data: jobId, error: rErr } = await admin.rpc("reserve_ai_job", {
      p_user: user.id, p_prompt: p, p_ip: ip, p_user_limit: USER_LIMIT, p_global_limit: GLOBAL_LIMIT, p_ip_limit: IP_LIMIT,
    });
    if (rErr || !jobId) {
      const m = rErr?.message ?? "";
      if (m.includes("limit_new")) return json({ error: "new" }, 403);
      if (m.includes("limit_user")) return json({ error: "limit", limit: USER_LIMIT }, 429);
      if (m.includes("limit_global") || m.includes("limit_ip")) return json({ error: "busy" }, 429);
      console.error("generar-3d: reserve_ai_job", rErr);
      return json({ error: "unavailable" }, 503);
    }

    let task: string | null = null, rejected = false;
    try {
      const r = await tripo("/task", { method: "POST", body: JSON.stringify({ type: "text_to_model", prompt: p }) });
      const j = await r.json().catch(() => ({}));
      task = r.ok && typeof j?.data?.task_id === "string" ? j.data.task_id : null;
      if (!task) { rejected = !r.ok; console.error("generar-3d: Tripo rechazó la tarea", r.status, j?.code, j?.message); }
    } catch (e) { console.error("generar-3d: Tripo no respondió", e); }

    if (!task || !TASK_RE.test(task)) {
      // Rechazo claro de Tripo (sin cobro): se devuelve el cupo. Si no hubo respuesta (pudo cobrar), cuenta como fallido.
      if (rejected) await admin.from("ai_jobs").delete().eq("id", jobId).eq("user_id", user.id);
      else await admin.from("ai_jobs").update({ status: "failed" }).eq("id", jobId).eq("user_id", user.id);
      return json({ error: "provider" }, 502);
    }
    const { error: uErr } = await admin.from("ai_jobs").update({ status: "running", task_id: task }).eq("id", jobId).eq("user_id", user.id);
    if (uErr) { console.error("generar-3d: no se pudo registrar la tarea", uErr); return json({ error: "unavailable" }, 503); }
    return json({ task });
  }

  if (req.method !== "GET") return json({ error: "method" }, 405);
  const u = new URL(req.url);
  const task = u.searchParams.get("task") ?? "";
  const wantFile = !!u.searchParams.get("file");
  if (!TASK_RE.test(task)) return json({ error: "task" }, 400);

  const { data: job, error: oErr } = await admin.from("ai_jobs").select("id,status,model_path").eq("task_id", task).eq("user_id", user.id).maybeSingle();
  if (oErr) { console.error("generar-3d: consulta de dueño", oErr); return json({ error: "unavailable" }, 503); }
  if (!job) return json({ error: "not_found" }, 404);

  // Medidor: limita consultas y descargas por trabajo (en la base de datos, atómico).
  const { data: touched, error: tErr } = await admin.rpc("touch_ai_job", { p_user: user.id, p_task: task, p_file: wantFile });
  if (tErr) { console.error("generar-3d: touch_ai_job", tErr); return json({ error: "unavailable" }, 503); }
  if (!Array.isArray(touched) || !touched.length) return json({ error: "throttle" }, 429);

  const signed = async (path: string) => {
    const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, 300);
    if (error || !data?.signedUrl) { console.error("generar-3d: enlace firmado", error); return json({ error: "unavailable" }, 503); }
    return json({ url: data.signedUrl });
  };
  if (wantFile && job.model_path) return await signed(job.model_path);
  if (!wantFile && job.status === "success") return json({ status: "success", progress: 100 });
  if (job.status === "failed") return json({ status: "failed", progress: 0 });

  let d: Record<string, any> = {};
  try {
    const r = await tripo(`/task/${encodeURIComponent(task)}`);
    const j = await r.json().catch(() => ({}));
    d = (j && typeof j.data === "object" && j.data) || {};
  } catch (e) { console.error("generar-3d: estado de Tripo", e); return json({ error: "provider" }, 502); }
  const st = typeof d.status === "string" ? d.status : "unknown";
  if (st === "success" && job.status !== "success") await admin.from("ai_jobs").update({ status: "success" }).eq("id", job.id);
  if (/failed|cancel|banned|expired/.test(st) && job.status !== "failed") await admin.from("ai_jobs").update({ status: "failed" }).eq("id", job.id);

  if (!wantFile) return json({ status: st, progress: Number(d.progress) || 0 });

  // Primera descarga: se trae UNA vez desde Tripo, se guarda en Storage privado y se entrega con enlace firmado.
  const out = d.output ?? {};
  const model = out.pbr_model ?? out.model ?? out.base_model ?? null;
  if (st !== "success" || typeof model !== "string") return json({ error: "not_ready" }, 409);
  let mu: URL;
  try { mu = new URL(model); } catch { return json({ error: "provider_file" }, 502); }
  const hostOk = !MODEL_HOSTS.length || MODEL_HOSTS.some((h) => mu.hostname === h || mu.hostname.endsWith("." + h));
  if (mu.protocol !== "https:" || !hostOk) { console.error("generar-3d: host de modelo no permitido", mu.hostname); return json({ error: "provider_file" }, 502); }
  const bytes = await download(mu);
  if (!bytes) return json({ error: "provider_file" }, 502);
  const path = `${user.id}/${task}.glb`;
  const { error: upErr } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: "model/gltf-binary", upsert: true });
  if (upErr) { console.error("generar-3d: guardar en Storage", upErr); return json({ error: "unavailable" }, 503); }
  await admin.from("ai_jobs").update({ model_path: path }).eq("id", job.id);
  return await signed(path);
});
