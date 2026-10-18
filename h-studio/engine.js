/* h: Studio engine v2 — hackgorithmic
   JSON CSG spec → solid (Manifold WASM when available, JSCAD otherwise) → triangles / STL / zip.
   Also: mesh workshop (import, orient, cut, split with pins, h: mark), lithophanes, image/logo tracing, font text, threads. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('@jscad/modeling'));
  else root.HEngine = factory(root.jscadModeling);
})(typeof self !== 'undefined' ? self : this, function (J) {
  const { primitives: P, booleans: B, transforms: T, extrusions: E, hulls: H, expansions: X, measurements: M, geometries: G, text: TX } = J;
  const DEG = Math.PI / 180, SEG = 64;
  const H$ = { W: null, font: null, fontCap: 0.7 }; // W = manifold wasm module (after setup)

  /* =====================================================================
     Expressions (safe, no eval)
     ===================================================================== */
  const FN = {
    sqrt: Math.sqrt, abs: Math.abs, min: Math.min, max: Math.max, round: Math.round, floor: Math.floor, ceil: Math.ceil,
    sin: d => Math.sin(d * DEG), cos: d => Math.cos(d * DEG), tan: d => Math.tan(d * DEG),
    asin: v => Math.asin(v) / DEG, acos: v => Math.acos(v) / DEG, atan: v => Math.atan(v) / DEG, atan2: (y, x) => Math.atan2(y, x) / DEG,
    pow: Math.pow, hypot: Math.hypot
  };
  function tokenize(s) {
    const out = []; let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      if (/[0-9.]/.test(c)) { let j = i; while (j < s.length && /[0-9.eE]/.test(s[j])) { if (/[eE]/.test(s[j]) && /[+-]/.test(s[j + 1])) j++; j++; } out.push({ t: 'n', v: parseFloat(s.slice(i, j)) }); i = j; continue; }
      if (/[A-Za-z_]/.test(c)) { let j = i; while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j++; out.push({ t: 'id', v: s.slice(i, j) }); i = j; continue; }
      if ('+-*/%^(),'.includes(c)) { out.push({ t: c }); i++; continue; }
      throw new Error('Símbolo no válido en expresión: "' + c + '"');
    }
    return out;
  }
  function evalExpr(src, scope) {
    if (typeof src === 'number') return src;
    if (typeof src === 'boolean') return src ? 1 : 0;
    if (typeof src !== 'string') throw new Error('Valor numérico inválido: ' + JSON.stringify(src));
    const tk = tokenize(src); let p = 0;
    const peek = () => tk[p], eat = t => { if (!tk[p] || tk[p].t !== t) throw new Error('Expresión mal formada: ' + src); return tk[p++]; };
    function prim() {
      const k = peek(); if (!k) throw new Error('Expresión incompleta: ' + src);
      if (k.t === 'n') { p++; return k.v; }
      if (k.t === '(') { p++; const v = add(); eat(')'); return v; }
      if (k.t === '-') { p++; return -pow(); }
      if (k.t === '+') { p++; return pow(); }
      if (k.t === 'id') {
        p++;
        if (peek() && peek().t === '(') {
          p++; const args = [];
          if (peek() && peek().t !== ')') { args.push(add()); while (peek() && peek().t === ',') { p++; args.push(add()); } }
          eat(')');
          const f = FN[k.v]; if (!f) throw new Error('Función desconocida: ' + k.v);
          return f.apply(null, args);
        }
        if (k.v === 'pi' || k.v === 'PI') return Math.PI;
        if (Object.prototype.hasOwnProperty.call(scope, k.v)) return scope[k.v];
        throw new Error('Medida desconocida: "' + k.v + '"');
      }
      throw new Error('Expresión mal formada: ' + src);
    }
    function pow() { let v = prim(); if (peek() && peek().t === '^') { p++; v = Math.pow(v, pow()); } return v; }
    function mul() { let v = pow(); while (peek() && '*/%'.includes(peek().t)) { const o = tk[p++].t; const r = pow(); v = o === '*' ? v * r : o === '/' ? v / r : v % r; } return v; }
    function add() { let v = mul(); while (peek() && '+-'.includes(peek().t)) { const o = tk[p++].t; const r = mul(); v = o === '+' ? v + r : v - r; } return v; }
    const v = add(); if (p !== tk.length) throw new Error('Expresión mal formada: ' + src);
    if (!isFinite(v)) throw new Error('Resultado no numérico en: ' + src);
    return v;
  }
  const num = (v, s, def) => (v === undefined || v === null) ? def : evalExpr(v, s);
  const vec = (v, s, n, def) => { if (v === undefined) return def; if (!Array.isArray(v)) { const k = evalExpr(v, s); return Array(n).fill(k); } return v.map(x => evalExpr(x, s)); };

  /* =====================================================================
     2D geometry helpers
     ===================================================================== */
  function area2(pts) { let a = 0; for (let i = 0; i < pts.length; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length]; a += x1 * y2 - x2 * y1; } return a / 2; }
  const ccw = pts => area2(pts) < 0 ? pts.slice().reverse() : pts;
  const cw = pts => area2(pts) > 0 ? pts.slice().reverse() : pts;
  function pip(pt, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi)) c = !c; } return c; }
  function dedupe(pts) { const o = []; for (const p of pts) { const q = o[o.length - 1]; if (!q || Math.abs(q[0] - p[0]) > 1e-7 || Math.abs(q[1] - p[1]) > 1e-7) o.push(p); } if (o.length > 1) { const a = o[0], b = o[o.length - 1]; if (Math.abs(a[0] - b[0]) < 1e-7 && Math.abs(a[1] - b[1]) < 1e-7) o.pop(); } return o; }
  function poly2(points, s) { const pts = points.map(p => [evalExpr(p[0], s), evalExpr(p[1], s)]); return P.polygon({ points: ccw(pts) }); }

  /* loops → shapes [{o, h:[...]}] by nesting depth (even depth = solid) */
  function loopsToShapes(loops) {
    loops = loops.map(dedupe).filter(l => l.length >= 3 && Math.abs(area2(l)) > 1e-9);
    const n = loops.length, depth = new Array(n).fill(0), parent = new Array(n).fill(-1), absA = loops.map(l => Math.abs(area2(l)));
    for (let i = 0; i < n; i++) {
      const pt = loops[i][0]; let best = -1;
      for (let j = 0; j < n; j++) if (j !== i && absA[j] > absA[i] && pip(pt, loops[j])) { depth[i]++; if (best < 0 || absA[j] < absA[best]) best = j; }
      parent[i] = best;
    }
    const shapes = [], idx = {};
    for (let i = 0; i < n; i++) if (depth[i] % 2 === 0) { idx[i] = shapes.length; shapes.push({ o: ccw(loops[i]), h: [] }); }
    for (let i = 0; i < n; i++) if (depth[i] % 2 === 1 && parent[i] >= 0 && idx[parent[i]] !== undefined) shapes[idx[parent[i]]].h.push(cw(loops[i]));
    return shapes;
  }
  function shapesToGeom2(shapes) {
    const parts = [];
    for (const sh of shapes) {
      if (sh.o.length < 3) continue;
      let g = P.polygon({ points: ccw(sh.o) });
      const holes = sh.h.filter(h => h.length >= 3).map(h => P.polygon({ points: ccw(h) }));
      if (holes.length) g = B.subtract(g, holes.length > 1 ? B.union(holes) : holes[0]);
      parts.push(g);
    }
    if (!parts.length) throw new Error('La figura quedó vacía');
    return parts.length > 1 ? B.union(parts) : parts[0];
  }
  function bounds2(shapes) { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const s of shapes) for (const [x, y] of s.o) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return [x0, y0, x1, y1]; }
  function mapShapes(shapes, f) { return shapes.map(s => ({ o: s.o.map(f), h: s.h.map(h => h.map(f)) })); }

  /* hackgorithmic "h:" mark as shapes, height = size, centered */
  function hmarkShapes(size) { // simple overlapping pieces (for rasterizing)
    const s = size, w = 0.19 * s, R = 0.31 * s, cx = R, cy = 0.42 * s, dotR = w * 0.6, dx = 2 * R + 0.2 * s, width = dx + dotR;
    const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    const arch = []; for (let i = 0; i <= 32; i++) { const a = Math.PI * i / 32; arch.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]); }
    for (let i = 32; i >= 0; i--) { const a = Math.PI * i / 32; arch.push([cx + (R - w) * Math.cos(a), cy + (R - w) * Math.sin(a)]); }
    const circ = (x, y, r) => { const p = []; for (let i = 0; i < 24; i++) { const a = 2 * Math.PI * i / 24; p.push([x + r * Math.cos(a), y + r * Math.sin(a)]); } return p; };
    const loops = [rect(0, 0, w, s), rect(2 * R - w, 0, 2 * R, cy), arch, circ(dx, dotR, dotR), circ(dx, 0.5 * s, dotR)];
    return loops.map(l => ({ o: l.map(([x, y]) => [x - width / 2, y - s / 2]), h: [] }));
  }
  function hmark2d(size) {
    const s = size, w = 0.19 * s;
    const stem = P.rectangle({ size: [w, s], center: [w / 2, s / 2] });
    const R = 0.31 * s, cx = R, cy = 0.42 * s;
    const ring = B.subtract(P.circle({ radius: R, center: [cx, cy], segments: SEG }), P.circle({ radius: R - w, center: [cx, cy], segments: SEG }));
    const upper = B.intersect(ring, P.rectangle({ size: [2 * R + 2, R + 1], center: [cx, cy + (R + 1) / 2] }));
    const leg = P.rectangle({ size: [w, cy], center: [2 * R - w / 2, cy / 2] });
    const dotR = w * 0.6, dx = 2 * R + 0.2 * s;
    const d1 = P.circle({ radius: dotR, center: [dx, dotR], segments: 32 });
    const d2 = P.circle({ radius: dotR, center: [dx, 0.5 * s], segments: 32 });
    const g = B.union(stem, upper, leg, d1, d2), width = dx + dotR;
    return T.translate([-width / 2, -s / 2, 0], g);
  }

  /* font text (opentype) → shapes, cap height = size */
  function fontShapes(str, size) {
    const font = H$.font; const capEm = H$.fontCap || 0.7;
    const fs = size / capEm, path = font.getPath(String(str), 0, 0, fs), loops = []; let cur = null, last = null;
    const push = (x, y) => { cur.push([x, -y]); last = [x, y]; };
    for (const c of path.commands) {
      if (c.type === 'M') { if (cur && cur.length > 2) loops.push(cur); cur = []; push(c.x, c.y); }
      else if (c.type === 'L') push(c.x, c.y);
      else if (c.type === 'Q') { const [x0, y0] = last; for (let i = 1; i <= 8; i++) { const t = i / 8, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, d = t * t; push(a * x0 + b * c.x1 + d * c.x, a * y0 + b * c.y1 + d * c.y); } }
      else if (c.type === 'C') { const [x0, y0] = last; for (let i = 1; i <= 10; i++) { const t = i / 10, a = (1 - t) ** 3, b = 3 * (1 - t) ** 2 * t, d = 3 * (1 - t) * t * t, e = t ** 3; push(a * x0 + b * c.x1 + d * c.x2 + e * c.x, a * y0 + b * c.y1 + d * c.y2 + e * c.y); } }
      else if (c.type === 'Z') { if (cur && cur.length > 2) loops.push(cur); cur = null; }
    }
    if (cur && cur.length > 2) loops.push(cur);
    if (!loops.length) throw new Error('Texto vacío');
    let shapes = loopsToShapes(loops);
    const [x0, y0, x1, y1] = bounds2(shapes), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    return mapShapes(shapes, ([x, y]) => [x - cx, y - cy]);
  }
  function text2d(str, size, weight) {
    if (H$.font) return shapesToGeom2(fontShapes(str, size));
    const segs = TX.vectorText({ height: size, input: String(str) });
    if (!segs.length) throw new Error('Texto vacío');
    const stroke = Math.max(0.4, weight || size * 0.16);
    const parts = segs.map(seg => X.expand({ delta: stroke / 2, corners: 'round', segments: 16 }, G.path2.fromPoints({}, seg)));
    const g = B.union(parts);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    segs.forEach(seg => seg.forEach(([x, y]) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }));
    return T.translate([-(minX + maxX) / 2, -(minY + maxY) / 2, 0], g);
  }
  function fitScale(g2, fit, s) {
    if (!fit) return g2;
    const [fw, fh] = vec(fit, s, 2), bb = M.measureBoundingBox(g2), w = bb[1][0] - bb[0][0], hh = bb[1][1] - bb[0][1];
    const k = Math.min(fw / w, fh / hh); return k < 1 ? T.scale([k, k, 1], g2) : g2;
  }

  /* =====================================================================
     Threads — exact ISO-style profile as a cylindrical height field
     ===================================================================== */
  function threadTris(d, pitch, h, opts) {
    opts = opts || {};
    const rMaj = d / 2, depth = 0.6134 * pitch, rMin = rMaj - depth;
    const seg = Math.max(48, Math.min(160, Math.round(d * 6))), dz = pitch / 16, rows = Math.max(2, Math.ceil(h / dz));
    const lead = opts.lead !== false;
    function prof(u) { u -= Math.floor(u); // 0..1 → radius
      if (u < 0.25) return rMin; if (u < 0.5625) return rMin + (u - 0.25) / 0.3125 * depth;
      if (u < 0.6875) return rMaj; if (u < 1) return rMaj - (u - 0.6875) / 0.3125 * depth; return rMin; }
    const V = [];
    for (let i = 0; i <= rows; i++) {
      const z = Math.min(h, i * dz), ring = [];
      for (let j = 0; j < seg; j++) {
        const th = j / seg * 2 * Math.PI;
        let r = prof(z / pitch - j / seg);
        if (lead) { const e = Math.min(z, h - z); r = Math.min(r, rMin + e * 1.0); }
        ring.push([r * Math.cos(th), r * Math.sin(th), z]);
      }
      V.push(ring);
    }
    const tris = [];
    for (let i = 0; i < rows; i++) for (let j = 0; j < seg; j++) {
      const a = V[i][j], b = V[i][(j + 1) % seg], c = V[i + 1][(j + 1) % seg], dd = V[i + 1][j];
      tris.push([a, b, c], [a, c, dd]);
    }
    const bot = [0, 0, 0], top = [0, 0, h];
    for (let j = 0; j < seg; j++) { tris.push([bot, V[0][(j + 1) % seg], V[0][j]]); tris.push([top, V[rows][j], V[rows][(j + 1) % seg]]); }
    return tris.map(t => t.map(v => [v[0], v[1], v[2] - h / 2]));
  }

  /* =====================================================================
     Kernels
     ===================================================================== */
  function trisFromJ(g) {
    const polys = G.geom3.toPolygons(g), tris = [];
    for (const p of polys) { const v = p.vertices; for (let i = 1; i < v.length - 1; i++) tris.push([v[0], v[i], v[i + 1]]); }
    return tris;
  }
  function indexed(tris) { // weld
    const map = new Map(), verts = [], idx = new Uint32Array(tris.length * 3); let k = 0;
    for (const t of tris) for (const v of t) {
      const key = Math.round(v[0] * 1e5) + ',' + Math.round(v[1] * 1e5) + ',' + Math.round(v[2] * 1e5);
      let id = map.get(key); if (id === undefined) { id = verts.length / 3; map.set(key, id); verts.push(v[0], v[1], v[2]); }
      idx[k++] = id;
    }
    return { vert: new Float32Array(verts), idx };
  }
  function indexedFromPositions(pos, tol) {
    const q = 1 / (tol || 1e-4), map = new Map(), verts = [], n = pos.length / 3, idx = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      const x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2];
      const key = Math.round(x * q) + ',' + Math.round(y * q) + ',' + Math.round(z * q);
      let id = map.get(key); if (id === undefined) { id = verts.length / 3; map.set(key, id); verts.push(x, y, z); }
      idx[i] = id;
    }
    // drop degenerate triangles
    const keep = [];
    for (let t = 0; t < n / 3; t++) { const a = idx[3 * t], b = idx[3 * t + 1], c = idx[3 * t + 2]; if (a !== b && b !== c && a !== c) keep.push(a, b, c); }
    return { vert: new Float32Array(verts), idx: new Uint32Array(keep) };
  }

  const KJ = { // JSCAD kernel
    name: 'JSCAD',
    fromJ: g => g,
    fromTris: tris => G.geom3.create(tris.map(t => G.poly3.create(t))),
    union: a => a.length > 1 ? B.union(a) : a[0],
    subtract: (a, rest) => rest.length ? B.subtract(a, ...rest) : a,
    intersect: a => a.length > 1 ? B.intersect(a) : a[0],
    hull: a => H.hull(a),
    translate: (g, v) => T.translate(v, g),
    rotate: (g, r) => T.rotate([r[0] * DEG, r[1] * DEG, r[2] * DEG], g),
    scale: (g, v) => T.scale(v, g),
    mirror: (g, n) => T.mirror({ normal: n }, g),
    bbox: g => M.measureBoundingBox(g),
    positions: g => posFromTris(trisFromJ(g)),
    free: () => {}
  };
  function makeKM(pool) { // Manifold kernel; every created object is tracked for deletion
    const W = H$.W, Mf = W.Manifold, t = m => { pool.push(m); return m; };
    const fromIndexed = ({ vert, idx }) => {
      const mesh = new W.Mesh({ numProp: 3, vertProperties: vert, triVerts: idx });
      mesh.merge();
      const m = new Mf(mesh);
      if (m.status && m.status() !== 'NoError' && m.status() !== 0) throw new Error('La malla no está cerrada (' + m.status() + ')');
      return t(m);
    };
    return {
      name: 'Manifold',
      fromJ: g => fromIndexed(indexed(trisFromJ(g))),
      fromTris: tris => fromIndexed(indexed(tris)),
      fromIndexed,
      union: a => a.length > 1 ? t(Mf.union(a)) : a[0],
      subtract: (a, rest) => rest.length ? t(Mf.difference([a, ...rest])) : a,
      intersect: a => a.length > 1 ? t(Mf.intersection(a)) : a[0],
      hull: a => t(Mf.hull(a)),
      translate: (g, v) => t(g.translate(v)),
      rotate: (g, r) => t(g.rotate(r)),
      scale: (g, v) => t(g.scale(v)),
      mirror: (g, n) => t(g.mirror(n)),
      bbox: g => { const b = g.boundingBox(); return [b.min, b.max]; },
      positions: g => { const m = g.getMesh(), np = m.numProp, vp = m.vertProperties, tv = m.triVerts, out = new Float32Array(tv.length * 3); for (let i = 0; i < tv.length; i++) { const v = tv[i] * np; out[3 * i] = vp[v]; out[3 * i + 1] = vp[v + 1]; out[3 * i + 2] = vp[v + 2]; } return out; },
      free: () => { for (const m of pool) { try { m.delete(); } catch (e) {} } pool.length = 0; }
    };
  }
  function posFromTris(tris) { const a = new Float32Array(tris.length * 9); let k = 0; for (const t of tris) for (const v of t) { a[k++] = v[0]; a[k++] = v[1]; a[k++] = v[2]; } return a; }

  /* =====================================================================
     Design builder
     ===================================================================== */
  const OPS = ['union', 'diff', 'inter', 'hull', 'array', 'polar'];
  const PRIM2D = { // produce JSCAD geom2 (then extruded)
    text(a, s, ctx) {
      let str = a.t; if (typeof str === 'string' && str[0] === '$') { const k = str.slice(1); str = ctx.texts && ctx.texts[k] !== undefined ? ctx.texts[k] : ''; }
      if (!String(str).trim()) throw new Error('El texto está vacío');
      return fitScale(text2d(str, num(a.size, s, 10), a.weight !== undefined ? num(a.weight, s) : undefined), a.fit, s);
    },
    hmark(a, s, ctx) { ctx.hasMark = true; return hmark2d(num(a.size, s, 10)); },
    logo(a, s, ctx) {
      const asset = ctx.assets && ctx.assets[a.id];
      if (!asset) throw new Error('No encuentro la imagen "' + a.id + '". Súbela de nuevo en la pestaña Imagen.');
      let w = a.w !== undefined ? num(a.w, s) : 50; const aspect = asset.aspect || 1;
      if (a.fit) { const [fw, fh] = vec(a.fit, s, 2); w = Math.min(fw, fh / aspect); }
      const k = w, hh = aspect * w;
      return shapesToGeom2(mapShapes(asset.shapes, ([x, y]) => [x * k - w / 2, y * k - hh / 2]));
    },
    shape(a, s) { // polygon with holes: {"shape":{"points":[...],"holes":[[...]],"h":..}}
      const o = a.points.map(p => [evalExpr(p[0], s), evalExpr(p[1], s)]);
      const hs = (a.holes || []).map(h => h.map(p => [evalExpr(p[0], s), evalExpr(p[1], s)]));
      return shapesToGeom2([{ o, h: hs }]);
    }
  };
  const PRIMS = {
    box(a, s) {
      const size = vec(a.size || a, s, 3), r = num(a.r, s, 0);
      if (r > 0) return P.roundedCuboid({ size, roundRadius: Math.min(r, Math.min(...size) / 2 - 0.01), segments: 24 });
      return P.cuboid({ size });
    },
    rbox(a, s) {
      const [x, y, z] = vec(a.size, s, 3), r = Math.min(num(a.r, s, 2), Math.min(x, y) / 2 - 0.01);
      const shape = P.roundedRectangle({ size: [x, y], roundRadius: Math.max(0.01, r), segments: 32 });
      const ch = Math.min(num(a.ch, s, 0), z / 2 - 0.01, Math.max(0.01, r) - 0.01);
      if (ch > 0.05) { // chamfered top & bottom edges (convex hull of three slabs)
        const inner = P.roundedRectangle({ size: [x - 2 * ch, y - 2 * ch], roundRadius: Math.max(0.01, r - ch), segments: 32 });
        const slab = (g2, z0, hh) => T.translate([0, 0, z0], E.extrudeLinear({ height: hh }, g2));
        return T.translate([0, 0, -z / 2], H.hull(slab(inner, 0, 0.01), slab(shape, ch, z - 2 * ch), slab(inner, z - 0.01, 0.01)));
      }
      return T.translate([0, 0, -z / 2], E.extrudeLinear({ height: z }, shape));
    },
    cyl(a, s) {
      const h = num(a.h, s), seg = Math.round(num(a.seg, s, SEG));
      const r1 = a.d !== undefined ? num(a.d, s) / 2 : num(a.r, s);
      const r2 = a.d2 !== undefined ? num(a.d2, s) / 2 : (a.r2 !== undefined ? num(a.r2, s) : r1);
      const ch = num(a.ch, s, 0);
      if (ch > 0.05 && Math.abs(r1 - r2) < 1e-9) { const c = Math.min(ch, h / 2 - 0.01, r1 - 0.01); return E.extrudeRotate({ segments: seg }, P.polygon({ points: [[0, -h / 2], [r1 - c, -h / 2], [r1, -h / 2 + c], [r1, h / 2 - c], [r1 - c, h / 2], [0, h / 2]] })); }
      if (Math.abs(r1 - r2) < 1e-9) return P.cylinder({ height: h, radius: r1, segments: seg });
      return P.cylinderElliptic({ height: h, startRadius: [Math.max(r1, 0.001), Math.max(r1, 0.001)], endRadius: [Math.max(r2, 0.001), Math.max(r2, 0.001)], segments: seg });
    },
    tube(a, s) {
      const h = num(a.h, s), od = num(a.od, s), id = num(a.id, s);
      return B.subtract(P.cylinder({ height: h, radius: od / 2, segments: SEG }), P.cylinder({ height: h + 0.2, radius: id / 2, segments: SEG }));
    },
    sphere(a, s) { const r = a.d !== undefined ? num(a.d, s) / 2 : num(a.r, s); return P.sphere({ radius: r, segments: 48 }); },
    torus(a, s) { return P.torus({ innerRadius: num(a.r2, s), outerRadius: num(a.r1, s), innerSegments: 32, outerSegments: SEG }); },
    poly(a, s) { const h = num(a.h, s); return T.translate([0, 0, -h / 2], E.extrudeLinear({ height: h }, poly2(a.points, s))); },
    revolve(a, s) {
      const pts = a.points.map(p => [Math.max(0, evalExpr(p[0], s)), evalExpr(p[1], s)]);
      return E.extrudeRotate({ segments: SEG, angle: num(a.angle, s, 360) * DEG }, P.polygon({ points: ccw(pts) }));
    }
  };
  function build(node, s, ctx) {
    const K = ctx.K;
    if (Array.isArray(node)) { const l = node.map(n => build(n, s, ctx)).filter(Boolean); return l.length ? K.union(l) : null; }
    if (!node || typeof node !== 'object') throw new Error('Nodo inválido');
    if (node.if !== undefined && !evalExpr(node.if, s)) return null;
    const kind = Object.keys(node).find(k => k in PRIMS || k in PRIM2D || k === 'thread' || OPS.includes(k));
    if (!kind) throw new Error('Nodo sin forma reconocida: ' + Object.keys(node).join(', '));
    const a = node[kind]; let g = null;
    const list = arr => (Array.isArray(arr) ? arr : [arr]).map(n => build(n, s, ctx)).filter(Boolean);
    if (kind in PRIMS) g = K.fromJ(PRIMS[kind](a, s, ctx));
    else if (kind in PRIM2D) { const h = num(a.h, s, kind === 'hmark' ? 1 : 2); g = K.fromJ(T.translate([0, 0, -h / 2], E.extrudeLinear({ height: h }, PRIM2D[kind](a, s, ctx)))); }
    else if (kind === 'thread') {
      let d = num(a.d, s), pitch = num(a.pitch, s, d >= 6 ? d * 0.15 : 0.5 + d * 0.08), h = num(a.h, s);
      if (a.internal) d += 2 * num(a.clearance, s, 0.25);
      g = K.fromTris(threadTris(d, pitch, h, { lead: !a.internal }));
    }
    else if (kind === 'union') { const l = list(a); g = l.length ? K.union(l) : null; }
    else if (kind === 'diff') { const l = list(a); g = l.length ? K.subtract(l[0], l.slice(1)) : null; }
    else if (kind === 'inter') { const l = list(a); g = l.length ? K.intersect(l) : null; }
    else if (kind === 'hull') { const l = list(a); g = l.length ? K.hull(l) : null; }
    else if (kind === 'array') {
      const n = Math.max(1, Math.round(num(a.n, s, 1))), step = vec(a.step, s, 3, [0, 0, 0]);
      const base = build(node.of, s, ctx), copies = [];
      if (base) for (let i = 0; i < n; i++) copies.push(K.translate(base, [step[0] * i, step[1] * i, step[2] * i]));
      g = copies.length ? K.union(copies) : null;
    } else if (kind === 'polar') {
      const n = Math.max(1, Math.round(num(a.n, s, 1))), r = num(a.r, s, 0), st = num(a.start, s, 0), span = num(a.angle, s, 360);
      const base = build(node.of, s, ctx), copies = [];
      if (base) for (let i = 0; i < n; i++) { const ang = st + (span >= 360 ? span / n : span / Math.max(1, n - 1)) * i; copies.push(K.rotate(K.translate(base, [r, 0, 0]), [0, 0, ang])); }
      g = copies.length ? K.union(copies) : null;
    }
    if (!g) return null;
    if (node.scale !== undefined) g = K.scale(g, vec(node.scale, s, 3));
    if (node.mirror) g = K.mirror(g, vec(node.mirror, s, 3));
    if (node.rot) g = K.rotate(g, vec(node.rot, s, 3));
    if (node.at) g = K.translate(g, vec(node.at, s, 3));
    return g;
  }
  function scopeFor(design, values) {
    const s = {};
    (design.params || []).forEach(p => { if (p.type === 'text') return; s[p.id] = values && values[p.id] !== undefined ? values[p.id] : evalExpr(p.value, s); });
    const vars = design.vars || {};
    Object.keys(vars).forEach(k => { s[k] = evalExpr(vars[k], s); });
    return s;
  }

  /* smart engraving spot on the bottom face (Manifold) */
  function markSpot(K, g, sizes, z) {
    const cs = g.slice(z === undefined ? 0.15 : z); try {
      for (const size of sizes) {
        const inner = cs.offset(-size * 0.62, 'Round');
        if (inner.area() > size * size * 0.05) {
          const polys = inner.toPolygons(); let best = null, ba = 0;
          for (const p of polys) { const pts = p.map(v => Array.isArray(v) ? v : [v.x, v.y]); const ar = area2(pts); if (ar > ba) { ba = ar; best = pts; } }
          inner.delete();
          if (!best) continue;
          let cx = 0, cy = 0, A = 0; for (let i = 0; i < best.length; i++) { const [x1, y1] = best[i], [x2, y2] = best[(i + 1) % best.length], c = x1 * y2 - x2 * y1; A += c; cx += (x1 + x2) * c; cy += (y1 + y2) * c; }
          A /= 2; let pt = A ? [cx / (6 * A), cy / (6 * A)] : best[0];
          if (!pip(pt, best)) pt = best[0];
          return { size, x: pt[0], y: pt[1] };
        }
        inner.delete();
      }
    } finally { cs.delete(); }
    return null;
  }
  function engraveBottom(K, g, sizes) {
    if (K.name === 'Manifold') {
      const spot = markSpot(K, g, sizes);
      if (spot) {
        const mark = K.translate(K.mirror(K.fromJ(E.extrudeLinear({ height: 1.2 }, hmark2d(spot.size))), [1, 0, 0]), [spot.x, spot.y, -0.6]);
        return { g: K.subtract(g, [mark]), ok: true, size: spot.size, where: 'abajo' };
      }
      const zt = K.bbox(g)[1][2], top = markSpot(K, g, sizes.concat([3.5]), zt - 0.15); // fallback: flat top face
      if (top) {
        const mark = K.translate(K.fromJ(E.extrudeLinear({ height: 1.2 }, hmark2d(top.size))), [top.x, top.y, zt - 0.6]);
        return { g: K.subtract(g, [mark]), ok: true, size: top.size, where: 'arriba' };
      }
      return { g, ok: false };
    }
    const bb = K.bbox(g), dx = bb[1][0] - bb[0][0], dy = bb[1][1] - bb[0][1];
    const size = Math.max(4, Math.min(12, 0.35 * Math.min(dx, dy)));
    const mark = K.translate(K.mirror(K.fromJ(E.extrudeLinear({ height: 1.2 }, hmark2d(size))), [1, 0, 0]), [(bb[0][0] + bb[1][0]) / 2, (bb[0][1] + bb[1][1]) / 2, -0.6]);
    return { g: K.subtract(g, [mark]), ok: true, size };
  }

  function kernel() { const pool = []; return H$.W ? makeKM(pool) : KJ; }

  function evaluate(design, values, opts) {
    opts = opts || {};
    const s = scopeFor(design, values), texts = {};
    (design.params || []).forEach(p => { if (p.type === 'text') texts[p.id] = values && values[p.id] !== undefined ? values[p.id] : String(p.value || ''); });
    const ctx = { hasMark: false, assets: design.assets || {}, texts, K: kernel() }, K = ctx.K;
    try {
      const defs = design.parts && design.parts.length ? design.parts : [{ name: design.name || 'Pieza', model: design.model }];
      let solids = defs.map(p => ({ name: p.name || 'Parte', color: p.color, g: build(p.model, s, ctx) })).filter(p => p.g);
      if (!solids.length) throw new Error('El modelo quedó vacío');
      // common placement: whole assembly sits on the bed, centered
      let bb = null; for (const p of solids) { const b = K.bbox(p.g); bb = bb ? [[0, 1, 2].map(i => Math.min(bb[0][i], b[0][i])), [0, 1, 2].map(i => Math.max(bb[1][i], b[1][i]))] : b; }
      const off = [-(bb[0][0] + bb[1][0]) / 2, -(bb[0][1] + bb[1][1]) / 2, -bb[0][2]];
      solids.forEach(p => { p.g = K.translate(p.g, off); });
      let autoMark = false;
      if (!ctx.hasMark && opts.autoMark !== false) {
        const r = engraveBottom(K, solids[0].g, [12, 10, 8, 6, 5, 4]);
        if (r.ok) { solids[0].g = r.g; autoMark = true; }
      }
      const parts = solids.map(p => ({ name: p.name, color: p.color, positions: K.positions(p.g) }));
      return { parts, scope: s, hasMark: ctx.hasMark || autoMark, autoMark, kernel: K.name };
    } finally { K.free(); }
  }

  /* =====================================================================
     Mesh workshop (needs Manifold)
     ===================================================================== */
  function workshopBase(positions) {
    if (!H$.W) throw new Error('El taller necesita el motor Manifold, que no cargó en esta vista.');
    const K = makeKM([]); const ix = indexedFromPositions(positions, 1e-4);
    const mesh = new H$.W.Mesh({ numProp: 3, vertProperties: ix.vert, triVerts: ix.idx }); mesh.merge();
    const m = new H$.W.Manifold(mesh); const st = m.status ? m.status() : 'NoError';
    if (st !== 'NoError' && st !== 0) { m.delete(); throw new Error('La malla tiene huecos o caras sueltas y no se puede cortar (' + st + '). Repárala en Meshy/Tripo o en Orca y vuelve a importarla.'); }
    return m;
  }
  /* best of 6 axis orientations by flat area on the bed */
  const ORIENTS = [[0, 0, 0], [180, 0, 0], [90, 0, 0], [-90, 0, 0], [0, 90, 0], [0, -90, 0]];
  function rotPoint(p, r) { // same convention as rotate([x,y,z]) in degrees: X, then Y, then Z
    let [x, y, z] = p; const [a, b, c] = r.map(v => v * DEG);
    let t = y * Math.cos(a) - z * Math.sin(a); z = y * Math.sin(a) + z * Math.cos(a); y = t;
    t = x * Math.cos(b) + z * Math.sin(b); z = -x * Math.sin(b) + z * Math.cos(b); x = t;
    t = x * Math.cos(c) - y * Math.sin(c); y = x * Math.sin(c) + y * Math.cos(c); x = t;
    return [x, y, z];
  }
  function bestOrientation(positions, base) {
    base = base || [0, 0, 0]; let best = ORIENTS[0], bestA = -1; const n = positions.length / 9;
    const step = Math.max(1, Math.floor(n / 60000));
    for (const o of ORIENTS) {
      const r = [base[0] + o[0], base[1] + o[1], base[2] + o[2]]; let zmin = Infinity; const tri = [];
      for (let t = 0; t < n; t += step) { const a = rotPoint([positions[9 * t], positions[9 * t + 1], positions[9 * t + 2]], r), b = rotPoint([positions[9 * t + 3], positions[9 * t + 4], positions[9 * t + 5]], r), c = rotPoint([positions[9 * t + 6], positions[9 * t + 7], positions[9 * t + 8]], r); tri.push([a, b, c]); zmin = Math.min(zmin, a[2], b[2], c[2]); }
      let area = 0;
      for (const [a, b, c] of tri) {
        if (Math.max(a[2], b[2], c[2]) > zmin + 0.3) continue;
        const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const nz = u[0] * v[1] - u[1] * v[0], l = Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], nz);
        if (l && nz / l < -0.97) area += l / 2;
      }
      if (area > bestA + 1e-6) { bestA = area; best = r; }
    }
    return best;
  }
  function pinSpots(cs, holeR) {
    const inner = cs.offset(-(holeR + 2.4), 'Round'), out = [];
    try {
      const polys = inner.toPolygons().map(p => p.map(v => Array.isArray(v) ? v : [v.x, v.y]));
      const solids = polys.filter(p => area2(p) > 0);
      const inside = pt => { let c = 0; for (const p of polys) if (pip(pt, p)) c++; return c % 2 === 1; };
      for (const p of solids) {
        if (area2(p) < holeR * holeR * 2) continue;
        let a = p[0], b = p[0], dmax = 0;
        for (let i = 0; i < p.length; i += Math.max(1, Math.floor(p.length / 60))) for (let j = i + 1; j < p.length; j += Math.max(1, Math.floor(p.length / 60))) { const d = Math.hypot(p[i][0] - p[j][0], p[i][1] - p[j][1]); if (d > dmax) { dmax = d; a = p[i]; b = p[j]; } }
        let cand = dmax > 30 ? [[a[0] + (b[0] - a[0]) * 0.22, a[1] + (b[1] - a[1]) * 0.22], [a[0] + (b[0] - a[0]) * 0.78, a[1] + (b[1] - a[1]) * 0.78]] : [[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]];
        cand = cand.filter(inside); if (!cand.length) cand = [p[0]];
        out.push(...cand);
      }
    } finally { inner.delete(); }
    return out.slice(0, 8);
  }
  const AXROT = { x: [0, -90, 0], y: [90, 0, 0], z: [0, 0, 0] }; // rotation that maps axis → +Z
  function workshopRun(base, o) {
    const pool = [], K = makeKM(pool), warn = [];
    const t = m => { pool.push(m); return m; };
    try {
      let g = K.rotate(base, o.rot || [0, 0, 0]);
      let bb = K.bbox(g), size = [0, 1, 2].map(i => bb[1][i] - bb[0][i]);
      if (o.size && o.size.mm > 0) { const ax = { x: 0, y: 1, z: 2 }[o.size.axis]; const cur = ax === undefined ? Math.max(...size) : size[ax]; g = K.scale(g, o.size.mm / cur); }
      bb = K.bbox(g); g = K.translate(g, [-(bb[0][0] + bb[1][0]) / 2, -(bb[0][1] + bb[1][1]) / 2, -bb[0][2]]);
      if (o.cutBase > 0) { g = K.translate(t(g.trimByPlane([0, 0, 1], o.cutBase)), [0, 0, -o.cutBase]); }
      bb = K.bbox(g); size = [0, 1, 2].map(i => bb[1][i] - bb[0][i]);
      let marked = false;
      if (o.mark !== false) { const r = engraveBottom(K, g, o.markSize ? [o.markSize] : [14, 12, 10, 8, 6, 5, 4]); if (r.ok) { g = r.g; marked = true; } else warn.push('No encontré una base plana donde grabar la marca h:. Usa "Cortar base plana".'); }
      // cut planes
      const cuts = (o.cuts || []).slice();
      if (o.autoSplit) { const bed = o.bed || [270, 270, 270], lim = bed.map(v => v - 12); ['x', 'y', 'z'].forEach((ax, i) => { if (size[i] > lim[i]) { const n = Math.ceil(size[i] / lim[i]); for (let k = 1; k < n; k++) cuts.push({ axis: ax, pos: bb[0][i] + size[i] * k / n }); } }); }
      let pieces = [g], pins = 0; const pinD = o.pinD || 4, pinDepth = o.pinDepth || 6;
      for (const c of cuts) {
        const ai = { x: 0, y: 1, z: 2 }[c.axis], normal = [0, 0, 0]; normal[ai] = 1; const next = [];
        for (const pc of pieces) {
          const pb = K.bbox(pc); if (c.pos <= pb[0][ai] + 0.5 || c.pos >= pb[1][ai] - 0.5) { next.push(pc); continue; }
          let work = pc;
          if (o.pins !== false) {
            const R = AXROT[c.axis], rot = K.rotate(pc, R), h = rotPoint(normal.map(v => v * c.pos), R)[2];
            const cs = t(rot.slice(h)); const spots = pinSpots(cs, (pinD + 0.35) / 2);
            if (spots.length) {
              const holes = spots.map(([u, v]) => K.translate(K.fromJ(P.cylinder({ radius: (pinD + 0.35) / 2, height: 2 * pinDepth, segments: 32 })), [u, v, h]));
              const holesU = K.rotate(K.rotate(K.rotate(K.union(holes), [0, 0, -R[2]]), [0, -R[1], 0]), [-R[0], 0, 0]);
              work = K.subtract(pc, [holesU]); pins += spots.length;
            }
          }
          const [a, b] = work.splitByPlane(normal, c.pos); pool.push(a, b);
          if (!a.isEmpty()) next.push(a); if (!b.isEmpty()) next.push(b);
        }
        pieces = next;
      }
      const parts = pieces.map((pc, i) => ({ name: pieces.length > 1 ? 'Parte ' + (i + 1) : 'Pieza', positions: K.positions(pc) }));
      if (pins) {
        const pin = KJ.positions(E.extrudeRotate({ segments: 32 }, P.polygon({ points: [[0, 0], [pinD / 2 - 0.4, 0], [pinD / 2, 0.4], [pinD / 2, 2 * pinDepth - 1.4], [pinD / 2 - 0.4, 2 * pinDepth - 1], [0, 2 * pinDepth - 1]] })));
        const all = new Float32Array(pin.length * pins);
        for (let k = 0; k < pins; k++) for (let i = 0; i < pin.length; i += 3) { all[k * pin.length + i] = pin[i] + k * (pinD + 4); all[k * pin.length + i + 1] = pin[i + 1]; all[k * pin.length + i + 2] = pin[i + 2]; }
        parts.push({ name: 'Pasadores ×' + pins, positions: all, pins: true });
      }
      return { parts, marked, warn, cuts: cuts.length, size };
    } finally { K.free(); }
  }

  /* =====================================================================
     Lithophane (from luminance grid)
     ===================================================================== */
  function lithophane(lum, w, h, o) {
    const px = o.widthMM / w, fb = Math.max(0, Math.round((o.frame || 0) / px)), nx = w + 2 * fb, ny = h + 2 * fb;
    const tMin = o.tMin, tMax = o.tMax, tF = o.frameT || tMax + 0.4;
    const Z = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const ii = i - fb, jj = j - fb; let z;
      if (ii < 0 || jj < 0 || ii >= w || jj >= h) z = tF;
      else { const L = lum[(h - 1 - jj) * w + ii]; z = tMin + (1 - L) * (tMax - tMin); }
      Z[j * nx + i] = z;
    }
    let marked = false;
    if (o.mark !== false && fb * px >= 4) { // engrave h: in the bottom frame strip, front face
      const size = Math.min(fb * px * 0.72, 12), shapes = hmarkShapes(size), cx = (nx * px) / 2, cy = (fb * px) / 2;
      for (let j = 0; j < fb; j++) for (let i = 0; i < nx; i++) {
        const x = i * px - cx, y = j * px - cy; let inside = false;
        for (const sh of shapes) if (pip([x, y], sh.o) && !sh.h.some(hh => pip([x, y], hh))) { inside = true; break; }
        if (inside) Z[j * nx + i] = tF - 0.6;
      }
      marked = true;
    }
    // closed mesh: top height-field + flat bottom (fan over the perimeter) + walls
    const NV = nx * ny, per = [];
    for (let i = 0; i < nx - 1; i++) per.push(i);
    for (let j = 0; j < ny - 1; j++) per.push(j * nx + nx - 1);
    for (let i = nx - 1; i > 0; i--) per.push((ny - 1) * nx + i);
    for (let j = ny - 1; j > 0; j--) per.push(j * nx);
    const NP = per.length, vert = new Float32Array((NV + NP + 1) * 3);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i; vert[3 * k] = i * px; vert[3 * k + 1] = j * px; vert[3 * k + 2] = Z[k]; }
    per.forEach((k, m) => { vert[3 * (NV + m)] = vert[3 * k]; vert[3 * (NV + m) + 1] = vert[3 * k + 1]; vert[3 * (NV + m) + 2] = 0; });
    const C = NV + NP; vert[3 * C] = (nx - 1) * px / 2; vert[3 * C + 1] = (ny - 1) * px / 2; vert[3 * C + 2] = 0;
    const tri = [];
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i, b = a + 1, c = a + nx + 1, d = a + nx; tri.push(a, b, c, a, c, d); }
    for (let m = 0; m < NP; m++) { const m2 = (m + 1) % NP, ta = per[m], tb = per[m2], ba = NV + m, bb = NV + m2; tri.push(ta, ba, bb, ta, bb, tb); tri.push(C, bb, ba); }
    const idx = new Uint32Array(tri);
    const W = (nx - 1) * px, Hh = (ny - 1) * px;
    if (H$.W) {
      const pool = [], K = makeKM(pool);
      try {
        let g = K.fromIndexed({ vert, idx });
        g = K.translate(g, [-W / 2, -Hh / 2, 0]);
        if (o.upright) {
          g = K.rotate(g, [90, 0, 0]); // image up → +Z, front face → -Y
          const bb = K.bbox(g); g = K.translate(g, [0, 0, -bb[0][2]]);
          const footD = Math.max(18, tF * 6), foot = K.translate(K.fromJ(P.cuboid({ size: [W, footD, 2.4] })), [0, (bb[0][1] + bb[1][1]) / 2, 1.2]);
          g = K.union([K.translate(g, [0, 0, 2.4 - 0.01]), foot]);
          const fb2 = K.bbox(g); g = K.translate(g, [0, 0, -fb2[0][2]]);
        }
        return { positions: K.positions(g), marked, size: [W, Hh, tF] };
      } finally { K.free(); }
    }
    const pos = new Float32Array(idx.length * 3);
    for (let i = 0; i < idx.length; i++) { pos[3 * i] = vert[3 * idx[i]] - W / 2; pos[3 * i + 1] = vert[3 * idx[i] + 1] - Hh / 2; pos[3 * i + 2] = vert[3 * idx[i] + 2]; }
    return { positions: pos, marked, size: [W, Hh, tF] };
  }

  /* =====================================================================
     Image → outline (crack-following tracer) and SVG shapes
     ===================================================================== */
  function otsu(gray) { const hist = new Array(256).fill(0); for (const g of gray) hist[g]++; const total = gray.length; let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i]; let sB = 0, wB = 0, best = 0, th = 128; for (let i = 0; i < 256; i++) { wB += hist[i]; if (!wB) continue; const wF = total - wB; if (!wF) break; sB += i * hist[i]; const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) ** 2; if (v > best) { best = v; th = i; } } return th; }
  function traceMask(mask, w, h) { // mask[y*w+x] (y down) → loops in pixel units, y up
    const at = (x, y) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x];
    const out = new Map(); // start vertex key → list of [sx,sy,ex,ey]
    const add = (sx, sy, ex, ey) => { const k = sx + ',' + sy; if (!out.has(k)) out.set(k, []); out.get(k).push([sx, sy, ex, ey]); };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue; // filled pixel; edges oriented with filled on the left (in y-down screen coords: clockwise)
      if (!at(x, y - 1)) add(x, y, x + 1, y);
      if (!at(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (!at(x, y + 1)) add(x + 1, y + 1, x, y + 1);
      if (!at(x - 1, y)) add(x, y + 1, x, y);
    }
    const loops = [];
    for (const [k0, list0] of out) {
      while (list0.length) {
        let e = list0.pop(); const loop = [[e[0], e[1]]]; let guard = 0;
        while (guard++ < 4e6) {
          const k = e[2] + ',' + e[3];
          if (e[2] === loop[0][0] && e[3] === loop[0][1]) break;
          loop.push([e[2], e[3]]);
          const cands = out.get(k); if (!cands || !cands.length) break;
          let pick = 0;
          if (cands.length > 1) { const dx = e[2] - e[0], dy = e[3] - e[1]; // prefer right turn (keeps diagonal pixels apart)
            let bestS = -9; cands.forEach((c, i) => { const cx = c[2] - c[0], cy = c[3] - c[1], cr = dx * cy - dy * cx, dt = dx * cx + dy * cy, sc = cr > 0 ? 2 : dt > 0 ? 1 : 0; if (sc > bestS) { bestS = sc; pick = i; } }); }
          e = cands.splice(pick, 1)[0];
        }
        if (loop.length >= 4) loops.push(loop.map(([x, y]) => [x, h - y]));
      }
    }
    return loops;
  }
  function simplify(pts, eps) { // closed Douglas–Peucker
    if (pts.length < 8) return pts;
    let far = 0, fd = 0; for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]); if (d > fd) { fd = d; far = i; } }
    const dp = (a) => { if (a.length < 3) return a; const [x1, y1] = a[0], [x2, y2] = a[a.length - 1], L = Math.hypot(x2 - x1, y2 - y1) || 1e-9; let im = 0, dm = 0; for (let i = 1; i < a.length - 1; i++) { const d = Math.abs((x2 - x1) * (y1 - a[i][1]) - (x1 - a[i][0]) * (y2 - y1)) / L; if (d > dm) { dm = d; im = i; } } if (dm > eps) { const l = dp(a.slice(0, im + 1)), r = dp(a.slice(im)); return l.slice(0, -1).concat(r); } return [a[0], a[a.length - 1]]; };
    const A = dp(pts.slice(0, far + 1)), Bp = dp(pts.slice(far).concat([pts[0]]));
    return A.slice(0, -1).concat(Bp.slice(0, -1));
  }
  function smoothLoop(pts, it) { for (let k = 0; k < it; k++) { const o = []; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; o.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]); } pts = o; } return pts; }
  /* rgba → asset {aspect, shapes normalized to width 1} */
  function traceImage(rgba, w, h, o) {
    o = o || {}; const gray = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) { const a = rgba[4 * i + 3] / 255; gray[i] = Math.round((rgba[4 * i] * 0.299 + rgba[4 * i + 1] * 0.587 + rgba[4 * i + 2] * 0.114) * a + 255 * (1 - a)); }
    const th = o.threshold !== undefined && o.threshold >= 0 ? o.threshold : otsu(gray);
    const mask = new Uint8Array(w * h); let on = 0;
    for (let i = 0; i < w * h; i++) { const dark = gray[i] <= th; mask[i] = (o.invert ? !dark : dark) ? 1 : 0; on += mask[i]; }
    if (!on) throw new Error('No encontré formas en la imagen. Prueba "Invertir" o mueve el umbral.');
    let loops = traceMask(mask, w, h).filter(l => Math.abs(area2(l)) >= (o.minArea || 4));
    loops = loops.map(l => smoothLoop(simplify(l, o.eps || 0.75), o.smooth || 0));
    return normalizeShapes(loopsToShapes(loops), th);
  }
  function normalizeShapes(shapes, th) {
    if (!shapes.length) throw new Error('No encontré formas en la imagen.');
    const [x0, y0, x1, y1] = bounds2(shapes), W = x1 - x0 || 1, R = v => Math.round(v * 1e4) / 1e4;
    return { aspect: (y1 - y0) / W, threshold: th, shapes: mapShapes(shapes, ([x, y]) => [R((x - x0) / W), R((y - y0) / W)]) };
  }
  /* THREE.SVGLoader result → asset */
  function svgToAsset(THREE, text) {
    const data = new THREE.SVGLoader().parse(text), shapes = [];
    for (const path of data.paths) {
      const st = path.userData && path.userData.style; if (st && st.fill === 'none') continue;
      for (const sh of THREE.SVGLoader.createShapes(path)) {
        const o = sh.getPoints(12).map(p => [p.x, -p.y]), h = sh.holes.map(hh => hh.getPoints(12).map(p => [p.x, -p.y]));
        if (o.length >= 3) shapes.push({ o: ccw(dedupe(o)), h: h.map(x => cw(dedupe(x))).filter(x => x.length >= 3) });
      }
    }
    return normalizeShapes(shapes, null);
  }

  /* =====================================================================
     Measurements, STL, zip
     ===================================================================== */
  function checks(list, bed) {
    bed = bed || [270, 270, 270];
    let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity], vol = 0, over = 0, total = 0, bedArea = 0, tris = 0, partFits = true;
    let zmin = Infinity; for (const p of list) for (let i = 2; i < p.length; i += 3) zmin = Math.min(zmin, p[i]);
    for (const pos of list) {
      let pm = [Infinity, Infinity, Infinity], px = [-Infinity, -Infinity, -Infinity];
      for (let t = 0; t < pos.length; t += 9) {
        const a = [pos[t], pos[t + 1], pos[t + 2]], b = [pos[t + 3], pos[t + 4], pos[t + 5]], c = [pos[t + 6], pos[t + 7], pos[t + 8]]; tris++;
        for (const v of [a, b, c]) for (let i = 0; i < 3; i++) { pm[i] = Math.min(pm[i], v[i]); px[i] = Math.max(px[i], v[i]); }
        vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
        const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        const ar = Math.hypot(n[0], n[1], n[2]) / 2; if (!ar) continue; total += ar;
        const nz = n[2] / (2 * ar), zl = Math.min(a[2], b[2], c[2]);
        if (nz < -0.995 && zl < zmin + 0.05) bedArea += ar;
        else if (nz < -0.7071 && zl > zmin + 0.3) over += ar;
      }
      for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], pm[i]); mx[i] = Math.max(mx[i], px[i]); }
      const ps = [0, 1, 2].map(i => px[i] - pm[i]); if (ps[0] > bed[0] || ps[1] > bed[1] || ps[2] > bed[2]) partFits = false;
    }
    const size = [0, 1, 2].map(i => mx[i] - mn[i]), v = Math.abs(vol) / 1000;
    return { size, vol: v, grams: v * 1.24 * 0.45, overhangPct: total ? over / total * 100 : 0, bedArea: bedArea / 100, fits: partFits, triangles: tris };
  }
  function stlBinary(pos, name) {
    const n = pos.length / 9, buf = new ArrayBuffer(84 + n * 50), dv = new DataView(buf);
    const head = ('h: Studio - hackgorithmic - ' + (name || 'pieza')).slice(0, 79);
    for (let i = 0; i < head.length; i++) dv.setUint8(i, head.charCodeAt(i) & 0x7f);
    dv.setUint32(80, n, true); let o = 84;
    for (let t = 0; t < n; t++) {
      const k = 9 * t, ux = pos[k + 3] - pos[k], uy = pos[k + 4] - pos[k + 1], uz = pos[k + 5] - pos[k + 2], vx = pos[k + 6] - pos[k], vy = pos[k + 7] - pos[k + 1], vz = pos[k + 8] - pos[k + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1;
      dv.setFloat32(o, nx / l, true); dv.setFloat32(o + 4, ny / l, true); dv.setFloat32(o + 8, nz / l, true); o += 12;
      for (let j = 0; j < 9; j++) { dv.setFloat32(o, pos[k + j], true); o += 4; }
      dv.setUint16(o, 0, true); o += 2;
    }
    return new Uint8Array(buf);
  }
  function parseSTL(buf) {
    const u8 = new Uint8Array(buf), dv = new DataView(buf);
    if (u8.length >= 84) { const n = dv.getUint32(80, true); if (84 + n * 50 === u8.length) { const out = new Float32Array(n * 9); let o = 84; for (let t = 0; t < n; t++) { o += 12; for (let j = 0; j < 9; j++) { out[9 * t + j] = dv.getFloat32(o, true); o += 4; } o += 2; } return out; } }
    const txt = new TextDecoder().decode(u8), re = /vertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g, v = []; let m;
    while ((m = re.exec(txt))) v.push(+m[1], +m[2], +m[3]);
    if (!v.length || v.length % 9) throw new Error('No pude leer ese STL.');
    return new Float32Array(v);
  }
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(d) { let c = 0xffffffff; for (let i = 0; i < d.length; i++) c = CRC[(c ^ d[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  function zip(files) {
    const enc = new TextEncoder(), norm = files.map(f => ({ name: f.name, data: typeof f.data === 'string' ? enc.encode(f.data) : f.data }));
    const ff = (typeof fflate !== 'undefined' && fflate) || (typeof self !== 'undefined' && self.fflate);
    if (ff && ff.zipSync) { const o = {}; norm.forEach(f => { o[f.name] = [f.data, { level: 6 }]; }); return ff.zipSync(o); }
    const parts = [], central = []; let off = 0;
    for (const f of norm) {
      const data = f.data, nm = enc.encode(f.name), crc = crc32(data), lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(12, 0x21, true); lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, nm.length, true);
      parts.push(new Uint8Array(lh.buffer), nm, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(14, 0x21, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, nm.length, true); ch.setUint32(42, off, true);
      central.push(new Uint8Array(ch.buffer), nm); off += 30 + nm.length + data.length;
    }
    const csize = central.reduce((a, b) => a + b.length, 0), end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, norm.length, true); end.setUint16(10, norm.length, true); end.setUint32(12, csize, true); end.setUint32(16, off, true);
    const all = [...parts, ...central, new Uint8Array(end.buffer)], out = new Uint8Array(all.reduce((a, b) => a + b.length, 0)); let p = 0;
    for (const a of all) { out.set(a, p); p += a.length; }
    return out;
  }
  function dropToBed(pos) { let zmin = Infinity, xmn = Infinity, xmx = -Infinity, ymn = Infinity, ymx = -Infinity; for (let i = 0; i < pos.length; i += 3) { zmin = Math.min(zmin, pos[i + 2]); xmn = Math.min(xmn, pos[i]); xmx = Math.max(xmx, pos[i]); ymn = Math.min(ymn, pos[i + 1]); ymx = Math.max(ymx, pos[i + 1]); } const o = new Float32Array(pos.length), cx = (xmn + xmx) / 2, cy = (ymn + ymx) / 2; for (let i = 0; i < pos.length; i += 3) { o[i] = pos[i] - cx; o[i + 1] = pos[i + 1] - cy; o[i + 2] = pos[i + 2] - zmin; } return o; }

  return {
    setManifold(W) { H$.W = W; }, hasManifold: () => !!H$.W,
    setFont(font) { H$.font = font; try { const os2 = font.tables.os2; H$.fontCap = (os2 && os2.sCapHeight ? os2.sCapHeight : 0.7 * font.unitsPerEm) / font.unitsPerEm; } catch (e) {} },
    evalExpr, evaluate, scopeFor, checks, stlBinary, parseSTL, zip, dropToBed,
    workshopBase, workshopRun, bestOrientation, lithophane, traceImage, svgToAsset, hmarkShapes, rotPoint
  };
});
