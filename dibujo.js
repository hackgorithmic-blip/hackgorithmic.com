/* ===== Tu dibujo en 3D: foto de un dibujo en papel → placa con los trazos en relieve =====
 * Todo se procesa en el dispositivo de la persona. La foto solo se sube si la persona pide la figura 3D
 * (y el modelo en relieve si pide la placa impresa), al confirmar su pedido en el checkout. */
(function(){
const q=s=>document.querySelector(s);
const form=q('#tform'),log=q('#tlog'),file=q('#dfile'),panel=q('.tp-draw'),text=q('#tin');
if(!form||!log||!file||!panel)return;
const COL={negro:0x2a2c31,blanco:0xf4f4f2,rosa:0xe0457b,cian:0x1596a6,rojo:0xd3312f,amarillo:0xf2c230};
const SIZES=[60,80,100,120];
const BASE=2,RAISE=1.5,N=170;
let mode='texto',uid=0;

/* ---------- pestañas Texto / Dibujo ---------- */
const tabs=[...document.querySelectorAll('.tp-modes [data-mode]')];
function setMode(m){
  mode=m;for(const t of tabs){const on=t.dataset.mode===m;t.setAttribute('aria-selected',String(on));t.tabIndex=on?0:-1;}
  panel.hidden=m!=='dibujo';text.hidden=m==='dibujo';
  const tr=q('.tp-try');if(tr)tr.hidden=m==='dibujo';
  const g=q('.tp-generate');if(g)g.firstChild.textContent=m==='dibujo'?'Convertir a 3D ':'Generar ';
}
tabs.forEach((t,i)=>{t.addEventListener('click',()=>setMode(t.dataset.mode));
  t.addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();const n=tabs[(i+(e.key==='ArrowRight'?1:tabs.length-1))%tabs.length];setMode(n.dataset.mode);n.focus();}});});
setMode('texto');

/* En modo dibujo, "Generar" procesa la foto (se ejecuta antes que el envío del Taller). */
form.addEventListener('submit',e=>{if(mode!=='dibujo')return;e.preventDefault();e.stopImmediatePropagation();
  if(file.files&&file.files[0])start(file.files[0]);else file.click();},true);
file.addEventListener('change',()=>{if(file.files&&file.files[0])start(file.files[0]);});
const drop=q('.tp-drop');
if(drop){['dragenter','dragover'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add('over');}));
  ['dragleave','drop'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove('over');}));
  drop.addEventListener('drop',e=>{const f=e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files[0];if(f)start(f);});}

