# Cuentas de usuario y generador 3D (Supabase)

Cómo funciona hoy:
- Botón **Crear cuenta / Mis modelos** en la barra. **Estudio 3D**, **Tu idea, aquí**, **Generar** y **Descargar STL** piden cuenta.
- Cada modelo creado en el Taller se guarda en la cuenta ("Mis modelos").
- El **llavero con nombre** es un pedido que ustedes imprimen y envían: no pide cuenta.

## Los dos modos (`accounts-config.js` → `mode`)

| mode | Qué hace | Cuándo |
|---|---|---|
| `"prueba"` | Cuenta y modelos solo en el navegador de cada persona, sin contraseña. **No te llega ningún dato.** Muestra la etiqueta "Modo prueba". | Mientras pruebas la página. |
| `"produccion"` | Cuentas reales en Supabase: contraseña, confirmación por correo, recuperar contraseña, entrar desde cualquier dispositivo. | Lanzamiento. |

Si `mode` tiene cualquier otro valor, o está en `"prueba"` con `url`/`anonKey` puestos, o la clave pegada no es la pública, **las cuentas se bloquean** ("Cuentas no disponibles") en vez de caer al modo prueba. Al pasar a producción, las cuentas de prueba guardadas en los navegadores se borran solas.

## Pasar a producción (≈ 30 minutos)

### 1. Proyecto
1. Crea una cuenta y un proyecto en https://supabase.com.
2. **SQL Editor → New query**: pega **todo** `supabase/schema.sql` y pulsa **Run**. Crea las tablas, las reglas de acceso (RLS), el límite de 200 modelos por persona y la reserva atómica del generador.

### 2. Autenticación (Authentication)
1. **URL Configuration**
   - Site URL: `https://hackgorithmic.com`
   - Redirect URLs: `https://hackgorithmic.com` y `https://www.hackgorithmic.com` (y nada más).
2. **Sign In / Providers → Email**
   - **Confirm email: ACTIVADO** (obligatorio).
   - **Secure email change** y **Secure password change: ACTIVADOS**.
   - **Minimum password length: 8** o más. Password requirements: **letras y números** (la página pide exactamente eso).
3. **Emails → SMTP Settings**: configura un SMTP propio (p. ej. Resend, Postmark, SES o Brevo) con un remitente de tu dominio. El correo que trae Supabase envía muy pocos mensajes por hora y los clientes no recibirían la confirmación.
4. **Attack Protection**
   - **CAPTCHA (obligatorio)**: activa Cloudflare Turnstile (gratis en https://dash.cloudflare.com → Turnstile). La *secret key* va aquí; la *site key* va en `accounts-config.js` → `captcha.siteKey`.
   - **Leaked password protection**: actívalo si tu plan lo incluye (plan Pro).
5. **Rate Limits**: revisa que envíos de correo, registros e inicios de sesión tengan límites bajos (los valores por defecto están bien para empezar).
6. Opcional **Google**: Providers → Google con el Client ID/Secret de Google Cloud; después `google: true`.

### 3. Llaves en el sitio
**Project Settings → API Keys**: copia la **Project URL** y la clave **anon / publishable** (nunca `service_role` ni `secret`). En `accounts-config.js`:

```js
window.HACKGORITHMIC_ACCOUNTS = {
  mode: "produccion",
  url: "https://TU-PROYECTO.supabase.co",
  anonKey: "eyJ...",          // o sb_publishable_...
  google: false,
  captcha: { siteKey: "0x4AAAA..." },
  ai: { endpoint: "" }        // paso 4
};
```

En `index.html`, línea `Content-Security-Policy`, cambia `https://*.supabase.co` y `wss://*.supabase.co` por los de tu proyecto (`https://TU-PROYECTO.supabase.co`, `wss://TU-PROYECTO.supabase.co`). Si usas un dominio propio para Supabase, pon ese.

### 4. Generador 3D con IA (opcional)
Requiere una clave de la API de Tripo (https://platform.tripo3d.ai, se paga por créditos).
1. **En Tripo**: carga pocos créditos o pon un tope de gasto. Es la última barrera contra abusos.
2. **Edge Functions → Deploy a new function** → nombre `generar-3d` → pega `supabase/functions/generar-3d/index.ts` → Deploy. En Settings deja **"Verify JWT with legacy secret" apagado**: la función valida la sesión por su cuenta.
3. **Edge Functions → Secrets**:
   - `TRIPO_API_KEY` = tu clave de Tripo (obligatoria)
   - `DAILY_LIMIT` = modelos por persona cada 24 h (por defecto 5)
   - `GLOBAL_DAILY_LIMIT` = modelos para todo el sitio cada 24 h (por defecto 50)
   - `IP_DAILY_LIMIT` = modelos por dirección IP cada 24 h (por defecto 10)
   - `SITE_ORIGIN` = `https://hackgorithmic.com,https://www.hackgorithmic.com`
   - `MODEL_HOSTS` (recomendado): el dominio desde donde Tripo entrega los .glb. Lo ves en los logs de la primera generación.
4. En `accounts-config.js`: `ai: { endpoint: "https://TU-PROYECTO.supabase.co/functions/v1/generar-3d" }`.
5. Prueba con una idea ("un dragón pequeño") y revisa **Edge Functions → Logs**. La función no se ha probado todavía contra la API real de Tripo.

Solo cuentas con **correo confirmado y más de 24 horas** pueden usar el generador. El cupo se reserva en la base de datos **antes** de gastar créditos, y los intentos fallidos también cuentan. Los modelos terminados se guardan en el bucket privado `ai-models` (lo crea `schema.sql`) y se entregan con enlaces firmados de 5 minutos.

### Ver a tus clientes
- **Authentication → Users**: cada cuenta (nombre en `user_metadata.name`).
- **Table Editor → models / ai_jobs**: lo que ha creado cada persona.
- Si alguien pide borrar sus datos: borra su usuario en Authentication → Users (sus modelos y trabajos se borran con él).
