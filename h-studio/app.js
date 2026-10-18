const H_WASM = "";
const H_FONT = "";
(function(){
const $ = id => document.getElementById(id);
const BED = [270, 270, 270];
const PALETTE = ['#7c55ea', '#2fb39a', '#e0813f', '#d8487a', '#4b8fe0', '#c9b33b'];
const state = {
  mode: 'design', design: null, values: {}, history: [], parts: null, lastError: null, tpl: -1,
  photo: null, ctl: null, info: null,
  shop: { src: null, base: null, name: '', rot: [0, 0, 0], axis: 'max', mm: 100, cut: 0, mark: true, split: true, pins: true, cuts: [], parts: null, res: null },
  logo: null, lit: null
};

/* ================= 3D view ================= */
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 0.5, 6000);
camera.up.set(0, 0, 1);
const controls = new THREE.OrbitControls(camera, canvas);
controls.enableDamping = true;
scene.add(new THREE.HemisphereLight(0xffffff, 0x5a4a80, 0.7));
const sun = new THREE.DirectionalLight(0xffffff, 0.75); sun.position.set(160, -220, 260); scene.add(sun);
const rim = new THREE.DirectionalLight(0xffffff, 0.35); rim.position.set(-220, 180, 90); scene.add(rim);
const under = new THREE.DirectionalLight(0xffffff, 0.2); under.position.set(0, 0, -300); scene.add(under);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
let bedGroup = null; const partGroup = new THREE.Group(); scene.add(partGroup);
function buildBed(){
  if (bedGroup) scene.remove(bedGroup);
  bedGroup = new THREE.Group();
  const gc = new THREE.Color(css('--plate-grid'));
  const grid = new THREE.GridHelper(BED[0], 27, gc, gc); grid.rotation.x = Math.PI / 2; bedGroup.add(grid);
  const g = new THREE.BufferGeometry().setFromPoints([[-1,-1],[1,-1],[1,1],[-1,1],[-1,-1]].map(([x,y]) => new THREE.Vector3(x*BED[0]/2, y*BED[1]/2, 0)));
  bedGroup.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: new THREE.Color(css('--muted')) })));
  bedGroup.position.z = -0.25; scene.add(bedGroup);
}
function applyTheme(){ scene.background = new THREE.Color(css('--plate')); buildBed(); if (state.parts) showParts(state.parts, false); }
applyTheme();
try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme); } catch(e){}
new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
function resize(){ const r = canvas.parentElement.getBoundingClientRect(); renderer.setSize(r.width, r.height, false); camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix(); }
new ResizeObserver(resize).observe(canvas.parentElement); resize();
(function loop(){ controls.update(); renderer.render(scene, camera); requestAnimationFrame(loop); })();
let bbox = [[-40,-40,0],[40,40,40]];
function viewDir(view){ return view === 'front' ? new THREE.Vector3(0, -1, 0.06) : view === 'top' ? new THREE.Vector3(0, -0.001, 1) : view === 'bot' ? new THREE.Vector3(0, -0.001, -1) : view === 'side' ? new THREE.Vector3(1, 0, 0.06) : new THREE.Vector3(0.9, -1.25, 0.95); }
function frame(view){
  const bb = bbox, c = new THREE.Vector3((bb[0][0]+bb[1][0])/2, (bb[0][1]+bb[1][1])/2, (bb[0][2]+bb[1][2])/2);
  const size = Math.max(bb[1][0]-bb[0][0], bb[1][1]-bb[0][1], bb[1][2]-bb[0][2], 20);
  camera.position.copy(c.clone().add(viewDir(view).normalize().multiplyScalar(size * 2.4)));
  controls.target.copy(c); controls.update();
  if (bedGroup) bedGroup.visible = view !== 'bot';
}
$('v-iso').onclick = () => frame('iso'); $('v-front').onclick = () => frame('front'); $('v-top').onclick = () => frame('top'); $('v-bot').onclick = () => frame('bot');
function colorFor(p, i){ return p.color ? p.color : (i === 0 ? css('--part') : PALETTE[i % PALETTE.length]); }
function showParts(parts, fit){
  partGroup.children.slice().forEach(m => { partGroup.remove(m); m.geometry.dispose(); m.material.dispose(); });
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  parts.forEach((p, i) => {
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(p.positions, 3)); geo.computeVertexNormals(); geo.computeBoundingBox();
    const b = geo.boundingBox; mn = [Math.min(mn[0], b.min.x), Math.min(mn[1], b.min.y), Math.min(mn[2], b.min.z)]; mx = [Math.max(mx[0], b.max.x), Math.max(mx[1], b.max.y), Math.max(mx[2], b.max.z)];
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(colorFor(p, i)), roughness: 0.55, metalness: 0.04, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat); mesh.position.set(p.offset ? p.offset[0] : 0, p.offset ? p.offset[1] : 0, 0); partGroup.add(mesh);
    if (p.offset) { mn[0] += Math.min(0, p.offset[0]); mx[0] += Math.max(0, p.offset[0]); mn[1] += Math.min(0, p.offset[1]); mx[1] += Math.max(0, p.offset[1]); }
  });
  bbox = [mn, mx];
  $('legend').innerHTML = parts.length > 1 ? parts.map((p, i) => `<span><i style="background:${colorFor(p, i)}"></i>${esc(p.name)}</span>`).join('') : '';
  if (fit) frame('iso');
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/* snapshot of 4 views for the AI reviewer */
function captureViews(){
  const W = 1024, Hh = 768, out = document.createElement('canvas'); out.width = W; out.height = Hh; const ctx = out.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, Hh);
  const savePos = camera.position.clone(), saveT = controls.target.clone(), saveA = camera.aspect, saveBg = scene.background;
  const r = renderer.getSize(new THREE.Vector2()); renderer.setSize(W / 2, Hh / 2, false); camera.aspect = W / Hh; camera.updateProjectionMatrix();
  scene.background = new THREE.Color('#ece9f4');
  [['iso', '3D'], ['front', 'FRENTE (-Y)'], ['top', 'ARRIBA (+Z)'], ['side', 'LADO (+X)']].forEach(([v, label], i) => {
    frame(v); renderer.render(scene, camera);
    ctx.drawImage(renderer.domElement, (i % 2) * W / 2, Math.floor(i / 2) * Hh / 2, W / 2, Hh / 2);
    ctx.fillStyle = '#1d1830'; ctx.font = '600 16px sans-serif'; ctx.fillText(label, (i % 2) * W / 2 + 10, Math.floor(i / 2) * Hh / 2 + 22);
  });
  ctx.strokeStyle = '#9a90b8'; ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, Hh); ctx.moveTo(0, Hh / 2); ctx.lineTo(W, Hh / 2); ctx.stroke();
  scene.background = saveBg; renderer.setSize(r.x, r.y, false); camera.aspect = saveA; camera.updateProjectionMatrix(); camera.position.copy(savePos); controls.target.copy(saveT); controls.update();
  return new Promise(res => out.toBlob(res, 'image/png'));
}