function say(html,cls='bot'){const d=document.createElement('div');d.className='tm '+cls;d.innerHTML=html;log.appendChild(d);log.scrollTop=log.scrollHeight;return d;}
function start(f){
  if(!/^image\//.test(f.type))return say('Ese archivo no es una imagen. Sube una foto en JPG o PNG.');
  if(f.size>25*1024*1024)return say('La foto pesa demasiado (máximo 25 MB).');
  const go=()=>{if(window.hgRoute&&document.body.dataset.view!=='taller')hgRoute('taller');process(f);};
  if(window.HGAuth&&!HGAuth.user)return HGAuth.require(go,'Crea tu cuenta gratis para convertir tus dibujos en 3D.');
  go();
}

/* ---------- imagen → escala de grises ---------- */
async function loadGray(f){
  let src=null;
  if(window.createImageBitmap){try{src=await createImageBitmap(f,{imageOrientation:'from-image'});}catch(e){src=null;}}
  if(!src)src=await new Promise((res,rej)=>{const u=URL.createObjectURL(f),im=new Image();im.onload=()=>{URL.revokeObjectURL(u);res(im);};im.onerror=()=>{URL.revokeObjectURL(u);rej(new Error('img'));};im.src=u;});
  const sw=src.width,sh=src.height,s=N/Math.max(sw,sh),W=Math.max(16,Math.round(sw*s)),H=Math.max(16,Math.round(sh*s));
  const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d',{willReadFrequently:true});
  x.fillStyle='#fff';x.fillRect(0,0,W,H);x.imageSmoothingQuality='high';x.drawImage(src,0,0,W,H);
  const d=x.getImageData(0,0,W,H).data,g=new Float32Array(W*H);
  for(let i=0;i<W*H;i++)g[i]=.299*d[i*4]+.587*d[i*4+1]+.114*d[i*4+2];
  if(src.close)src.close();
  return{g,W,H};
}

/* ---------- trazos: umbral adaptativo (aguanta sombras de la foto) + limpieza ---------- */
function mask(img,detail){
  const{g,W,H}=img,I=new Float64Array((W+1)*(H+1));
  for(let y=0;y<H;y++){let row=0;for(let x=0;x<W;x++){row+=g[y*W+x];I[(y+1)*(W+1)+x+1]=I[y*(W+1)+x+1]+row;}}
  const r=Math.max(4,Math.round(Math.max(W,H)/14)),t=.14-.03*detail,m=new Uint8Array(W*H);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const x0=Math.max(0,x-r),y0=Math.max(0,y-r),x1=Math.min(W,x+r+1),y1=Math.min(H,y+r+1);
    const mean=(I[y1*(W+1)+x1]-I[y0*(W+1)+x1]-I[y1*(W+1)+x0]+I[y0*(W+1)+x0])/((x1-x0)*(y1-y0));
    const v=g[y*W+x];m[y*W+x]=(v<mean*(1-t)&&v<225)?1:0;}
  const at=(a,x,y)=>x>=0&&y>=0&&x<W&&y<H&&a[y*W+x];
  const clean=new Uint8Array(W*H);   // quita puntitos sueltos
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){if(!m[y*W+x])continue;let n=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if((dx||dy)&&at(m,x+dx,y+dy))n++;clean[y*W+x]=n>=2?1:0;}
  const out=new Uint8Array(W*H);     // engrosa 1 px para que el trazo se pueda imprimir
  for(let y=0;y<H;y++)for(let x=0;x<W;x++)out[y*W+x]=clean[y*W+x]||at(clean,x-1,y)||at(clean,x+1,y)||at(clean,x,y-1)||at(clean,x,y+1)?1:0;
  return out;
}

/* ---------- malla cerrada: placa + trazos en relieve ---------- */
function relief(img,m,sizeMM){
  const{W,H}=img;let x0=W,y0=H,x1=-1,y1=-1,on=0;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(m[y*W+x]){on++;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}
  if(on<25)return null;
  const mg=Math.round(Math.max(x1-x0,y1-y0)*.06)+2;
  const cw=x1-x0+1+2*mg,ch=y1-y0+1+2*mg,p=sizeMM/Math.max(cw,ch);
  const cell=(i,j)=>{const x=x0-mg+i,y=y0-mg+j;return x>=0&&y>=0&&x<W&&y<H&&m[y*W+x]?1:0;};
  const hv=new Float32Array((cw+1)*(ch+1));let lines=0;
  for(let j=0;j<=ch;j++)for(let i=0;i<=cw;i++){const up=cell(i-1,j-1)||cell(i,j-1)||cell(i-1,j)||cell(i,j);hv[j*(cw+1)+i]=up?BASE+RAISE:BASE;}
  for(let j=0;j<ch;j++)for(let i=0;i<cw;i++)lines+=cell(i,j);
  const tris=2*cw*ch+3*2*(cw+ch),pos=new Float32Array(tris*9);let o=0;
  const V=(i,j)=>[i*p,(ch-j)*p,hv[j*(cw+1)+i]];
  const put=(a,b,c)=>{pos.set(a,o);pos.set(b,o+3);pos.set(c,o+6);o+=9;};
  for(let j=0;j<ch;j++)for(let i=0;i<cw;i++){const A=V(i,j),B=V(i+1,j),C=V(i+1,j+1),D=V(i,j+1);put(D,C,B);put(D,B,A);}
  const ring=[];                                   // borde en sentido antihorario visto desde arriba
  for(let i=0;i<=cw;i++)ring.push([i,ch]);for(let j=ch-1;j>=0;j--)ring.push([cw,j]);
  for(let i=cw-1;i>=0;i--)ring.push([i,0]);for(let j=1;j<ch;j++)ring.push([0,j]);
  const cx=cw*p/2,cy=ch*p/2;
  for(let k=0;k<ring.length;k++){
    const a=ring[k],b=ring[(k+1)%ring.length],ta=V(a[0],a[1]),tb=V(b[0],b[1]),ba=[ta[0],ta[1],0],bb=[tb[0],tb[1],0];
    put(ba,bb,tb);put(ba,tb,ta);                   // pared
    put([cx,cy,0],bb,ba);                          // fondo: abanico desde el centro, mirando hacia abajo
  }
  const vol=cw*ch*p*p*BASE+lines*p*p*RAISE;
  return{pos:pos.subarray(0,o),w:cw*p,h:ch*p,z:BASE+RAISE,grams:Math.max(2,Math.round(vol/1000*1.24*.85)),mins:Math.round(20+vol/1000*6)};
}

