# Lista de seguridad antes del lanzamiento

Hoy el sitio está en **modo prueba** (`accounts-config.js` → `mode: "prueba"`): las cuentas viven solo en el navegador y no piden contraseña. Sirve para probar la página. **No se lanza a clientes así.** Marca cada punto antes de publicar la versión final.

## Estado actual (27 sep 2026)
Proyecto Supabase `hackgorithmic-marketplace` (ref `bovifetqjprdylrlldct`) conectado:
- [x] `schema.sql` aplicado (tablas `models`, `ai_jobs`, RLS, cuotas, bucket privado `ai-models`). Las tablas del marketplace (`stores`, `products`, `orders`, `order_items`, `profiles`) no se tocaron.
- [x] Site URL `https://hackgorithmic.com`; Redirect URLs `https://hackgorithmic.com`, `https://www.hackgorithmic.com` y **`http://127.0.0.1:8765` (TEMPORAL para pruebas: quitar antes del lanzamiento)**.
- [x] Confirm email activado · Secure email change y Secure password change activados · mínimo 8 con letras y números · anónimos desactivados.
- [x] `accounts-config.js` en `mode: "produccion"` con la clave pública; CSP fijada a `bovifetqjprdylrlldct.supabase.co`.
- [x] Función `generar-3d` desplegada (responde `not_configured` hasta poner `TRIPO_API_KEY`).
- [ ] **SMTP propio** (sin esto, el correo de confirmación solo llega a miembros del equipo de Supabase, no a clientes).
- [ ] **CAPTCHA Turnstile**.
- [ ] `TRIPO_API_KEY` como secreto.

## A. Login seguro (obligatorio)
- [ ] `supabase/schema.sql` ejecutado completo en el SQL Editor (tablas, RLS, cuotas).
- [ ] Authentication → URL Configuration: Site URL `https://hackgorithmic.com`; Redirect URLs solo `https://hackgorithmic.com` y `https://www.hackgorithmic.com`.
- [ ] Confirm email **activado**; Secure email change y Secure password change **activados**.
- [ ] Contraseña mínima de **8**, con **letras y números**, en Supabase (el sitio exige lo mismo y lo explica).
- [ ] **SMTP propio** configurado y probado: llega el correo de confirmación y el de recuperar contraseña.
- [ ] **CAPTCHA (Turnstile) OBLIGATORIO**: activado en Attack Protection y `captcha.siteKey` puesto en `accounts-config.js`. Sin él, la consola muestra `Producción SIN CAPTCHA`.
- [ ] Leaked password protection activado (si el plan lo permite).
- [ ] `accounts-config.js`: `mode: "produccion"`, `url` y `anonKey` **pública** (nunca `service_role` / `secret`).
- [ ] En `index.html`, línea `Content-Security-Policy`: cambiar `https://*.supabase.co` y `wss://*.supabase.co` por `https://TU-PROYECTO.supabase.co` y `wss://TU-PROYECTO.supabase.co`.
- [ ] Prueba real: crear cuenta → confirmar correo → entrar → guardar un modelo → cerrar sesión → recuperar contraseña (pide la nueva) → entrar con la nueva.
- [ ] **RLS comprobado contra la API** (la página ya filtra por usuario, así que probar desde la página no sirve). Con la sesión de la cuenta B abierta, en la consola del navegador:
  ```js
  const t = await HGAuth.token(), h = { apikey: 'TU_ANON_KEY', Authorization: 'Bearer ' + t };
  await (await fetch('https://TU-PROYECTO.supabase.co/rest/v1/models?select=user_id', { headers: h })).json();   // solo el id de B
  await (await fetch('https://TU-PROYECTO.supabase.co/rest/v1/ai_jobs?select=user_id', { headers: h })).json();  // solo el id de B
  await (await fetch('https://TU-PROYECTO.supabase.co/rest/v1/models', { headers: { apikey: 'TU_ANON_KEY' } })).json(); // []
  (await fetch('https://TU-PROYECTO.supabase.co/rest/v1/rpc/reserve_ai_job', { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: '{}' })).status; // 401/403/404, nunca 200
  ```
- [ ] Database → **Security Advisor** sin errores de RLS.
- [ ] La consola del navegador no muestra `[hackgorithmic] Cuentas desactivadas`.

## B. Generador con IA (si se activa)
- [ ] Créditos de Tripo bajos o con tope de gasto.
- [x] Función `generar-3d` desplegada. "Verify JWT with legacy secret" **apagado** (recomendación de Supabase con llaves nuevas): la función valida la sesión con `auth.getUser` antes de hacer nada.
- [ ] Secretos: `TRIPO_API_KEY`, `DAILY_LIMIT`, `GLOBAL_DAILY_LIMIT`, `IP_DAILY_LIMIT`, `SITE_ORIGIN`, `MODEL_HOSTS`.
- [ ] Storage: existe el bucket **privado** `ai-models` (lo crea `schema.sql`).
- [ ] Prueba: una generación funciona; la sexta del día devuelve "límite"; una cuenta sin confirmar recibe "confirma tu correo"; una cuenta creada hoy recibe "tu cuenta es nueva" (la IA se activa a las 24 h).
- [ ] Revisar Edge Functions → Logs la primera semana.

## C. Página
- [ ] La etiqueta "Modo prueba" ya **no** aparece arriba a la derecha.
- [ ] La consola del navegador no muestra errores de `Content-Security-Policy` ni de `integrity`.
- [ ] Si se agrega un servicio externo nuevo, se añadió a la línea `Content-Security-Policy` de `index.html`.

## Lo que ya está hecho en el código
- Modo estricto: un `mode` mal escrito, claves en modo prueba o una clave secreta **bloquean** las cuentas en vez de abrir el modo prueba.
- Inicio de sesión con flujo **PKCE**: sin tokens en la URL; los enlaces de correo se abren en el mismo navegador.
- "Olvidé mi contraseña" pide y guarda una contraseña nueva.
- Librerías con versión fija y verificación de integridad (SRI). Política CSP **sin scripts en línea** (`'unsafe-inline'` eliminado para scripts): solo se ejecutan los archivos del sitio y las rutas exactas de supabase-js 2.117.2, three.js r128 y Turnstile. Los estilos en línea siguen permitidos.
- Aviso de privacidad correcto en registro y en "Entrar", con página `privacidad.html`.
- La vista previa vieja `nuevo-diseno.html` ya no se publica.
- Todo lo que viene de la cuenta se limpia y se escapa antes de mostrarse; los modelos guardados tienen tamaño máximo y hay 200 por persona.
- Generador: cupo reservado de forma atómica antes de gastar créditos; límites por persona, por IP y global; cuentas con menos de 24 h no usan la IA; solo correos confirmados; los usuarios no pueden escribir en la tabla de trabajos; consultas medidas (1 cada 2 s, 400 por trabajo); el modelo se descarga de Tripo una vez, se guarda en Storage privado y se entrega con enlaces firmados de 5 minutos (máx. 5 descargas); errores genéricos hacia el navegador.
- Al cerrar sesión o cambiar de cuenta se borra el trabajo en pantalla y se descarta cualquier proceso en curso del usuario anterior; los modelos solo se guardan en la cuenta de quien los empezó.

## Mejoras futuras (no bloquean el lanzamiento)
- Quitar `'unsafe-inline'` también de estilos (mover los `style="..."` a clases).
- Revisar `privacidad.html` con un abogado antes de activar Google (`google: true`).
