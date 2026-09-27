/* ===== Página hackgorithmic: tarifas, llavero, cotizador STL, pedidos ===== */
/* ===== Tarifas hackgorithmic 3D (editar aquí) ===== */
const T={
  kg:{pla:22,petg:26},      // $ por kilo de filamento
  merma:1.15,               // +15% por purga, soportes y pruebas
  hora:3.00,                // $ por hora de máquina (luz, desgaste, mantenimiento)
  margen:2.0,               // multiplica material + máquina
  prep:3.00,                // preparación por pedido (laminado, revisión, empaque)
  prepLlavero:2.00,         // los llaveros ya salen diseñados solos
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
/* Precio fijo de llaveros con nombre (2 colores) */
const LLAVERO={uno:7, tres:18, cinco:25, extra:5};
function precioLlaveros(n){ if(n>=5) return LLAVERO.cinco+(n-5)*LLAVERO.extra; if(n>=3) return LLAVERO.tres+(n-3)*6; return n*LLAVERO.uno; }

const COL={rosa:"#e0457b",negro:"#1b1c1f",blanco:"#f4f4f2",cian:"#1596a6",rojo:"#d3312f",amarillo:"#f2c230"};
const FONT={script:"'Pacifico', cursive",round:"'Baloo 2', sans-serif",block:"'Bungee', sans-serif"};
const st={name:"Sofía",f:"script",base:"rosa",letter:"blanco",aro:"izq"};
const $=s=>document.querySelector(s);
function swatches(el,key,list){
  el.innerHTML="";
  list.forEach(c=>{const b=document.createElement("button");b.className="sw";b.type="button";b.style.background=COL[c];b.title=c;b.setAttribute("aria-label",c);
    b.setAttribute("aria-pressed",String(st[key]===c));b.onclick=()=>{st[key]=c;swatches(el,key,list);draw();};el.appendChild(b);});
}
function keychain(svg,name,f,base,letter,aro="izq"){
  const ns="http://www.w3.org/2000/svg"; svg.innerHTML="";
  const g=document.createElementNS(ns,"g"); svg.appendChild(g);
  const mk=(stroke,sw,fill)=>{const t=document.createElementNS(ns,"text");t.textContent=name||" ";t.setAttribute("x","330");t.setAttribute("y","150");
    t.setAttribute("text-anchor","middle");t.setAttribute("font-size",f==="block"?"96":"118");t.setAttribute("style","font-family:"+FONT[f]);
    t.setAttribute("fill",fill);if(stroke){t.setAttribute("stroke",stroke);t.setAttribute("stroke-width",sw);t.setAttribute("stroke-linejoin","round");t.setAttribute("paint-order","stroke");}
    return t;};
  const shadow=mk("#000",46,"#000"); shadow.setAttribute("opacity",".35"); shadow.setAttribute("transform","translate(5,7)");
  const baseT=mk(COL[base],40,COL[base]); const top=mk(null,0,COL[letter]);
  g.append(shadow,baseT,top);
  let bb; try{bb=baseT.getBBox();}catch(e){bb={x:120,y:60,width:420,height:120};}
  const ry=bb.y+bb.height*0.45, sides=aro==="ambos"?[-1,1]:[aro==="der"?1:-1];
  for(const d of sides){
    const rx=d<0?bb.x-8:bb.x+bb.width+8;
    const ring=document.createElementNS(ns,"circle");ring.setAttribute("cx",rx);ring.setAttribute("cy",ry);ring.setAttribute("r","26");ring.setAttribute("fill",COL[base]);
    const hole=document.createElementNS(ns,"circle");hole.setAttribute("cx",rx);hole.setAttribute("cy",ry);hole.setAttribute("r","11");hole.setAttribute("fill","#1a1b1e");
    const metal=document.createElementNS(ns,"circle");metal.setAttribute("cx",rx+30*d);metal.setAttribute("cy",ry);metal.setAttribute("r","30");metal.setAttribute("fill","none");metal.setAttribute("stroke","#b9bcc2");metal.setAttribute("stroke-width","6");
    g.insertBefore(ring,baseT); g.insertBefore(metal,ring); g.insertBefore(hole,baseT);
  }
  try{const b=g.getBBox(); const pad=14; svg.setAttribute("viewBox",[b.x-pad,b.y-pad,b.width+2*pad,b.height+2*pad].join(" ")); return b;}catch(e){return bb;}
}
/* Cantidad válida de llaveros: entero de 1 a 50 (lo mismo que acepta el pedido). */
const cantidad=v=>Math.min(50,Math.max(1,Math.floor(+v)||1));
function draw(){
  const raw=+$("#kq").value, okQ=Number.isInteger(raw)&&raw>=1&&raw<=50, n=cantidad(raw);
  $("#kprice").innerHTML=okQ?"Precio: <b>"+$$(precioLlaveros(n))+"</b>"+(n>1?" <small style='font:500 13px var(--body);color:var(--ink2)'>("+$$(precioLlaveros(n)/n)+" c/u)</small>":""):"Indica de 1 a 50 llaveros. Para más, escríbenos a hackgorithmic@gmail.com.";
  if(typeof syncOrder==="function") syncOrder();
  /* Si la vista del llavero está oculta, no se mide (getBBox daría 0): se redibuja al mostrarla. */
  if(!$("#kc").getClientRects().length)return;
  const b=keychain($("#kc"),st.name,st.f,st.base,st.letter,st.aro);
  if(!b||!b.width||!b.height)return;
  const hmm=20, wmm=Math.max(25,Math.round(b.width/b.height*hmm)); const tmm=4;
  const grams=Math.max(2,(wmm*hmm*tmm*0.45*1.24/1000)).toFixed(1);
  const mins=Math.round(12+wmm*0.35);
  $("#dims").textContent=wmm+" × "+hmm+" mm";
  $("#specs").innerHTML="<span><b>"+wmm+" × "+hmm+" × "+tmm+"</b> mm</span><span>≈ <b>"+grams+"</b> g PLA</span><span>≈ <b>"+mins+"</b> min</span><span><b>2</b> colores</span>";
}
$("#kq").addEventListener("input",draw);
/* ---- cotizador STL ---- */
let stl=null, stlLoadId=0;
function clearQuote(message="Selecciona un archivo para estimar"){
  $("#qdims").textContent="";
  $("#qwarn").textContent="";
  $("#qbk").innerHTML="<tr><td>"+message+"</td><td>—</td></tr>";
  $("#qtot").textContent="—";
  $("#qsummary").value="";
  $("#qmsg").textContent="";
  $("#qsend").disabled=true;
  $("#qcopy").disabled=true;
  window._q="";
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
  const validQty=Number.isInteger(qty)&&qty>=1&&qty<=100;
  $("#qqty").setCustomValidity(validQty?"":"Indica una cantidad entera entre 1 y 100.");
  if(!validQty){clearQuote("Revisa la cantidad para calcular"); $("#qmsg").textContent="Indica una cantidad entera entre 1 y 100."; return;}
  const f=Number($("#qinf").value), mat=$("#qmat").value, col=Number($("#qcol").value), V=stl.cm3;
  if(![0.35,0.55,1].includes(f)||!["pla","petg"].includes(mat)||!Number.isInteger(col)||col<1||col>4){clearQuote("Revisa las opciones de impresión"); return;}
  const fe=f+(1-f)*Math.exp(-V/8);                // aproximación de paredes y relleno, sin laminado
  const dens=mat==="petg"?1.27:1.24;
  const g=V*dens*fe, h=g/T.gph+0.15;
  const q=cotizar({g,h,mat,colores:col,qty});
  if(![q.gT,q.hT,q.mat$,q.maq$,q.prep,q.total].every(Number.isFinite)||!Number.isSafeInteger(Math.round(q.total*100))){clearQuote("Esta pieza necesita revisión manual"); $("#qmsg").textContent="No podemos estimar esta geometría. Envíala por correo para revisarla."; return;}
  // Redondeamos el subtotal una sola vez y repartimos sus centavos entre las partidas.
  const materialCents=Math.round(q.mat$*100), prepCents=Math.round(q.prep*100);
  const subtotalCents=Math.round((q.mat$+q.maq$+q.prep)*100), totalCents=Math.round(q.total*100);
  const machineCents=subtotalCents-materialCents-prepCents, adjustmentCents=totalCents-subtotalCents;
  $("#qdims").innerHTML="<span><b>"+stl.size.map(x=>x.toFixed(1)).join(" × ")+"</b> mm</span><span>≈ <b>"+q.gT.toFixed(1)+"</b> g</span><span>≈ <b>"+q.hT.toFixed(1)+"</b> h de máquina</span>";
  $("#qwarn").textContent=stl.size.some(x=>x>265)?"Una medida supera 265 mm. Debemos revisar orientación, máquina y viabilidad antes de confirmar la fabricación.":"";
  $("#qbk").innerHTML="<tr><td>Material estimado ("+q.gT.toFixed(1)+" g "+mat.toUpperCase()+")</td><td>"+$$(materialCents/100)+"</td></tr><tr><td>Máquina estimada ("+q.hT.toFixed(1)+" h)</td><td>"+$$(machineCents/100)+"</td></tr><tr><td>Preparación del pedido</td><td>"+$$(prepCents/100)+"</td></tr>"+(adjustmentCents>0?"<tr><td>Ajuste al precio mínimo</td><td>"+$$(adjustmentCents/100)+"</td></tr>":"");
  $("#qtot").textContent=$$(totalCents/100);
  $("#qsend").disabled=false;
  $("#qcopy").disabled=false;
  $("#qmsg").textContent="";
  window._q=[
    "Solicitud de revisión de impresión — Hackgorithmic 3D",
    "Archivo: "+stl.name,
    "Medidas interpretadas en milímetros: "+stl.size.map(x=>x.toFixed(1)).join(" x ")+" mm",
    "Material: "+mat.toUpperCase()+" · Relleno orientativo: "+$("#qinf").selectedOptions[0].text+" · "+col+" color(es)",
    "Cantidad: "+qty,
    "Estimado de impresión: "+$$(totalCents/100)+" USD (envío aparte)",
    "Solicito revisión del archivo, precio final y plazo de entrega.",
    "Este estimado no confirma un pedido ni garantiza la resistencia de la pieza.",
    "",
    "Antes de enviar: adjuntar manualmente el archivo STL e indicar destino del envío o recogida."
  ].join("\n");
  $("#qsummary").value=window._q;
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
$("#qsend").onclick=()=>{
  recalc();
  if(!window._q||$("#qsend").disabled) return;
  $("#qmsg").textContent="Borrador preparado. Adjunta el STL y pulsa Enviar en tu correo. Si no se abre, copia el resumen y envíalo con el archivo a hackgorithmic@gmail.com.";
  window.location.href="mailto:hackgorithmic@gmail.com?cc="+encodeURIComponent("agent@hackgorithmic.com")+"&subject="+encodeURIComponent("Revisión de impresión 3D — "+stl.name)+"&body="+encodeURIComponent(window._q);
};
$("#qcopy").onclick=async()=>{
  recalc();
  if(!window._q||$("#qcopy").disabled) return;
  try{await navigator.clipboard.writeText(window._q);$("#qmsg").textContent="Resumen copiado. Pégalo en tu correo a hackgorithmic@gmail.com, adjunta el STL y pulsa Enviar.";}
  catch(e){$("#qsummary").focus();$("#qsummary").select();$("#qmsg").textContent="Selecciona y copia el resumen manualmente. Envíalo con el STL adjunto a hackgorithmic@gmail.com.";}
};
function syncOrder(){
  const n=cantidad($("#oq").value), sub=precioLlaveros(n);
  const requiereEnvio=$("#od").value==="envio";
  $("#oaddrw").style.display=requiereEnvio?"":"none";
  $("#oa").required=requiereEnvio;
  $("#obk").innerHTML="<tr><td>"+n+" llavero"+(n>1?"s":"")+" · "+$("#ob").value+" + "+$("#ol").value+"</td><td>"+$$(sub)+"</td></tr><tr><td>"+($("#od").value==="envio"?"Envío EE.UU.":"Recoger en Florida")+"</td><td>"+(requiereEnvio?"Por cotizar":"Gratis")+"</td></tr>";
  $("#ototal-label").textContent=requiereEnvio?"Subtotal de llaveros":"Total con recogida";
  $("#otot").textContent=$$(sub);
  const body="Pedido hackgorithmic 3D\nNombres: "+($("#on").value||"(falta)")+"\nEstilo: "+$("#ost").selectedOptions[0].text+"\nArgolla: "+$("#oaro").selectedOptions[0].text.toLowerCase()+"\nColores: base "+$("#ob").value+", letras "+$("#ol").value+"\nCantidad: "+n+"\nEntrega: "+$("#od").selectedOptions[0].text+"\nSubtotal de llaveros: "+$$(sub)+(requiereEnvio?"\nEnvío: por cotizar según la dirección\nTotal final: pendiente de confirmar":"\nRecogida local: gratis\nTotal: "+$$(sub))+"\nCliente: "+($("#ocn").value||"")+"\nContacto: "+($("#oct").value||"")+($("#od").value==="envio"?"\nDirección: "+($("#oa").value||""):"");
  window._ord=body;
  $("#osummary").value=body+"\n\nSolicitud pendiente de revisión. Confirmamos diseño, precio final y plazo antes de cobrar.";
  $("#osend").href="mailto:hackgorithmic@gmail.com?cc=agent%40hackgorithmic.com&subject="+encodeURIComponent("Solicitud de llaveros - "+($("#on").value||"nuevo"))+"&body="+encodeURIComponent($("#osummary").value);
}
["on","ost","oaro","oq","ob","ol","od","ocn","oct","oa"].forEach(id=>$("#"+id).addEventListener("input",syncOrder));
$("#nm").addEventListener("input",e=>{st.name=e.target.value.trim()||"Tu nombre";draw();});
document.querySelectorAll("#aros .chip").forEach(c=>c.onclick=()=>{st.aro=c.dataset.aro;document.querySelectorAll("#aros .chip").forEach(x=>x.setAttribute("aria-pressed",String(x===c)));draw();});
document.querySelectorAll("#styles .chip").forEach(c=>c.onclick=()=>{st.f=c.dataset.f;document.querySelectorAll("#styles .chip").forEach(x=>x.setAttribute("aria-pressed",String(x===c)));draw();
  /* la fuente del estilo puede tardar en cargar: se vuelve a medir cuando llega */
  if(document.fonts&&document.fonts.load)document.fonts.load((st.f==="block"?"96px ":"118px ")+FONT[st.f]).then(()=>draw()).catch(()=>{});});
swatches($("#base"),"base",["rosa","negro","cian","rojo","amarillo"]);
swatches($("#letter"),"letter",["blanco","negro","rosa"]);
$("#kpedir").addEventListener("click",()=>{ $("#on").value=$("#nm").value.trim(); $("#ost").value=st.f; $("#oaro").value=st.aro; $("#ob").value=st.base; $("#ol").value=st.letter; $("#oq").value=cantidad($("#kq").value); syncOrder(); });
/* Dibuja lo que esté visible. vistas.js lo llama cada vez que cambia de sección. */
function all(){const vis=el=>el&&el.getClientRects().length>0;draw();syncOrder();if(vis($("#kc2")))keychain($("#kc2"),"Luna","round","negro","rosa");}
window.hgRedraw=all;
all();
if(document.fonts&&document.fonts.ready) document.fonts.ready.then(all);
if(document.fonts&&document.fonts.addEventListener) document.fonts.addEventListener("loadingdone",all);
/* Los formularios de planes y pedido se manejan con JavaScript: nunca navegan. */
['plan-request','ord'].forEach(id=>{const f=document.getElementById(id);if(f)f.addEventListener('submit',e=>e.preventDefault());});
