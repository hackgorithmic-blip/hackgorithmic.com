# Publicar h: Studio en hackgorithmic.com

La web está en GitHub Pages (hackgorithmic-blip.github.io, con dominio hackgorithmic.com).

1. Copia esta carpeta completa al repositorio de la web como `h-studio/`
   (debe quedar `h-studio/index.html`, `h-studio/app.js`, `h-studio/manifold.wasm`, etc.).
2. Agrega la pestaña en el menú de `index.html`, dentro de `<nav class="shader-nav" ...>`, después de "Studio":

       <a href="h-studio/">h: Studio β</a>

3. Haz commit y push. En 1-2 minutos queda en https://hackgorithmic.com/h-studio/

Notas
- La página tiene su propia política de seguridad (CSP). Permite 'unsafe-eval' y 'wasm-unsafe-eval'
  SOLO en esta página, porque el motor Manifold (WebAssembly) lo necesita. El resto del sitio no cambia.
- Tiene `noindex`: Google no la muestra hasta que la abramos al público.
- La IA queda apagada hasta poner la URL del servidor en `config.js` (endpoint). Plantillas, Imagen y Taller ya funcionan.