/* ---------- tarjeta de resultado ---------- */
async function process(f){
  const who=()=>window.HGAuth&&HGAuth.uid?HGAuth.uid():null,owner=who();
  const wait=say('Leyendo tu dibujo… ✏️');
  let img;try{img=await loadGray(f);}catch(e){wait.textContent='No pude abrir esa foto. Prueba con otra en JPG o PNG.';return;}
  if(who()!==owner){wait.remove();file.value='';return;}   /* la sesión cambió mientras leíamos la foto */
  for(let k=0;k<100&&!(window.THREE&&window.__taller&&__taller.showObject);k++)await new Promise(r=>setTimeout(r,100));
  if(!window.THREE||!window.__taller||!__taller.showObject){wait.textContent='No pude abrir el visor 3D en este navegador.';return;}
  if(who()!==owner){wait.remove();file.value='';return;}
  wait.remove();
  const st={size:80,detail:0,base:'negro',trazo:'blanco'},id='ddet'+(++uid);
  const card=say('','bot tcard');
  card.innerHTML='<div class="tview" aria-label="Vista 3D de tu dibujo: arrastra para girar"></div>'+
    '<div class="tinfo"><b>Tu dibujo en 3D · placa en relieve</b><span class="dinfo"></span></div>'+
    '<div class="tsw dctl" role="group" aria-label="Tamaño"><span>Tamaño</span>'+SIZES.map(s=>'<button type="button" class="chip" data-size="'+s+'" aria-pressed="'+(s===st.size)+'">'+s/10+' cm</button>').join('')+'</div>'+
    '<div class="tsw dctl"><label for="'+id+'">Trazo</label><input id="'+id+'" type="range" min="-2" max="2" step="1" value="0"><span class="dhint">menos ← → más</span></div>'+
    '<div class="tsw"><span>Base</span><span class="sb"></span><span style="margin-left:8px">Trazo</span><span class="sl"></span></div>'+
    '<div class="trow"><button class="btn tdl" type="button">Descargar STL</button><button class="btn alt tped" type="button">Pedirlo impreso · desde $10</button><button class="btn alt tfig" type="button">Figura 3D completa</button></div>'+
    '<p class="tnote">Se imprime en dos colores cambiando el filamento a los 2 mm. ¿Lo quieres como figura completa (no solo relieve)? Nuestro equipo la modela y te confirma el precio antes de cobrar.</p>';
  const view=card.querySelector('.tview'),info=card.querySelector('.dinfo');
  let mesh=null,cur=null;
  function paint(){if(!mesh)return;const cA=new THREE.Color(COL[st.base]),cB=new THREE.Color(COL[st.trazo]),p=mesh.geometry.attributes.position,c=mesh.geometry.attributes.color;
    for(let i=0;i<p.count;i++){const col=p.getZ(i)>BASE+.01?cB:cA;c.setXYZ(i,col.r,col.g,col.b);}c.needsUpdate=true;}
  function rebuild(){
    const r=relief(img,mask(img,st.detail),st.size);
    if(!r){info.textContent='No encontré trazos. Sube una foto más clara o mueve "Trazo" hacia "más".';return;}
    cur=r;const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(r.pos,3));g.setAttribute('color',new THREE.BufferAttribute(new Float32Array(r.pos.length),3));g.computeVertexNormals();
    if(mesh)mesh.geometry.dispose();
    mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.55,metalness:.03}));paint();
    __taller.showObject(view,mesh);
    info.textContent=r.w.toFixed(0)+' × '+r.h.toFixed(0)+' × '+r.z.toFixed(1)+' mm · ~'+r.grams+' g de PLA · ~'+r.mins+' min';
  }
  card.querySelectorAll('[data-size]').forEach(b=>b.onclick=()=>{st.size=+b.dataset.size;card.querySelectorAll('[data-size]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));rebuild();});
  card.querySelector('#'+id).addEventListener('change',e=>{st.detail=+e.target.value;rebuild();});
  const sw=(el,key,list)=>{el.innerHTML='';list.forEach(c=>{const b=document.createElement('button');b.type='button';b.title=c;b.setAttribute('aria-label',(key==='base'?'Base ':'Trazo ')+c);
    b.style.background='#'+COL[c].toString(16).padStart(6,'0');b.setAttribute('aria-pressed',String(st[key]===c));b.onclick=()=>{st[key]=c;sw(el,key,list);paint();};el.appendChild(b);});};
  sw(card.querySelector('.sb'),'base',Object.keys(COL));sw(card.querySelector('.sl'),'trazo',Object.keys(COL));
  card.querySelector('.tdl').onclick=()=>{
    const dl=()=>{if(!cur)return;const a=document.createElement('a');a.href=URL.createObjectURL(__taller.stl([cur.pos]));a.download='hackgorithmic_dibujo_'+st.size+'mm.stl';
      document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},4000);
      say('¡Listo! 📥 En tu laminador pon un cambio de color a los 2 mm para que el trazo salga de otro color.');};
    if(window.HGAuth&&!HGAuth.user)return HGAuth.require(dl,'Crea tu cuenta gratis para descargar tus modelos.');dl();};
  const pedir=o=>{if(window.HGCheckout)HGCheckout.start(o);};
  card.querySelector('.tped').onclick=()=>{if(!cur)return;const r=cur,size=st.size,base=st.base,trazo=st.trazo;
    pedir({kind:'dibujo',title:'Placa en relieve de '+size/10+' cm',specs:[r.w.toFixed(0)+' × '+r.h.toFixed(0)+' × '+r.z.toFixed(1)+' mm','Base '+base+' · trazo '+trazo,'Dos colores con cambio de filamento'],
      price:q=>1000*q,fileKind:'stl',fileLabel:'Al realizar el pedido subimos el modelo 3D de tu dibujo (no la foto).',file:()=>__taller.stl([r.pos]),
      custom:{size:size/10+' cm',mm:r.w.toFixed(0)+' × '+r.h.toFixed(0)+' × '+r.z.toFixed(1),colors:'base '+base+', trazo '+trazo}});};
  card.querySelector('.tfig').onclick=()=>pedir({kind:'dibujo-figura',title:'Figura 3D de mi dibujo',specs:['Nuestro equipo la modela a partir de tu dibujo','Te mostramos la vista previa antes de cobrar','Cuéntanos tamaño y colores en los detalles'],
    fileKind:'photo',file:f,fileLabel:'Al realizar el pedido subimos la foto de tu dibujo para que el equipo la modele.',custom:{}});
  rebuild();
  file.value='';
  log.scrollTop=log.scrollHeight;
}
window.__dibujo={mask,relief,loadGray};
})();