/* ================= common ================= */
const fmt = (n, d=1) => (Math.round(n * 10**d) / 10**d).toLocaleString('es', { minimumFractionDigits: 0, maximumFractionDigits: d });
function setStatus(t){ $('status').textContent = t; }
function busy(on, t){ $('busy').hidden = !on; $('busytxt').textContent = t || 'Pensando…'; }
const nextFrame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
function setParts(parts, name, note, fit){
  state.parts = parts; showParts(parts, fit);
  $('pname').textContent = name || 'Pieza';
  const c = HEngine.checks(parts.map(p => p.positions), BED); state.check = c;
  $('pdims').textContent = fmt(c.size[0]) + ' × ' + fmt(c.size[1]) + ' × ' + fmt(c.size[2]) + ' mm' + (parts.length > 1 ? ' · ' + parts.length + ' partes' : '');
  const ov = c.overhangPct, ovCls = ov < 3 ? 'ok' : ov < 12 ? 'warn' : 'bad';
  const bedCls = c.bedArea > 2 ? 'ok' : c.bedArea > 0.5 ? 'warn' : 'bad';
  $('checks').innerHTML = [
    ['Tamaño', fmt(c.size[0],0)+'×'+fmt(c.size[1],0)+'×'+fmt(c.size[2],0), c.fits ? ['ok','cabe'] : ['bad','no cabe']],
    ['PLA aprox.', fmt(c.grams) + ' g', null],
    ['Voladizos', fmt(ov) + ' %', [ovCls, ov < 3 ? 'bien' : ov < 12 ? 'soportes?' : 'soportes']],
    ['Apoyo en cama', fmt(c.bedArea) + ' cm²', [bedCls, c.bedArea > 2 ? 'firme' : c.bedArea > 0.5 ? 'poco' : 'gíralo']]
  ].map(([k, v, p]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}${p ? `<span class="pill ${p[0]}">${p[1]}</span>` : ''}</div></div>`).join('');
  $('checknote').textContent = (note ? note + ' ' : '') + 'Volumen ' + fmt(c.vol) + ' cm³; el peso supone 3 paredes y 15 % de relleno.';
}

/* ================= tabs ================= */
const TABS = [['t-design', 'p-design', 'design'], ['t-image', 'p-image', 'image'], ['t-shop', 'p-shop', 'shop']];
function selectTab(id){
  TABS.forEach(([t, p]) => { const on = t === id; $(t).setAttribute('aria-selected', on); $(p).hidden = !on; });
  if (id === 't-design' && state.mode !== 'design') { state.mode = 'design'; rebuild(true); }
  if (id === 't-shop' && state.shop.parts && state.mode !== 'shop') { state.mode = 'shop'; setParts(state.shop.parts, state.shop.name, shopNote(), true); }
  try { localStorage.setItem('hstudio.tab', id); } catch(e) {}
}
TABS.forEach(([t]) => $(t).onclick = () => selectTab(t));

/* ================= DISEÑAR ================= */
function rebuild(fit){
  if (!state.design) return;
  const t0 = performance.now();
  try {
    const r = HEngine.evaluate(state.design, state.values);
    state.lastError = null; state.mode = 'design';
    setParts(r.parts, state.design.name, r.autoMark ? 'Marca h: grabada automáticamente (0,6 mm).' : (r.hasMark ? 'Marca h: incluida.' : 'La pieza es muy pequeña para grabar la marca h:.'), fit);
    setStatus('Listo · ' + Math.round(performance.now() - t0) + ' ms');
    $('fixrow').hidden = true;
  } catch (e) {
    state.lastError = String(e && e.message || e);
    setStatus('Error en el modelo');
    showReply('No pude construir la pieza: ' + state.lastError, true);
    $('fixrow').hidden = !sample;
  }
  $('json').value = JSON.stringify(stripAssets(state.design), null, 1);
}
function stripAssets(d){ if (!d || !d.assets) return d; const c = Object.assign({}, d); c.assets = Object.fromEntries(Object.entries(d.assets).map(([k, v]) => [k, v])); return c; }
function renderParams(){
  const box = $('params'); box.innerHTML = '';
  (state.design.params || []).forEach(p => {
    const el = document.createElement('div');
    if (p.type === 'text') {
      el.className = 'param text';
      el.innerHTML = `<label for="tx-${p.id}"></label><input id="tx-${p.id}" maxlength="40">`;
      el.querySelector('label').textContent = p.label || p.id;
      const inp = el.querySelector('input'); inp.value = state.values[p.id] !== undefined ? state.values[p.id] : p.value;
      inp.addEventListener('input', () => { state.values[p.id] = inp.value; schedule(); });
      box.appendChild(el); return;
    }
    const v = state.values[p.id] !== undefined ? state.values[p.id] : HEngine.evalExpr(p.value, {});
    const min = p.min !== undefined ? p.min : 0, max = p.max !== undefined ? p.max : Math.max(10, v * 3), step = p.step || 0.1;
    el.className = 'param';
    el.innerHTML = `<label for="r-${p.id}"></label><input type="range" id="r-${p.id}" min="${min}" max="${max}" step="${step}" value="${v}"><div class="numbox"><input id="n-${p.id}" inputmode="decimal" value="${v}"><span>${esc(p.unit || '')}</span></div>`;
    el.querySelector('label').textContent = p.label || p.id;
    el.querySelector('.numbox input').setAttribute('aria-label', p.label || p.id);
    const r = el.querySelector('input[type=range]'), n = el.querySelector('.numbox input');
    const set = (val, from) => { if (!isFinite(val)) return; state.values[p.id] = val; if (from !== r) r.value = val; if (from !== n) n.value = val; schedule(); };
    r.addEventListener('input', () => set(parseFloat(r.value), r));
    n.addEventListener('change', () => set(parseFloat(n.value.replace(',', '.')), n));
    box.appendChild(el);
  });
  if (!(state.design.params || []).length) box.innerHTML = '<div class="empty">Esta pieza no tiene medidas ajustables.</div>';
}
let timer = null;
function schedule(){ clearTimeout(timer); timer = setTimeout(() => rebuild(false), 120); }
function initialValues(d){ const s = {}; (d.params || []).forEach(p => { s[p.id] = p.type === 'text' ? String(p.value || '') : HEngine.evalExpr(p.value, s); }); return s; }
function loadDesign(d, opts){
  opts = opts || {};
  if (state.design && opts.push !== false) { state.history.push({ design: state.design, values: Object.assign({}, state.values) }); if (state.history.length > 30) state.history.shift(); }
  state.design = d; state.values = opts.values ? Object.assign({}, opts.values) : initialValues(d);
  $('undo').disabled = !state.history.length;
  renderParams(); rebuild(opts.fit !== false);
}
$('undo').onclick = () => { const h = state.history.pop(); if (!h) return; state.design = h.design; state.values = h.values; $('undo').disabled = !state.history.length; renderParams(); rebuild(true); };
$('reset').onclick = () => { if (!state.design) return; state.values = initialValues(state.design); renderParams(); rebuild(false); };
function renderTemplates(){
  $('tpls').innerHTML = '';
  H_TEMPLATES.forEach((t, i) => {
    const b = document.createElement('button'); b.className = 'chip' + (state.tpl === i ? ' on' : ''); b.textContent = t.name; b.title = t.note || '';
    b.onclick = () => { state.tpl = i; renderTemplates(); loadDesign(JSON.parse(JSON.stringify(t))); };
    $('tpls').appendChild(b);
  });
}

/* ----- AI ----- */
let sample = null, canImages = false;
const SPEC = `Eres el motor de diseño de "h: Studio" (marca hackgorithmic). Diseñas piezas para imprimir en 3D en PLA en una Snapmaker U1 (cama 270×270×270 mm, boquilla 0,4 mm, 4 cabezales: hasta 4 colores). Todas las medidas en milímetros.

Responde SOLO con un objeto JSON:
{"name": "nombre corto en español", "reply": "1-3 frases en español: qué hiciste y cómo imprimirla", "params": [{"id":"ancho","label":"Ancho","value":30,"min":10,"max":120,"step":1,"unit":"mm"}], "vars": {"r": "ancho/2"}, "model": NODO}
Para piezas de varios colores usa "parts" en lugar de "model": "parts":[{"name":"Base","color":"#f4f1fa","model":NODO},{"name":"Letras","color":"#6b3fe0","model":NODO}] (máximo 4 partes; que no se solapen: el relieve va encima de la base, tocándola).

params: 3 a 8 medidas que la persona querría ajustar (ids en minúscula sin acentos, labels en español). Un param de texto: {"id":"nombre","label":"Texto","type":"text","value":"José"}; se usa con "t":"$nombre". vars: valores derivados, en orden. Cualquier número puede ser número o texto con expresión: + - * / % ^ ( ), funciones sqrt abs min max round floor ceil sin cos tan asin acos atan atan2 pow hypot (ángulos en grados), pi, y nombres de params/vars.

NODO = objeto con UNA forma y modificadores opcionales. Formas (centradas en el origen; altura en Z):
- {"box":{"size":[x,y,z],"r":radio_opcional}}  con r redondea todas las aristas
- {"rbox":{"size":[x,y,z],"r":radio,"ch":chaflan_opcional}}  solo aristas verticales redondeadas; ch achaflana arriba y abajo
- {"cyl":{"d":diámetro,"h":alto,"d2":diámetro_arriba_opcional,"seg":lados_opcional,"ch":chaflan_opcional}}  seg 6 = hexágono
- {"tube":{"od":ext,"id":int,"h":alto}}   {"sphere":{"d":diámetro}}   {"torus":{"r1":radio_mayor,"r2":radio_tubo}}
- {"poly":{"points":[[x,y],...],"h":alto}}  polígono extruido en Z
- {"shape":{"points":[[x,y],...],"holes":[[[x,y],...]],"h":alto}}  polígono con huecos
- {"revolve":{"points":[[radio,z],...],"angle":360}}  perfil girado alrededor de Z
- {"thread":{"d":diámetro_nominal,"pitch":paso,"h":largo}}  rosca métrica exterior real (M6 paso 1, M8 1.25, M10 1.5, M12 1.75). Para rosca interior (tuerca) pon "internal":true y "clearance":0.3 dentro de un "diff".
- {"text":{"t":"Texto","size":alto_mayúsculas,"h":grosor,"fit":[ancho_max,alto_max]}}  fuente Bricolage Grotesque, acepta acentos y ñ; centrado
- {"hmark":{"size":alto,"h":grosor}}  logo "h:" de hackgorithmic (ancho ≈ 0,93 × size), plano en XY
ASSETS
Operaciones (listas de NODOS): {"union":[...]} {"diff":[base, cortador1, ...]} {"inter":[...]} {"hull":[...]} {"array":{"n":4,"step":[dx,dy,dz]},"of":NODO} {"polar":{"n":6,"r":radio,"start":0,"angle":360},"of":NODO}
Modificadores en cualquier nodo, en este orden: "scale":[x,y,z], "mirror":[nx,ny,nz], "rot":[gx,gy,gz] (grados; X, luego Y, luego Z), "at":[x,y,z]. "if":"expresión" omite el nodo si da 0.

Reglas para impresión FDM:
- Cara plana grande apoyada en la cama (Z mínima). El programa coloca la pieza sola sobre la cama; tú eliges la orientación para imprimir sin soportes.
- Voladizos máximo 45°; chaflanes en vez de techos planos. Paredes mínimas 1,6 mm (2,4+ si carga peso). Agujeros +0,3 mm de holgura; a presión +0,15. Tornillo M3=3,4 M4=4,5 M5=5,3 M6=6,4. Tubo de 1 pulgada = 25,4.
- Los cortadores sobresalen 1 mm de la cara que atraviesan.
- SIEMPRE incluye "hmark" grabada (en un "diff", h 1,2, entrando 0,6 mm en una cara plana visible) o en relieve. Grabada debajo: "mirror":[1,0,0] para que se lea.
- Haz exactamente lo que se pide. Al cambiar una pieza existente conserva todo lo que no se pidió (mismos ids, mismas formas).`;
function specText(){
  const a = (state.design && state.design.assets) || {};
  const list = Object.entries(a).map(([id, v]) => `- {"logo":{"id":"${id}","w":ancho,"h":grosor}} imagen subida "${v.name || id}" (alto = ${fmt(v.aspect, 3)} × ancho); o "fit":[ancho_max,alto_max]`).join('\n');
  return SPEC.replace('ASSETS', list ? 'Imágenes de la persona (úsalas cuando lo pida):\n' + list : '');
}
function showReply(t, err){ const r = $('reply'); r.hidden = !t; r.textContent = t || ''; r.className = 'reply' + (err ? ' err' : ''); }
function aiBusy(on, t){ busy(on, t); $('go').disabled = on || !sample; $('edit').disabled = on || !sample || !state.design; $('stop').hidden = !on; }
function errCopy(e){
  const c = e && e.code;
  if (['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'].includes(c)) return 'La IA no está disponible en esta vista. Puedes seguir usando plantillas, medidas, Imagen y Taller.';
  if (c === 'rate_limited') return 'Demasiadas peticiones seguidas. Espera un momento y vuelve a intentarlo.';
  if (c === 'invalid_json') return 'La respuesta no vino en el formato esperado. Pulsa otra vez o describe la pieza con menos detalle.';
  if (c === 'refused') return 'La IA no quiso hacer esta pieza. Cambia la descripción.';
  if (c === 'image_rejected') return 'No pude usar esa foto. Prueba con otra (JPG o PNG).';
  if (c === 'session_expired') return 'Tu sesión venció. Vuelve a entrar en Claude.';
  return 'No pude hablar con la IA ahora. Intenta de nuevo.';
}
function adoptDesign(d, keepFrom){
  if (!d || typeof d !== 'object' || (!d.model && !(d.parts && d.parts.length))) throw { code: 'invalid_json' };
  const reply = d.reply; delete d.reply; delete d.ok; delete d.issues;
  if (state.design && state.design.assets) d.assets = state.design.assets;
  let values = initialValues(d);
  if (keepFrom) (d.params || []).forEach(p => { const old = (keepFrom.design.params || []).find(q => q.id === p.id); if (old && String(old.value) === String(p.value) && keepFrom.values[p.id] !== undefined) values[p.id] = keepFrom.values[p.id]; });
  state.tpl = -1; renderTemplates(); loadDesign(d, { values });
  return reply;
}
async function askAI(mode){
  if (!sample) return;
  const want = $('prompt').value.trim();
  if (mode !== 'fix' && !want && !state.photo) { $('prompt').focus(); return; }
  let input = specText() + '\n\n';
  if (mode === 'new') input += 'PIEZA NUEVA. Pedido:\n' + want + (state.photo ? '\n(Adjuntó una foto o boceto: úsalo como referencia de forma y proporciones; las medidas que no diga, estímalas.)' : '');
  else {
    input += 'DISEÑO ACTUAL (JSON):\n' + JSON.stringify(Object.assign({}, state.design, { assets: undefined })) + '\nMedidas actuales: ' + JSON.stringify(state.values) + '\n\n';
    if (mode === 'fix') input += 'Este diseño falla con el error: "' + state.lastError + '". Corrígelo sin cambiar la intención.';
    else input += 'CAMBIO pedido:\n' + want + (state.photo ? '\n(Adjuntó una foto o boceto como referencia.)' : '');
  }
  state.ctl = new AbortController();
  aiBusy(true, $('deep').checked ? 'Pensando a fondo…' : 'Diseñando…'); showReply('');
  const before = { design: state.design, values: Object.assign({}, state.values) };
  try {
    const opts = { signal: state.ctl.signal, modelTier: $('deep').checked ? 'complex' : 'default', cache: false };
    if (state.photo && canImages) opts.images = [state.photo];
    const d = await sample.json(input, opts);
    let reply = adoptDesign(d, mode === 'edit' ? before : null);
    if (!state.lastError && $('review').checked && canImages && mode !== 'fix') {
      busy(true, 'Revisando la pieza…'); await nextFrame();
      const shot = await captureViews();
      const rv = await sample.json(specText() + '\n\nREVISIÓN. La persona pidió:\n' + (want || '(ver foto)') + '\n\nEste es el diseño generado (JSON):\n' + JSON.stringify(Object.assign({}, state.design, { assets: undefined })) +
        '\nMedidas: ' + JSON.stringify(state.values) + '\nTamaño final: ' + state.check.size.map(v => fmt(v)).join(' × ') + ' mm. Voladizos: ' + fmt(state.check.overhangPct) + ' %.\n\nLa imagen muestra 4 vistas de la pieza construida (3D, frente, arriba, lado). Compara con lo pedido. Responde SOLO JSON: {"ok":true} si está bien; si hay errores reales (partes flotando o desconectadas, agujeros mal puestos, medidas que no cumplen, algo pedido que falta, no se puede imprimir), responde {"ok":false,"issues":"qué corregiste, en 1-2 frases","name":...,"params":...,"vars":...,"model" o "parts":...} con el diseño completo corregido. No agregues cosas que no se pidieron.',
        { signal: state.ctl.signal, modelTier: $('deep').checked ? 'complex' : 'default', cache: false, images: [shot] });
      if (rv && rv.ok === false && (rv.model || rv.parts)) { const issues = rv.issues; const rr = adoptDesign(rv, { design: state.design, values: state.values }); reply = (reply || '') + '\n\nRevisión: ' + (issues || rr || 'corregí detalles.'); }
      else if (rv && rv.ok) reply = (reply || 'Listo.') + '\n\nRevisión: la pieza coincide con lo pedido.';
    }
    if (!state.lastError) showReply(reply || 'Listo.');
    if (mode !== 'fix') { $('prompt').value = ''; clearPhoto(); }
  } catch (e) {
    if (e && e.code === 'cancelled') showReply('');
    else showReply(errCopy(e), true);
  } finally { aiBusy(false); }
}
$('go').onclick = () => askAI('new');
$('edit').onclick = () => askAI('edit');
$('fix').onclick = () => askAI('fix');
$('stop').onclick = () => state.ctl && state.ctl.abort();
$('prompt').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) askAI(state.design && state.tpl < 0 ? 'edit' : 'new'); });
function clearPhoto(){ state.photo = null; $('photo').value = ''; $('photo-chip').hidden = true; }
$('photo').addEventListener('change', () => { const f = $('photo').files[0]; if (!f) return; state.photo = f; $('photo-chip').hidden = false; $('photo-chip').textContent = f.name.slice(0, 24) + ' ✕'; });
$('photo-chip').onclick = clearPhoto;

/* ================= IMAGEN ================= */
function readFile(f, as){ return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); if (as === 'text') r.readAsText(f); else if (as === 'url') r.readAsDataURL(f); else r.readAsArrayBuffer(f); }); }
function loadImage(f){ return readFile(f, 'url').then(u => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('No pude abrir esa imagen.')); im.src = u; })); }
function drawAssetPreview(asset){
  const cv = $('logo-prev'), ctx = cv.getContext('2d'), W = cv.width, Hh = cv.height; cv.hidden = false;
  ctx.fillStyle = css('--bg'); ctx.fillRect(0, 0, W, Hh);
  const k = Math.min((W - 40), (Hh - 40) / asset.aspect), ox = (W - k) / 2, oy = (Hh + asset.aspect * k) / 2;
  ctx.beginPath();
  for (const s of asset.shapes) for (const loop of [s.o, ...s.h]) { loop.forEach(([x, y], i) => { const px = ox + x * k, py = oy - y * k; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.closePath(); }
  ctx.fillStyle = css('--accent'); ctx.fill('evenodd');
}
let logoSrc = null;
async function traceLogo(){
  if (!logoSrc) return;
  try {
    let asset;
    if (logoSrc.svg) asset = HEngine.svgToAsset(THREE, logoSrc.svg);
    else {
      const im = logoSrc.img, sc = Math.min(1, 700 / Math.max(im.width, im.height)), w = Math.max(8, Math.round(im.width * sc)), h = Math.max(8, Math.round(im.height * sc));
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const c2 = cv.getContext('2d'); c2.drawImage(im, 0, 0, w, h);
      asset = HEngine.traceImage(c2.getImageData(0, 0, w, h).data, w, h, { threshold: +$('logo-th').value, invert: $('logo-inv').checked });
      if ($('logo-th').value === '-1' && asset.threshold !== null) $('logo-th').title = 'Automático (' + asset.threshold + ')';
    }
    asset.name = logoSrc.name; state.logo = asset; drawAssetPreview(asset); $('logo-go').disabled = false; $('logo-name').textContent = logoSrc.name + ' · ' + asset.shapes.length + ' formas';
  } catch (e) { state.logo = null; $('logo-go').disabled = true; $('logo-name').textContent = String(e.message || e); }
}
$('logo-file').addEventListener('change', async () => {
  const f = $('logo-file').files[0]; if (!f) return;
  try {
    if (/svg/i.test(f.type) || /\.svg$/i.test(f.name)) { logoSrc = { svg: await readFile(f, 'text'), name: f.name }; $('logo-trace').hidden = true; }
    else { logoSrc = { img: await loadImage(f), name: f.name }; $('logo-trace').hidden = false; }
    traceLogo();
  } catch (e) { $('logo-name').textContent = String(e.message || e); }
});
$('logo-inv').onchange = traceLogo; let thT = null; $('logo-th').oninput = () => { clearTimeout(thT); thT = setTimeout(traceLogo, 150); };
let logoMode = 'placa';
$('logo-mode').querySelectorAll('button').forEach(b => b.onclick = () => { logoMode = b.dataset.v; $('logo-mode').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); });
const numIn = (id, def) => { const v = parseFloat(String($(id).value).replace(',', '.')); return isFinite(v) && v > 0 ? v : def; };
$('logo-go').onclick = () => {
  if (!state.logo) return;
  const w = numIn('logo-w', 70), rel = numIn('logo-h', 1.2), A = state.logo.aspect, nm = (state.logo.name || 'logo').replace(/\.[a-z0-9]+$/i, '');
  const assets = Object.assign({}, (state.design && state.design.assets) || {}, { logo1: state.logo });
  const P = (id, label, value, min, max, step) => ({ id, label, value, min, max, step, unit: 'mm' });
  let d;
  if (logoMode === 'solo') d = { name: 'Logo ' + nm, assets, params: [P('ancho', 'Ancho', w, 10, 260, 1), P('grosor', 'Grosor', 3, 1, 20, 0.2)],
    model: { logo: { id: 'logo1', w: 'ancho', h: 'grosor' } } };
  else if (logoMode === 'llavero') d = { name: 'Llavero ' + nm, assets, params: [P('ancho', 'Ancho del logo', Math.min(w, 45), 15, 120, 1), P('margen', 'Margen', 4, 1, 15, 0.5), P('base', 'Grosor base', 3, 1.5, 6, 0.2), P('relieve', 'Relieve', rel, 0.4, 4, 0.2)],
    vars: { L: 'ancho+2*margen+9', Hh: `max(ancho*${fmt(A, 4).replace(',', '.')}+2*margen, 16)` },
    parts: [
      { name: 'Base', color: '#f4f1fa', model: { diff: [{ rbox: { size: ['L', 'Hh', 'base'], r: 'min(Hh/2-0.5, 6)', ch: 0.5 } }, { cyl: { d: 5, h: 'base+2' }, at: ['-L/2+5', 0, 0] }] } },
      { name: 'Logo', color: '#6b3fe0', model: { logo: { id: 'logo1', w: 'ancho', h: 'relieve' }, at: [4.5, 0, 'base/2+relieve/2'] } }
    ] };
  else d = { name: 'Placa ' + nm, assets, params: [P('ancho', 'Ancho del logo', w, 10, 240, 1), P('margen', 'Margen', 6, 0, 30, 0.5), P('base', 'Grosor base', 3, 1.2, 10, 0.2), P('relieve', 'Relieve', rel, 0.4, 5, 0.2), P('radio', 'Radio de esquina', 5, 0, 30, 0.5)],
    vars: { Hh: `ancho*${fmt(A, 4).replace(',', '.')}` },
    parts: [
      { name: 'Base', color: '#f4f1fa', model: { rbox: { size: ['ancho+2*margen', 'Hh+2*margen', 'base'], r: 'max(0.5, min(radio, (Hh+2*margen)/2-0.5))' } } },
      { name: 'Logo', color: '#6b3fe0', model: { logo: { id: 'logo1', w: 'ancho', h: 'relieve' }, at: [0, 0, 'base/2+relieve/2'] } }
    ] };
  selectTab('t-design'); state.tpl = -1; renderTemplates(); loadDesign(d);
  showReply('Listo: ' + d.name + '. Puedes pedirle cambios a la IA, por ejemplo "agrégale el nombre del negocio debajo".');
};
let litImg = null;
$('lit-file').addEventListener('change', async () => { const f = $('lit-file').files[0]; if (!f) return; try { litImg = await loadImage(f); litImg._name = f.name; $('lit-name').textContent = f.name + ' · ' + litImg.width + '×' + litImg.height; $('lit-go').disabled = false; } catch (e) { $('lit-name').textContent = e.message; } });
$('lit-go').onclick = async () => {
  if (!litImg) return;
  busy(true, 'Creando litofanía…'); await nextFrame();
  try {
    const Wmm = numIn('lit-w', 100), px = Math.max(0.2, Math.sqrt(Wmm * Wmm * (litImg.height / litImg.width) / 160000)), w = Math.max(20, Math.round(Wmm / px)), h = Math.max(20, Math.round(w * litImg.height / litImg.width));
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const c2 = cv.getContext('2d'); c2.drawImage(litImg, 0, 0, w, h);
    const d = c2.getImageData(0, 0, w, h).data, lum = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) lum[i] = Math.pow((d[4 * i] * 0.299 + d[4 * i + 1] * 0.587 + d[4 * i + 2] * 0.114) / 255, 1.1);
    const r = HEngine.lithophane(lum, w, h, { widthMM: Wmm, tMin: numIn('lit-t0', 0.8), tMax: numIn('lit-t1', 3.2), frame: numIn('lit-f', 0) || 0, upright: $('lit-up').checked });
    setShopSource(r.positions, 'Litofanía ' + litImg._name.replace(/\.[a-z0-9]+$/i, ''), { keepSize: true, noMark: r.marked, noAuto: true });
    selectTab('t-shop');
  } catch (e) { $('lit-name').textContent = 'No se pudo: ' + (e.message || e); }
  busy(false);
};

/* ================= TALLER ================= */
function shopNote(){ const r = state.shop.res; if (!r) return ''; return [r.marked ? 'Marca h: grabada en la base.' : (state.shop.lit ? 'Marca h: grabada en el marco.' : (state.shop.mark ? '' : 'Sin marca h:.')), r.cuts ? 'Cortes: ' + r.cuts + '.' : ''].concat(r.warn || []).filter(Boolean).join(' '); }
function setShopSource(positions, name, opts){
  opts = opts || {};
  const sh = state.shop;
  if (sh.base) { try { sh.base.delete(); } catch (e) {} sh.base = null; }
  sh.src = positions; sh.name = name; sh.rot = [0, 0, 0]; sh.cut = 0; sh.cuts = []; sh.lit = !!opts.noMark;
  const c = HEngine.checks([positions]); const mx = Math.max(...c.size);
  sh.axis = 'max'; sh.mm = opts.keepSize ? Math.round(mx * 10) / 10 : (mx < 2 ? 100 : mx > 2000 ? 200 : Math.round(mx * 10) / 10);
  $('shop-axis').value = 'max'; $('shop-mm').value = sh.mm; $('shop-cut').value = 0; $('shop-cut-n').value = 0;
  if (opts.noMark) { $('shop-mark').checked = false; sh.mark = false; } else { $('shop-mark').checked = true; sh.mark = true; }
  renderCuts();
  $('shop-tools').hidden = false;
  $('shop-info').textContent = name + ' · ' + (positions.length / 9).toLocaleString('es') + ' triángulos';
  sh.rawWhy = null;
  if (!HEngine.hasManifold()) sh.rawWhy = 'El motor rápido no cargó en esta vista: puedo girar, escalar y exportar, pero no cortar, dividir ni grabar.';
  else { try { sh.base = HEngine.workshopBase(positions); } catch (e) { sh.base = null; sh.rawWhy = 'La malla tiene huecos o caras sueltas: puedo girarla, escalarla y exportarla, pero no cortarla, dividirla ni grabarla. Repárala en Meshy/Tripo (opción de reparar o "watertight") y vuelve a abrirla.'; } }
  if (!opts.noAuto) sh.rot = HEngine.bestOrientation(positions, [0, 0, 0]);
  runShop(true);
}
function rawShop(fit){ // transform-only path for meshes Manifold can't use
  const sh = state.shop, src = sh.src, out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i += 3) { const v = HEngine.rotPoint([src[i], src[i + 1], src[i + 2]], sh.rot); out[i] = v[0]; out[i + 1] = v[1]; out[i + 2] = v[2]; }
  const c = HEngine.checks([out]), ax = { x: 0, y: 1, z: 2 }[sh.axis], cur = ax === undefined ? Math.max(...c.size) : c.size[ax], k = sh.mm > 0 ? sh.mm / cur : 1;
  for (let i = 0; i < out.length; i++) out[i] *= k;
  sh.parts = [{ name: sh.name, positions: HEngine.dropToBed(out) }]; sh.res = { warn: [sh.rawWhy], size: c.size.map(v => v * k) };
  state.mode = 'shop'; setParts(sh.parts, sh.name, shopNote(), fit);
}
function runShop(fit){
  const sh = state.shop; if (!sh.src) return;
  if (!sh.base) { rawShop(fit); return; }
  const t0 = performance.now();
  try {
    const res = HEngine.workshopRun(sh.base, { rot: sh.rot, size: { axis: sh.axis, mm: sh.mm }, cutBase: sh.cut, mark: sh.mark, autoSplit: sh.split, pins: sh.pins, cuts: sh.cuts, bed: BED });
    // spread parts apart in the view so the cuts are visible
    const parts = res.parts.map(p => Object.assign({}, p));
    if (parts.length > 1) {
      const pinIdx = parts.findIndex(p => p.pins); let cx = 0, n = parts.length - (pinIdx >= 0 ? 1 : 0);
      parts.forEach((p, i) => { if (p.pins) return; const c = centroid(p.positions); p.offset = [Math.sign(c[0]) * 8 * (n > 1 ? 1 : 0), Math.sign(c[1]) * 8 * (n > 1 ? 1 : 0)]; });
      if (pinIdx >= 0) { const b = HEngine.checks([parts[pinIdx].positions]); parts[pinIdx].offset = [0, -res.size[1] / 2 - 30]; parts[pinIdx].positions = HEngine.dropToBed(parts[pinIdx].positions); }
    }
    sh.res = res; sh.parts = parts; state.mode = 'shop';
    setParts(parts, sh.name, shopNote(), fit);
    setStatus('Taller · ' + Math.round(performance.now() - t0) + ' ms');
    $('shop-cut').max = Math.max(5, Math.round(res.size[2] * 0.5));
  } catch (e) { setStatus('Error en el taller'); $('shop-info').textContent = 'No se pudo: ' + (e.message || e); }
}
function centroid(p){ let x = 0, y = 0, n = p.length / 3; for (let i = 0; i < p.length; i += 3) { x += p[i]; y += p[i + 1]; } return [x / n, y / n]; }
let shopT = null; function shopSchedule(){ clearTimeout(shopT); shopT = setTimeout(() => runShop(false), 180); }
document.querySelectorAll('[data-rot]').forEach(b => b.onclick = () => { const ax = { x: 0, y: 1, z: 2 }[b.dataset.rot]; state.shop.rot = state.shop.rot.slice(); state.shop.rot[ax] = (state.shop.rot[ax] + 90) % 360; runShop(true); });
$('shop-auto').onclick = () => { if (!state.shop.src) return; state.shop.rot = HEngine.bestOrientation(state.shop.src, [0, 0, 0]); runShop(true); };
$('shop-axis').onchange = () => { state.shop.axis = $('shop-axis').value; const c = state.check; if (c) { const v = state.shop.axis === 'max' ? Math.max(...c.size) : c.size[{ x: 0, y: 1, z: 2 }[state.shop.axis]]; state.shop.mm = Math.round(v * 10) / 10; $('shop-mm').value = state.shop.mm; } };
$('shop-mm').onchange = () => { const v = numIn('shop-mm', state.shop.mm); state.shop.mm = v; $('shop-mm').value = v; runShop(true); };
$('shop-cut').oninput = () => { state.shop.cut = +$('shop-cut').value; $('shop-cut-n').value = state.shop.cut; shopSchedule(); };
$('shop-cut-n').onchange = () => { const v = parseFloat($('shop-cut-n').value.replace(',', '.')) || 0; state.shop.cut = Math.max(0, v); $('shop-cut').value = state.shop.cut; shopSchedule(); };
$('shop-mark').onchange = () => { state.shop.mark = $('shop-mark').checked; shopSchedule(); };
$('shop-split').onchange = () => { state.shop.split = $('shop-split').checked; shopSchedule(); };
$('shop-pins').onchange = () => { state.shop.pins = $('shop-pins').checked; shopSchedule(); };
function renderCuts(){
  const box = $('cuts'); box.innerHTML = '';
  state.shop.cuts.forEach((c, i) => {
    const el = document.createElement('div'); el.className = 'cut';
    el.innerHTML = `<select aria-label="Eje"><option value="x">X</option><option value="y">Y</option><option value="z">Z</option></select><input type="range" min="-150" max="270" step="0.5" aria-label="Posición" style="accent-color:var(--accent)"><div class="numbox"><input inputmode="decimal" aria-label="Posición en mm"><span>mm</span></div><button class="btn sm">Quitar</button>`;
    const [sel, rg, nb, rm] = [el.querySelector('select'), el.querySelector('input[type=range]'), el.querySelector('.numbox input'), el.querySelector('button')];
    sel.value = c.axis; rg.value = c.pos; nb.value = c.pos;
    const lim = () => { const ai = { x: 0, y: 1, z: 2 }[c.axis], b = bbox; rg.min = Math.floor(b[0][ai]); rg.max = Math.ceil(b[1][ai]); };
    lim();
    sel.onchange = () => { c.axis = sel.value; lim(); shopSchedule(); };
    rg.oninput = () => { c.pos = +rg.value; nb.value = c.pos; shopSchedule(); };
    nb.onchange = () => { c.pos = parseFloat(nb.value.replace(',', '.')) || 0; rg.value = c.pos; shopSchedule(); };
    rm.onclick = () => { state.shop.cuts.splice(i, 1); renderCuts(); shopSchedule(); };
    box.appendChild(el);
  });
}
$('cut-add').onclick = () => { const b = bbox; state.shop.cuts.push({ axis: 'z', pos: Math.round((b[0][2] + b[1][2]) / 2) }); renderCuts(); runShop(false); };
function trisFromObject(obj, yUp){
  obj.updateMatrixWorld(true); const chunks = []; let n = 0;
  obj.traverse(m => {
    if (!m.isMesh || !m.geometry) return;
    let g = m.geometry.clone(); if (g.index) g = g.toNonIndexed(); g.applyMatrix4(m.matrixWorld);
    const p = g.attributes.position.array; chunks.push(p); n += p.length;
  });
  const out = new Float32Array(n); let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; }
  if (yUp) for (let i = 0; i < out.length; i += 3) { const y = out[i + 1], z = out[i + 2]; out[i + 1] = -z; out[i + 2] = y; }
  if (!out.length) throw new Error('El archivo no trae ninguna malla.');
  return out;
}
$('shop-file').addEventListener('change', async () => {
  const f = $('shop-file').files[0]; if (!f) return;
  busy(true, 'Abriendo ' + f.name + '…'); await nextFrame();
  try {
    const ext = (f.name.split('.').pop() || '').toLowerCase(); let pos;
    if (ext === 'stl') pos = HEngine.parseSTL(await readFile(f));
    else if (ext === 'obj') pos = trisFromObject(new THREE.OBJLoader().parse(await readFile(f, 'text')), true);
    else if (ext === 'glb' || ext === 'gltf') { const buf = await readFile(f); const gltf = await new Promise((res, rej) => new THREE.GLTFLoader().parse(buf, '', res, e => rej(new Error('No pude leer el GLB (¿usa compresión Draco? Expórtalo sin compresión o en STL).')))); pos = trisFromObject(gltf.scene, true); }
    else if (ext === '3mf') pos = trisFromObject(new THREE.ThreeMFLoader().parse(await readFile(f)), false);
    else throw new Error('Formato no soportado: .' + ext);
    setShopSource(pos, f.name.replace(/\.[a-z0-9]+$/i, ''));
  } catch (e) { $('shop-info').textContent = 'No se pudo abrir: ' + (e.message || e); }
  busy(false); $('shop-file').value = '';
});
function designToShop(){
  if (!state.design || state.lastError) return;
  const r = HEngine.evaluate(state.design, state.values, { autoMark: false });
  const n = r.parts.reduce((a, p) => a + p.positions.length, 0), all = new Float32Array(n); let o = 0; r.parts.forEach(p => { all.set(p.positions, o); o += p.positions.length; });
  setShopSource(all, state.design.name || 'Pieza', { keepSize: true, noAuto: true });
  selectTab('t-shop');
}
$('shop-from').onclick = designToShop; $('toshop').onclick = designToShop;

/* ================= export ================= */
let downloads = null;
const PLA = `AJUSTES PLA RECOMENDADOS — Snapmaker U1 · Snapmaker Orca
(h: Studio · hackgorithmic)

Perfil base: PLA de Snapmaker para la U1, boquilla 0,4 mm.
Altura de capa: 0,20 mm (0,12 mm para letras, roscas o la marca h:)
Paredes: 3 perímetros (4 en roscas y piezas que cargan peso)
Capas superiores 5 · inferiores 4
Relleno: 15 % giroide (25-40 % en piezas que cargan peso)
Boquilla 210-220 °C · Cama 60 °C · Ventilador 100 % desde la capa 2
Soportes: solo si h: Studio marca voladizos; "solo en la placa"
Adherencia: borde (brim) de 5 mm si la pieza es alta o apoya poco

Litofanías: PLA blanco, capa 0,12 mm, relleno 100 %, de pie, velocidad baja.
Varios colores: importa todas las partes juntas en Orca y acepta
"¿cargar como un objeto con varias partes?". Asigna un filamento a cada parte.
Pasadores: imprímelos acostados; si quedan duros, lija un poco.
`;
const slug = s => (s || 'pieza').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'pieza';
$('dl').onclick = async () => {
  if (!state.parts || (state.mode === 'design' && state.lastError)) return;
  const nm = slug(state.mode === 'shop' ? state.shop.name : state.design.name), files = [];
  const multi = state.parts.length > 1;
  state.parts.forEach((p, i) => {
    const pos = state.mode === 'shop' && multi ? HEngine.dropToBed(p.positions) : p.positions;
    files.push({ name: multi ? nm + '-' + String(i + 1).padStart(2, '0') + '-' + slug(p.name) + '.stl' : nm + '.stl', data: HEngine.stlBinary(pos, p.name) });
  });
  if (state.mode === 'design') files.push({ name: nm + '.hstudio.json', data: JSON.stringify({ design: state.design, values: state.values }) });
  files.push({ name: 'ajustes-PLA-Snapmaker-U1.txt', data: PLA });
  const zip = HEngine.zip(files);
  if (!downloads) { $('dlnote').textContent = 'Las descargas no están disponibles en esta vista. Abre la página en claude.ai.'; return; }
  try { await downloads.save({ filename: nm + '.zip', data: zip }); $('dlnote').textContent = 'Descargado: ' + nm + '.zip (' + (zip.length > 1048576 ? fmt(zip.length / 1048576, 1) + ' MB' : Math.max(1, Math.round(zip.length / 1024)) + ' KB') + ')'; }
  catch (e) { $('dlnote').textContent = e && e.code === 'declined' ? 'Descarga cancelada.' : e && e.code === 'too_large' ? 'El archivo es demasiado grande para descargarlo aquí.' : 'No se pudo descargar. Intenta de nuevo.'; }
};

/* ================= saved designs ================= */
const KEY = 'hstudio.designs.v1';
function readSaved(){ try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } }
function writeSaved(list){ try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch (e) { return false; } }
function renderSaved(){
  const list = readSaved(), box = $('saved'); box.innerHTML = '';
  if (!list.length) { box.innerHTML = '<div class="empty">Aún no guardas diseños. Usa "Guardar diseño" en Diseñar y aparecerán aquí, en este navegador.</div>'; return; }
  list.forEach((it, i) => {
    const row = document.createElement('div'); row.className = 'it';
    const sp = document.createElement('span'); sp.textContent = it.design.name || 'Pieza'; row.appendChild(sp);
    const o = document.createElement('button'); o.className = 'btn sm'; o.textContent = 'Abrir'; o.onclick = () => { selectTab('t-design'); state.tpl = -1; renderTemplates(); loadDesign(it.design, { values: it.values }); };
    const del = document.createElement('button'); del.className = 'btn sm'; del.textContent = 'Quitar';
    del.onclick = () => { if (del.dataset.sure) { const l = readSaved(); l.splice(i, 1); writeSaved(l); renderSaved(); } else { del.dataset.sure = 1; del.textContent = '¿Seguro?'; } };
    row.append(o, del); box.appendChild(row);
  });
}
$('save').onclick = () => {
  if (state.mode !== 'design' || !state.design) { $('save').textContent = 'Solo diseños de Diseñar'; setTimeout(() => $('save').textContent = 'Guardar diseño', 1600); return; }
  const l = readSaved(); l.unshift({ design: state.design, values: state.values, at: Date.now() });
  $('save').textContent = writeSaved(l.slice(0, 40)) ? 'Guardado' : 'No cupo (logo muy grande)';
  setTimeout(() => $('save').textContent = 'Guardar diseño', 1600); renderSaved();
};
$('copy').onclick = () => { const t = $('json'); const done = () => { $('copy').textContent = 'Copiado'; setTimeout(() => $('copy').textContent = 'Copiar', 1500); }; try { navigator.clipboard.writeText(t.value).then(done, () => t.select()); } catch (e) { t.select(); } };
$('load').onclick = () => { try { const d = JSON.parse($('json').value); const design = d.design || d; if (!design.model && !design.parts) throw 0; state.tpl = -1; renderTemplates(); loadDesign(design, { values: d.values }); showReply(''); } catch (e) { showReply('Ese código no es un diseño válido de h: Studio.', true); } };

/* ================= boot ================= */
function b64(s){ const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
async function asset(inline, file){ if (inline && inline.length > 1000) return b64(inline); const r = await fetch(file); if (!r.ok) throw new Error(file + ' ' + r.status); return new Uint8Array(await r.arrayBuffer()); }
const IN_CLAUDE = !!(window.claude && window.claude.use);
renderTemplates(); renderSaved();
state.tpl = 0; renderTemplates(); loadDesign(JSON.parse(JSON.stringify(H_TEMPLATES[0])), { push: false });
$('go').disabled = true; $('edit').disabled = true;
(async () => {
  try { if (typeof opentype !== 'undefined') { HEngine.setFont(opentype.parse((await asset(H_FONT, 'font.ttf')).buffer)); } } catch (e) { console.warn('font', e); }
  try {
    if (typeof ManifoldModule !== 'function') throw new Error('sin motor');
    const W = await ManifoldModule({ wasmBinary: await asset(H_WASM, 'manifold.wasm') }); W.setup(); HEngine.setManifold(W);
    $('engine').textContent = 'Manifold'; $('engine').classList.add('on'); $('engine').title = 'Motor rápido Manifold activo';
  } catch (e) {
    console.warn('manifold', e); $('engine').textContent = 'JSCAD'; $('engine').title = 'Motor básico: el Taller no puede cortar ni grabar en esta vista';
    setStatus('Motor básico activo');
  }
  if (state.mode === 'design') rebuild(false);
})();
/* web (outside claude.ai): normal browser downloads + AI through our own server when configured */
function webDownloads(){ return { save: async ({ filename, data }) => { const blob = data instanceof Blob ? data : new Blob([data]); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000); return { status: 'saved' }; } }; }
function blobToDataURL(b){ return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(b); }); }
function webSample(cfg){
  const call = async (input, o) => {
    o = o || {}; const images = o.images ? await Promise.all([].concat(o.images).map(blobToDataURL)) : [];
    let r; try { r = await fetch(cfg.endpoint, { method: 'POST', signal: o.signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input, tier: o.modelTier || 'default', images }) }); }
    catch (e) { throw { code: e && e.name === 'AbortError' ? 'cancelled' : 'upstream_error' }; }
    if (r.status === 429) throw { code: 'rate_limited' };
    if (!r.ok) throw { code: 'upstream_error' };
    const body = await r.json(); return typeof body.text === 'string' ? body.text : JSON.stringify(body);
  };
  const s = async (input, o) => ({ text: await call(input, o), truncated: false });
  s.json = async (input, o) => { const t = await call(input, o); const m = t.match(/```(?:json)?\s*([\s\S]*?)```/); const src = m ? m[1] : t.slice(Math.min(...['{', '['].map(c => { const i = t.indexOf(c); return i < 0 ? 1e9 : i; })), Math.max(t.lastIndexOf('}'), t.lastIndexOf(']')) + 1); try { return JSON.parse(src); } catch (e) { throw { code: 'invalid_json', text: t }; } };
  s.limits = async () => ({ maxPromptBytes: 262144, images: { maxCount: 4, maxInputBytes: 2e7, mediaTypes: ['image/png', 'image/jpeg', 'image/webp'] } });
  return s;
}
(async () => {
  let s = null, d = null;
  if (IN_CLAUDE) [s, d] = await Promise.all([claude.use('sample').catch(() => null), claude.use('downloads').catch(() => null)]);
  else {
    d = webDownloads();
    const cfg = window.HSTUDIO_CONFIG || {};
    if (cfg.endpoint) s = webSample(cfg);
    else showReply('La IA de diseño se activa cuando conectemos el servidor de hackgorithmic. Plantillas, Imagen y Taller ya funcionan.');
  }
  sample = s; downloads = d;
  if (!sample) { $('prompt').placeholder = 'La IA no está disponible todavía. Usa plantillas, Imagen y Taller.'; $('review').checked = false; $('review').disabled = true; }
  else {
    $('go').disabled = false; $('edit').disabled = false;
    try { const lim = await sample.limits(); canImages = !!(lim && lim.images); } catch (e) {}
    $('photo-lbl').hidden = !canImages; if (!canImages) { $('review').checked = false; $('review').disabled = true; }
  }
})();
})();
