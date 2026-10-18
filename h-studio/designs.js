const H_TEMPLATES = [
  {
    name: "Abrazadera de tubo",
    note: "Para la montura modular: se cierra con un tornillo.",
    params: [
      { id: "tubo", label: "Diámetro del tubo", value: 25.4, min: 10, max: 60, step: 0.1, unit: "mm" },
      { id: "ancho", label: "Ancho", value: 20, min: 8, max: 60, step: 1, unit: "mm" },
      { id: "pared", label: "Grosor de pared", value: 4, min: 2, max: 10, step: 0.5, unit: "mm" },
      { id: "tornillo", label: "Agujero del tornillo", value: 5.3, min: 2, max: 10, step: 0.1, unit: "mm" },
      { id: "holgura", label: "Holgura", value: 0.3, min: 0, max: 1, step: 0.05, unit: "mm" }
    ],
    vars: { R: "tubo/2+pared+holgura", gap: "2", oreja: "tornillo+8" },
    model: { diff: [
      { union: [
        { cyl: { d: "2*R", h: "ancho" } },
        { box: { size: ["oreja+pared", "gap+2*pared", "ancho"] }, at: ["R+oreja/2-pared/2", 0, 0] },
        { box: { size: [4, "min(ancho*0.9, 2*R)", "ancho"] }, at: ["-R+1", 0, 0] }
      ] },
      { cyl: { d: "tubo+2*holgura", h: "ancho+2" } },
      { box: { size: ["R+oreja+2", "gap", "ancho+2"] }, at: ["(R+oreja+2)/2", 0, 0] },
      { cyl: { d: "tornillo", h: "gap+2*pared+4" }, rot: [90, 0, 0], at: ["R+oreja/2-pared/2+1", 0, 0] },
      { hmark: { size: "min(10, ancho*0.6)", h: 1.2 }, rot: [90, 0, -90], at: ["-R-1", 0, 0] }
    ] }
  },
  {
    name: "Caja redondeada",
    note: "Caja hueca de esquinas redondas, sello h: debajo.",
    params: [
      { id: "largo", label: "Largo", value: 80, min: 20, max: 250, step: 1, unit: "mm" },
      { id: "ancho", label: "Ancho", value: 60, min: 20, max: 250, step: 1, unit: "mm" },
      { id: "alto", label: "Alto", value: 40, min: 10, max: 250, step: 1, unit: "mm" },
      { id: "pared", label: "Pared", value: 2.4, min: 1.2, max: 6, step: 0.2, unit: "mm" },
      { id: "radio", label: "Radio de esquina", value: 8, min: 1, max: 30, step: 0.5, unit: "mm" }
    ],
    model: { diff: [
      { rbox: { size: ["largo", "ancho", "alto"], r: "radio" } },
      { rbox: { size: ["largo-2*pared", "ancho-2*pared", "alto"], r: "max(0.5, radio-pared)" }, at: [0, 0, "pared"] },
      { hmark: { size: "min(16, ancho*0.3)", h: 1.2 }, mirror: [1, 0, 0], at: [0, 0, "-alto/2"] }
    ] }
  },
  {
    name: "Soporte en L",
    note: "Escuadra con refuerzo y agujeros avellanados.",
    params: [
      { id: "ancho", label: "Ancho", value: 30, min: 10, max: 120, step: 1, unit: "mm" },
      { id: "base", label: "Largo de la base", value: 45, min: 15, max: 150, step: 1, unit: "mm" },
      { id: "alto", label: "Alto", value: 45, min: 15, max: 150, step: 1, unit: "mm" },
      { id: "grosor", label: "Grosor", value: 5, min: 2, max: 12, step: 0.5, unit: "mm" },
      { id: "agujero", label: "Agujero", value: 4.5, min: 2, max: 10, step: 0.1, unit: "mm" }
    ],
    model: { diff: [
      { union: [
        { box: { size: ["base", "ancho", "grosor"] }, at: ["base/2", 0, "grosor/2"] },
        { box: { size: ["grosor", "ancho", "alto"] }, at: ["grosor/2", 0, "alto/2"] },
        { poly: { points: [["grosor", 0], ["base*0.6", 0], ["grosor", "alto*0.6"]], h: "grosor" }, rot: [90, 0, 0], at: [0, 0, "grosor"] }
      ] },
      { cyl: { d: "agujero", h: "grosor*3" }, at: ["base*0.78", 0, 0] },
      { cyl: { d: "agujero*2.1", d2: "agujero", h: "agujero*0.55" }, at: ["base*0.78", 0, "grosor-agujero*0.275+0.01"] },
      { cyl: { d: "agujero", h: "grosor*3" }, rot: [0, 90, 0], at: [0, 0, "alto*0.78"] },
      { cyl: { d: "agujero*2.1", d2: "agujero", h: "agujero*0.55" }, rot: [0, -90, 0], at: ["agujero*0.275-0.01", 0, "alto*0.78"] },
      { hmark: { size: "min(9, ancho*0.3)", h: 1.2 }, at: ["base*0.55", "-ancho*0.28", "grosor"] }
    ] }
  },
  {
    name: "Llavero con nombre",
    note: "Dos colores: base y letras en relieve. Acepta acentos y ñ.",
    params: [
      { id: "nombre", label: "Texto", type: "text", value: "José" },
      { id: "largo", label: "Largo", value: 72, min: 40, max: 120, step: 1, unit: "mm" },
      { id: "alto", label: "Alto", value: 22, min: 12, max: 40, step: 1, unit: "mm" },
      { id: "base", label: "Grosor base", value: 3, min: 1.5, max: 6, step: 0.2, unit: "mm" },
      { id: "relieve", label: "Relieve letras", value: 1.2, min: 0.6, max: 3, step: 0.2, unit: "mm" },
      { id: "letra", label: "Tamaño de letra", value: 10, min: 5, max: 20, step: 0.5, unit: "mm" }
    ],
    parts: [
      { name: "Base", color: "#f4f1fa", model: { diff: [
        { rbox: { size: ["largo", "alto", "base"], r: "alto/2-0.5", ch: 0.6 } },
        { cyl: { d: 5, h: "base+2" }, at: ["-largo/2+alto/2", 0, 0] }
      ] } },
      { name: "Letras", color: "#6b3fe0", model: { union: [
        { text: { t: "$nombre", size: "letra", h: "relieve", fit: ["largo-alto*1.9", "alto*0.62"] }, at: ["alto*0.6", 0, "base/2+relieve/2"] },
        { hmark: { size: "alto*0.36", h: "relieve" }, at: ["-largo/2+alto*1.12", 0, "base/2+relieve/2"] }
      ] } }
    ]
  },
  {
    name: "Tornillo y tuerca",
    note: "Rosca métrica real. Imprime de pie; prueba la holgura.",
    params: [
      { id: "d", label: "Métrica (diámetro)", value: 10, min: 5, max: 30, step: 1, unit: "mm" },
      { id: "paso", label: "Paso de rosca", value: 1.5, min: 0.8, max: 3.5, step: 0.05, unit: "mm" },
      { id: "largo", label: "Largo del tornillo", value: 25, min: 8, max: 120, step: 1, unit: "mm" },
      { id: "holgura", label: "Holgura de la tuerca", value: 0.3, min: 0, max: 0.8, step: 0.05, unit: "mm" }
    ],
    vars: { cab: "d*1.7", hc: "d*0.65", tu: "d*0.85" },
    model: { union: [
      { union: [
        { thread: { d: "d", pitch: "paso", h: "largo" }, at: [0, 0, "hc+largo/2"] },
        { cyl: { d: "cab*1.155", h: "hc", seg: 6, ch: 0.6 }, at: [0, 0, "hc/2"] }
      ], at: ["-cab*0.75", 0, 0] },
      { diff: [
        { cyl: { d: "cab*1.155", h: "tu", seg: 6, ch: 0.6 }, at: [0, 0, "tu/2"] },
        { thread: { d: "d", pitch: "paso", h: "tu+2", internal: true, clearance: "holgura" }, at: [0, 0, "tu/2"] }
      ], at: ["cab*0.75", 0, 0] }
    ] }
  }
];
if (typeof module === 'object') module.exports = H_TEMPLATES;
