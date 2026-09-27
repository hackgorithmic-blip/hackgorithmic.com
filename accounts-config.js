/* Configuración PÚBLICA de cuentas. Todo lo que está aquí lo puede ver cualquier visitante.
 * Nunca pongas aquí la clave service_role ni ninguna clave "secret".
 * Guía de lanzamiento: entrega/SEGURIDAD.md · Pasos de Supabase: entrega/CUENTAS.md
 */
window.HACKGORITHMIC_ACCOUNTS = {
  /* "prueba":     cuentas solo en el navegador, sin contraseña (para probar la página). NO usar con clientes reales.
   * "produccion": cuentas reales y seguras en Supabase. Requiere url + anonKey.
   * Cualquier otro valor, o "prueba" con url/anonKey puestos, BLOQUEA las cuentas (falla cerrado). */
  mode: "produccion",
  url: "https://bovifetqjprdylrlldct.supabase.co",
  anonKey: "sb_publishable_nVMfMP7bH11961aUOLLIPw_4TgM3ZNn",   // clave PÚBLICA (publishable): segura en el navegador con RLS
  google: false,    // true solo después de activar Google en Supabase
  /* CAPTCHA contra registros masivos (recomendado en producción): Cloudflare Turnstile.
   * Pon aquí la "site key" pública y la "secret key" en Supabase → Authentication → Attack Protection. */
  captcha: { siteKey: "" },
  /* Acceso de prueba del dueño: abrir https://hackgorithmic.com/?prueba=CÓDIGO entra a una cuenta de prueba
   * SOLO en esa pestaña, sin registrarse y sin tocar Supabase. Aquí va solo la huella SHA-256 del código. */
  testAccess: { codeHash: "9abe5ff29559ef42b0ca77e5a59c9d7296f45bfe21b3c0062f12d3acee2c42f8" },
  /* Generador 3D con IA. URL de la función "generar-3d", p. ej. https://TU-PROYECTO.supabase.co/functions/v1/generar-3d
   * Si la IA no puede atender (sin clave de Tripo, límite, cuenta nueva) la idea se ofrece al equipo. Vacío = desactivado. */
  ai: { endpoint: "https://bovifetqjprdylrlldct.supabase.co/functions/v1/generar-3d" }
};
