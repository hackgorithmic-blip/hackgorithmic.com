/* ===== Página hackgorithmic: tarifas y cotizador STL (el pedido se hace en el checkout: pedidos.js) ===== */
/* ===== Tarifas hackgorithmic 3D (editar aquí) ===== */
const T={
  kg:{pla:22,petg:26},      // $ por kilo de filamento
  merma:1.15,               // +15% por purga, soportes y pruebas
  hora:3.00,                // $ por hora de máquina (luz, desgaste, mantenimiento)
  margen:2.0,               // multiplica material + máquina
  prep:3.00,                // preparación por pedido (laminado, revisión, empaque)
  colorExtra:0.20,          // +20% de tiempo y material por cada color extra
  lote:0.85,                // cada pieza extra del mismo pedido cuesta 85% en máquina
  minimo:8.00,              // pedido mínimo
  minPieza:5.00,            // ninguna pieza sale en menos de esto
  gph:25                    // gramos por hora aprox. de la U1 (medido: plato de ~150 g en ~4 h)
};
function cotizar({g,h,mat="pla",colores=1,qty=1,prep=T.prep}){
  const cx=1+T.colorExtra*(colores-1);
  const gT=g*cx*T.merma*(1+(qty-1)), hT=h*cx*(1+(qty-1)*T.lote);
  const mat$=gT/1000*T.kg[mat], maq$=hT*T.hora;
  const sub=(mat$+maq$)*T.margen+prep;
  const total=Math.max(T.minimo,sub,qty*T.minPieza);
  return {gT,hT,mat$:mat$*T.margen,maq$:maq$*T.margen,prep,total,min:total>sub};
}
const $$=n=>"$"+n.toFixed(2);
const $=s=>document.querySelector(s);
/* ---- cotizador STL ---- */
let stl=null, stlLoadId=0;
function clearQuote(message="Selecciona un archivo para estimar"){
  $("#qdims").textContent="";
  $("#qwarn").textContent="";
  $("#qbk").innerHTML="<tr><td>"+message+"</td><td>—</td></tr>";
  $("#qtot").textContent="—";
  $("#qmsg").textContent="";
  $("#qorder").disabled=true;
}
function parseSTL(buf){
  const dv=new DataView(buf); let tris=[];
  const n0=buf.byteLength>=84?dv.getUint32(80,true):0, fit=Math.max(0,Math.floor((buf.byteLength-84)/50));
  const head=new TextDecoder().decode(buf.slice(0,Math.min(1024,buf.byteLength))), ascii=/^\s*solid/.test(head)&&/facet|vertex/.test(head);
  const n=(n0>0&&n0<=fit)?n0:fit;
  if(buf.byteLength>=134&&(buf.byteLength===84+n0*50||!ascii)){ for(let i=0;i<n;i++){const o=84+i*50+12;const v=[];for(let k=0;k<9;k++)v.push(dv.getFloat32(o+k*4,true));tris.push(v);} }
  else{ const t=new TextDecoder().decode(buf); const re=/vertex\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)/g; let m,v=[];
    while((m=re.exec(t))){v.push(+m[1],+m[2],+m[3]); if(v.length===9){tris.push(v);v=[];}} if(v.length) throw new Error("STL incompleto"); }
  let vol=0,mn=[Infinity,Infinity,Infinity],mx=[-Infinity,-Infinity,-Infinity];
  for(const a of tris){
    if(!a.every(Number.isFinite)) throw new Error("Coordenadas no válidas");
    vol+=(a[0]*(a[4]*a[8]-a[5]*a[7])-a[1]*(a[3]*a[8]-a[5]*a[6])+a[2]*(a[3]*a[7]-a[4]*a[6]))/6;
    for(let k=0;k<9;k++){const ax=k%3; if(a[k]<mn[ax])mn[ax]=a[k]; if(a[k]>mx[ax])mx[ax]=a[k];} }
  const result={tris:tris.length, cm3:Math.abs(vol)/1000, size:mx.map((x,i)=>x-mn[i])};
  if(!result.tris||!Number.isFinite(result.cm3)||result.cm3<=0||!result.size.every(x=>Number.isFinite(x)&&x>0)) throw new Error("Geometría no válida");
  return result;
}
function recalc(){
  if(!stl){return;}
  const qty=Number($("#qqty").value);
  const validQty=Number.isInteger(qty)&&qty>=1&&qty<=50;
  $("#qqty").setCustomValidity(validQty?"":"Indica una cantidad entera entre 1 y 50.");
  if(!validQty){clearQuote("Revisa la cantidad para calcular"); $("#qmsg").textContent="Indica una cantidad entera entre 1 y 50. Para más piezas, pídelo y ajustamos el lote."; return;}
  const f=Number($("#qinf").value), mat=$("#qmat").value, col=Number($("#qcol").value), V=stl.cm3;
  if(![0.35,0.55,1].includes(f)||!["pla","petg"].includes(mat)||!Number.isInteger(col)||col<1||col>4){clearQuote("Revisa las opciones de impresión"); return;}
  const fe=f+(1-f)*Math.exp(-V/8);                // aproximación de paredes y relleno, sin laminado
  const dens=mat==="petg"?1.27:1.24;
  const g=V*dens*fe, h=g/T.gph+0.15;
  const q=cotizar({g,h,mat,colores:col,qty});
  if(![q.gT,q.hT,q.mat$,q.maq$,q.prep,q.total].every(Number.isFinite)||!Number.isSafeInteger(Math.round(q.total*100))){clearQuote("Esta pieza necesita revisión manual"); $("#qmsg").textContent="No podemos estimar esta geometría automáticamente. Puedes pedirla igual: la revisamos y te cotizamos."; $("#qorder").disabled=false; return;}
  // Redondeamos el subtotal una sola vez y repartimos sus centavos entre las partidas.
  const materialCents=Math.round(q.mat$*100), prepCents=Math.round(q.prep*100);
  const subtotalCents=Math.round((q.mat$+q.maq$+q.prep)*100), totalCents=Math.round(q.total*100);
  const machineCents=subtotalCents-materialCents-prepCents, adjustmentCents=totalCents-subtotalCents;
  $("#qdims").innerHTML="<span><b>"+stl.size.map(x=>x.toFixed(1)).join(" × ")+"</b> mm</span><span>≈ <b>"+q.gT.toFixed(1)+"</b> g</span><span>≈ <b>"+q.hT.toFixed(1)+"</b> h de máquina</span>";
  $("#qwarn").textContent=stl.size.some(x=>x>265)?"Una medida supera 265 mm. Debemos revisar orientación, máquina y viabilidad antes de confirmar la fabricación.":"";
  $("#qbk").innerHTML="<tr><td>Material estimado ("+q.gT.toFixed(1)+" g "+mat.toUpperCase()+")</td><td>"+$$(materialCents/100)+"</td></tr><tr><td>Máquina estimada ("+q.hT.toFixed(1)+" h)</td><td>"+$$(machineCents/100)+"</td></tr><tr><td>Preparación del pedido</td><td>"+$$(prepCents/100)+"</td></tr>"+(adjustmentCents>0?"<tr><td>Ajuste al precio mínimo</td><td>"+$$(adjustmentCents/100)+"</td></tr>":"");
  $("#qtot").textContent=$$(totalCents/100);
  $("#qorder").disabled=false;
  $("#qmsg").textContent="";
}
async function loadFile(file){
  const loadId=++stlLoadId;
  stl=null;
  clearQuote();
  $("#drop").classList.remove("on");
  if(!file){$("#fname").textContent="o arrástralo aquí"; return;}
  $("#fname").textContent="Leyendo "+file.name+"…";
  try{
    if(!/\.stl$/i.test(file.name)) throw new Error("Selecciona un STL");
    const buffer=await file.arrayBuffer();
    if(loadId!==stlLoadId) return;
    const parsed=parseSTL(buffer);
    parsed.name=file.name;
    parsed.file=file;
    stl=parsed;
    $("#fname").textContent=file.name+" · "+stl.tris.toLocaleString()+" triángulos";
    $("#drop").classList.add("on");
    recalc();
  }catch(e){
    if(loadId!==stlLoadId) return;
    stl=null;
    clearQuote();
    $("#drop").classList.remove("on");
    $("#fname").textContent="No pudimos calcular este archivo. Selecciona un STL válido con volumen y medidas en milímetros.";
  }
}
$("#stl").addEventListener("change",e=>loadFile(e.target.files[0]));
["dragover","dragenter"].forEach(ev=>$("#drop").addEventListener(ev,e=>{e.preventDefault();$("#drop").classList.add("on");}));
$("#drop").addEventListener("drop",e=>{e.preventDefault();loadFile(e.dataTransfer.files[0]);});
["qmat","qinf","qcol","qqty"].forEach(id=>$("#"+id).addEventListener("input",recalc));
/* Estimado en centavos para una cantidad (lo usa el checkout al cambiar la cantidad). */
function estimadoSTL(qty){
  if(!stl)return null;
  const f=Number($("#qinf").value), mat=$("#qmat").value, col=Number($("#qcol").value), V=stl.cm3;
  const fe=f+(1-f)*Math.exp(-V/8), g=V*(mat==="petg"?1.27:1.24)*fe, h=g/T.gph+0.15;
  const t=cotizar({g,h,mat,colores:col,qty}).total;
  return Number.isFinite(t)?Math.round(t*100):null;
}
/* "Pedir esta impresión": el pedido se hace dentro de la web (cuenta + checkout). El STL se sube al confirmar. */
$("#qorder").addEventListener("click",()=>{
  if(!stl||$("#qorder").disabled)return;
  if(stl.file&&stl.file.size>25*1024*1024){$("#qmsg").textContent="Tu archivo pesa más de 25 MB. Redúcelo (menos triángulos) para poder pedirlo.";return;}
  if(!window.HGCheckout){$("#qmsg").textContent="No pudimos abrir el pedido. Recarga la página.";return;}
  const qty=Math.min(50,Math.max(1,Math.floor(Number($("#qqty").value))||1)), mat=$("#qmat").value.toUpperCase(), col=Number($("#qcol").value);
  const mm=stl.size.map(x=>x.toFixed(0)).join(" × ");
  HGCheckout.start({kind:"stl",title:stl.name.replace(/\.stl$/i,"").slice(0,100)||"Mi archivo STL",
    specs:[mm+" mm",mat+" · relleno "+$("#qinf").selectedOptions[0].text,col+" color"+(col>1?"es":"")],
    qty,price:estimadoSTL,file:stl.file,fileKind:"stl",fileLabel:"Al realizar el pedido subimos "+stl.name+" para revisarlo y fabricarlo.",
    custom:{file_name:stl.name.slice(0,120),mm,material:mat,infill:$("#qinf").selectedOptions[0].text,colors:String(col)}});
});
