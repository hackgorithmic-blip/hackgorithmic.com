/* ===== Taller: de idea (prompt) a modelo 3D con la marca grabada ===== */
(function(){
const q=s=>document.querySelector(s);
const log=q('#tlog'), form=q('#tform'), inp=q('#tin'), chips=q('#tchips');
const reduceM=matchMedia('(prefers-reduced-motion: reduce)').matches;
const FONT_URL='https://cdn.jsdelivr.net/npm/three@0.128.0/examples/fonts/helvetiker_bold.typeface.json';
const HEX={rosa:0xe0457b,negro:0x2a2c31,blanco:0xf4f4f2,cian:0x1596a6,rojo:0xd3312f,amarillo:0xf2c230};
const COLS={rosa:'rosa',rosado:'rosa',rosada:'rosa',pink:'rosa',fucsia:'rosa',negro:'negro',negra:'negro',black:'negro',blanco:'blanco',blanca:'blanco',white:'blanco',cian:'cian',azul:'cian',celeste:'cian',turquesa:'cian',rojo:'rojo',roja:'rojo',red:'rojo',amarillo:'amarillo',amarilla:'amarillo',dorado:'amarillo',yellow:'amarillo'};
const TIPO={llavero:'Llavero',charm:'Charm',mascota:'Placa para mascota',placa:'Letrero',posavasos:'Posavasos'};
const FORMA={pill:'',corazon:'de corazón',estrella:'de estrella',circulo:'redondo',hexagono:'hexagonal',rect:''};
let font=null, fontP=null;

/* ---------- utilidades 2D ---------- */
const norm=s=>s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function clean(pts){const o=[];for(const p of pts){const l=o[o.length-1];if(!l||Math.hypot(p.x-l.x,p.y-l.y)>1e-4)o.push({x:p.x,y:p.y});}
  while(o.length>2&&Math.hypot(o[0].x-o[o.length-1].x,o[0].y-o[o.length-1].y)<1e-4)o.pop();
  for(let ch=true;ch&&o.length>3;){ch=false;for(let i=0;i<o.length;i++){const p=o[(i+o.length-1)%o.length],c=o[i],n=o[(i+1)%o.length];if(Math.abs((c.x-p.x)*(n.y-c.y)-(c.y-p.y)*(n.x-c.x))<1e-9){o.splice(i,1);ch=true;break;}}}return o;}
const area=p=>{let s=0;for(let i=0,j=p.length-1;i<p.length;j=i++)s+=p[j].x*p[i].y-p[i].x*p[j].y;return s/2;};
const ccw=p=>area(p)>0?p:p.slice().reverse(), cw=p=>area(p)<0?p:p.slice().reverse();
function circ(cx,cy,r,n){const a=[];for(let i=0;i<n;i++){const t=i/n*Math.PI*2;a.push({x:cx+r*Math.cos(t),y:cy+r*Math.sin(t)});}return a;}
function inPoly(p,P){let c=false;for(let i=0,j=P.length-1;i<P.length;j=i++){const a=P[i],b=P[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)c=!c;}return c;}
function segD(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy;let t=l?((p.x-a.x)*dx+(p.y-a.y)*dy)/l:0;t=Math.max(0,Math.min(1,t));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}
function polyD(p,P){let d=1e9;for(let i=0,j=P.length-1;i<P.length;j=i++)d=Math.min(d,segD(p,P[j],P[i]));return d;}
function bbox(P){let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;for(const p of P){x0=Math.min(x0,p.x);x1=Math.max(x1,p.x);y0=Math.min(y0,p.y);y1=Math.max(y1,p.y);}return{x0,y0,x1,y1};}

/* ---------- texto -> contornos ---------- */
function safe(s){return Array.from(s).map(ch=>{if(ch===' '||font.data.glyphs[ch])return ch;const b=ch.normalize('NFD')[0];return font.data.glyphs[b]?b:'';}).join('').replace(/\s+/g,' ').trim();}
function text(str,size,cx,cy,mirror){
  const loops=font.generateShapes(str,size).map(s=>{const e=s.extractPoints(4);return{outer:clean(e.shape),holes:e.holes.map(clean).filter(h=>h.length>2)};}).filter(l=>l.outer.length>2);
  const b=bbox([].concat(...loops.map(l=>l.outer)));const dx=cx-(b.x0+b.x1)/2,dy=cy-(b.y0+b.y1)/2;
  const tf=p=>({x:mirror?2*cx-(p.x+dx):p.x+dx,y:p.y+dy});
  loops.forEach((l,li)=>{const jx=(li%5)*7e-4,jy=(li%7)*1.1e-3,tj=p=>{const q=tf(p);return{x:q.x+jx,y:q.y+jy};};l.outer=l.outer.map(tj);l.holes=l.holes.map(h=>h.map(tj));});
  return{loops,w:b.x1-b.x0,h:b.y1-b.y0,box:{x0:cx-(b.x1-b.x0)/2,x1:cx+(b.x1-b.x0)/2,y0:cy-(b.y1-b.y0)/2,y1:cy+(b.y1-b.y0)/2}};
}
const measure=(s,size)=>text(s,size,0,0,false).w;
function fits(t,ol,holes,m,avoid){
  for(const l of t.loops)for(const p of l.outer){
    if(!inPoly(p,ol)||polyD(p,ol)<m)return false;
    for(const h of holes)if(Math.hypot(p.x-h.x,p.y-h.y)<h.r+m)return false;
    for(const b of avoid||[])if(p.x>b.x0-m&&p.x<b.x1+m&&p.y>b.y0-m&&p.y<b.y1+m)return false;
  }return true;
}

/* ---------- formas (mm) ---------- */
function pill(W,H){const R=H/2,a=[],n=24;for(let i=0;i<=n;i++){const t=-Math.PI/2+i/n*Math.PI;a.push({x:W-R+R*Math.cos(t),y:R+R*Math.sin(t)});}
  for(let i=0;i<=n;i++){const t=Math.PI/2+i/n*Math.PI;a.push({x:R+R*Math.cos(t),y:R+R*Math.sin(t)});}return clean(a);}
function rrect(W,H,r){const a=[],n=8;[[W-r,H-r,0],[r,H-r,90],[r,r,180],[W-r,r,270]].forEach(([cx,cy,d])=>{for(let i=0;i<=n;i++){const t=(d+i/n*90)*Math.PI/180;a.push({x:cx+r*Math.cos(t),y:cy+r*Math.sin(t)});}});return clean(a);}
function shapeOf(forma,S){
  let a=[];
  if(forma==='corazon'){for(let i=0;i<120;i++){const t=i/120*Math.PI*2;a.push({x:16*Math.pow(Math.sin(t),3),y:13*Math.cos(t)-5*Math.cos(2*t)-2*Math.cos(3*t)-Math.cos(4*t)});}a=a.map(p=>({x:p.x*S/32,y:p.y*S/32}));}
  else if(forma==='estrella'){for(let i=0;i<10;i++){const r=i%2?S*.27:S*.5,t=Math.PI/2+i*Math.PI/5;a.push({x:r*Math.cos(t),y:r*Math.sin(t)});}}
  else if(forma==='hexagono'){for(let i=0;i<6;i++){const t=Math.PI/2+i*Math.PI/3;a.push({x:S/2*Math.cos(t),y:S/2*Math.sin(t)});}}
  else a=circ(0,0,S/2,96);
  const b=bbox(a),cx=(b.x0+b.x1)/2,cy=(b.y0+b.y1)/2;return ccw(clean(a.map(p=>({x:p.x-cx,y:p.y-cy}))));
}

/* ---------- acomodo: nombre en relieve + marca grabada ---------- */
const DIM={llavero:{H:3,E:1.2,S:46},charm:{H:2.6,E:1,S:34},mascota:{H:3,E:1,S:36},placa:{H:4,E:1.4,S:60},posavasos:{H:4,E:1,S:95}};
function layout(o){for(let k=0;k<6;k++){const g=tryLayout(o,1+k*.14);if(g)return g;}return null;}
function tryLayout(o,sc){
  const d=DIM[o.tipo],t=o.texto;let ol,holes=[],nC,nMax,nS,tC=null,bC,bMax;
  if(o.forma==='pill'){
    nS=11*sc;const aro=o.aro||'izq',hl=aro!=='der',hr=aro!=='izq',w=Math.max(measure(t,nS),30),H=26*sc,R=H/2,side=R+6.5,plain=Math.max(10,R*.8);
    const x0=hl?side:plain,W=x0+w+(hr?side:plain),e0=hl?x0-3:5,e1=hr?W-side+3:W-5;
    ol=ccw(pill(W,H));holes=[];if(hl)holes.push({x:R*.9,y:R,r:2.6});if(hr)holes.push({x:W-R*.9,y:R,r:2.6});
    nC={x:x0+w/2,y:R+3.4*sc};nMax=w+.01;tC={x:x0+w/2,y:5.3*sc};bC={x:(e0+e1)/2,y:R};bMax=e1-e0-1;
  }else if(o.forma==='rect'){
    nS=15*sc;const w=Math.max(measure(t,nS),60),W=w+34,H=44*sc;
    ol=ccw(rrect(W,H,6));holes=[{x:8,y:H/2,r:2.2},{x:W-8,y:H/2,r:2.2}];nC={x:W/2,y:H/2+4.5*sc};nMax=w+.01;tC={x:W/2,y:7.5*sc};bC={x:W/2,y:H/2};bMax=W-30;
  }else{
    const S=d.S*sc;ol=shapeOf(o.forma,S);const b=bbox(ol);
    if(o.tipo!=='posavasos'){const h={x:0,y:b.y1-5,r:2.6};while(h.y>b.y0&&!(inPoly(h,ol)&&polyD(h,ol)>=h.r+2))h.y-=.5;holes=[h];}
    const top=holes.length?holes[0].y-holes[0].r-1.5:b.y1-3,bot=b.y0+2;
    nS={posavasos:17,charm:7,mascota:8,placa:10,llavero:9}[o.tipo]*sc;
    const stack=nS+2.4+3.2,zc=bot+(top-bot)*(o.forma==='corazon'?.6:.52),yt=zc+stack/2;
    nC={x:0,y:yt-nS/2};tC={x:0,y:yt-nS-2.4-1.6};nMax=(b.x1-b.x0)*.72;
    bC={x:0,y:(top+bot)/2};bMax=(b.x1-b.x0)*.8;
  }
  let name=null;for(let s=nS;s>=3.4;s*=.9){const tl=text(t,s,nC.x,nC.y,false);if(tl.w<=nMax&&fits(tl,ol,holes,1.2))(name=tl);if(name)break;}
  if(!name)return null;
  let top=tC?text('hackgorithmic',3.2,tC.x,tC.y,false):null;if(top&&!fits(top,ol,holes,1,[name.box]))top=null;
  let back=null;
  for(const str of['hackgorithmic.com','hackgorithmic']){for(let s=6.5;s>=2.8;s*=.92){const tl=text(str,s,bC.x,bC.y,true);if(tl.w<=bMax&&fits(tl,ol,holes,1.2)){back=tl;break;}}if(back)break;}
  if(!back)return null;
  return{ol,holes,name,top,back,H:d.H,E:d.E,D:.6};
}

/* ---------- malla sólida (cerrada) ---------- */
function tri(contour,holes,z,up,out){
  const V=a=>a.map(p=>new THREE.Vector2(p.x,p.y));
  const f=THREE.ShapeUtils.triangulateShape(V(contour),holes.map(V)),all=contour.concat(...holes);
  for(const ix of f){let a=all[ix[0]],b=all[ix[1]],c=all[ix[2]];if((((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x))>0)!==up){const t=b;b=c;c=t;}out.push(a.x,a.y,z,b.x,b.y,z,c.x,c.y,z);}
}
function wall(L,z0,z1,out){for(let i=0;i<L.length;i++){const a=L[i],b=L[(i+1)%L.length];out.push(a.x,a.y,z0,b.x,b.y,z0,b.x,b.y,z1,a.x,a.y,z0,b.x,b.y,z1,a.x,a.y,z1);}}
function baseMesh(g){
  const out=[],O=ccw(g.ol),R=g.holes.map(h=>cw(circ(h.x,h.y,h.r,28))),H=g.H,D=g.D;
  const B=g.back.loops,T=g.top?g.top.loops:[];
  wall(O,0,H,out);R.forEach(r=>wall(r,0,H,out));
  tri(O,R.concat(B.map(l=>l.outer)),0,false,out);B.forEach(l=>l.holes.forEach(c=>tri(c,[],0,false,out)));
  B.forEach(l=>{wall(cw(l.outer),0,D,out);l.holes.forEach(c=>wall(ccw(c),0,D,out));tri(l.outer,l.holes,D,false,out);});
  tri(O,R.concat(T.map(l=>l.outer)),H,true,out);T.forEach(l=>l.holes.forEach(c=>tri(c,[],H,true,out)));
  T.forEach(l=>{wall(cw(l.outer),H-D,H,out);l.holes.forEach(c=>wall(ccw(c),H-D,H,out));tri(l.outer,l.holes,H-D,true,out);});
  return new Float32Array(out);
}
function nameMesh(g){const out=[],z0=g.H,z1=g.H+g.E;
  g.name.loops.forEach(l=>{wall(ccw(l.outer),z0,z1,out);l.holes.forEach(c=>wall(cw(c),z0,z1,out));tri(l.outer,l.holes,z1,true,out);tri(l.outer,l.holes,z0,false,out);});
  return new Float32Array(out);}
function volume(a){let v=0;for(let i=0;i<a.length;i+=9)v+=(a[i]*(a[i+4]*a[i+8]-a[i+5]*a[i+7])-a[i+1]*(a[i+3]*a[i+8]-a[i+5]*a[i+6])+a[i+2]*(a[i+3]*a[i+7]-a[i+4]*a[i+6]))/6;return Math.abs(v);}
function checkClosed(a){const m=new Map(),k=(i)=>a[i].toFixed(4)+','+a[i+1].toFixed(4)+','+a[i+2].toFixed(4);
  for(let i=0;i<a.length;i+=9){const v=[k(i),k(i+3),k(i+6)];for(let j=0;j<3;j++){const e=v[j]+'>'+v[(j+1)%3];m.set(e,(m.get(e)||0)+1);}}
  let bad=0;m.forEach((n,e)=>{const[p,q]=e.split('>');if(n!==1||m.get(q+'>'+p)!==1)bad++;});return bad;}
function stl(parts){
  const n=parts.reduce((s,a)=>s+a.length/9,0),buf=new ArrayBuffer(84+50*n),dv=new DataView(buf),hdr='hackgorithmic.com - modelo gratis con marca - uso personal';
  for(let i=0;i<80;i++)dv.setUint8(i,i<hdr.length?hdr.charCodeAt(i):32);dv.setUint32(80,n,true);let o=84;
  for(const a of parts)for(let i=0;i<a.length;i+=9){const ux=a[i+3]-a[i],uy=a[i+4]-a[i+1],uz=a[i+5]-a[i+2],vx=a[i+6]-a[i],vy=a[i+7]-a[i+1],vz=a[i+8]-a[i+2];
    let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;const l=Math.hypot(nx,ny,nz)||1;[nx/l,ny/l,nz/l].concat(Array.from(a.subarray(i,i+9))).forEach(f=>{dv.setFloat32(o,f,true);o+=4;});dv.setUint16(o,0,true);o+=2;}
  return new Blob([buf],{type:'model/stl'});
}
function build(o){const g=layout(o);if(!g)return null;const base=baseMesh(g),name=nameMesh(g),b=bbox(g.ol);
  return{g,base,name,w:b.x1-b.x0,h:b.y1-b.y0,z:g.H+g.E,vol:volume(base)+volume(name)};}

/* ---------- entender el pedido ---------- */
function parse(p){
  const n=norm(p);let tipo=null,forma=null,texto=null,base=null,letras=null;
  if(/llaver|keychain/.test(n))tipo='llavero';
  else if(/posavaso|coaster/.test(n))tipo='posavasos';
  else if(/mascota|perr|gat|collar|chapita/.test(n))tipo='mascota';
  else if(/placa|letrero|cartel|rotulo|puerta|escritorio|oficina/.test(n))tipo='placa';
  else if(/charm|dije|colgante|pulsera|pandora/.test(n))tipo='charm';
  if(/corazon|heart/.test(n))forma='corazon';else if(/estrella|star/.test(n))forma='estrella';else if(/circul|redond|circle/.test(n))forma='circulo';else if(/hexag/.test(n))forma='hexagono';else if(/rectang|cuadrad/.test(n))forma='rect';
  const m1=p.match(/["“”«»]([^"“”«»]{1,24})["“”«»]/)||p.match(/'([^']{1,24})'/);if(m1)texto=m1[1];
  if(!texto){const m=p.match(/(?:que diga|que dice|que ponga|con el nombre(?: de)?|con nombre|con la palabra|con el texto|a nombre de|nombre:)\s+([^,.;!?\n]+)/i);
    if(m)texto=m[1].split(/\s+(?:en|de color|color|con|y|letras?|base|fondo|para|que)\s+/i)[0];}
  if(!texto&&!tipo&&!forma&&p.trim().length<=16&&/^\p{Lu}[\p{L}\d.'&-]*( \p{Lu}[\p{L}\d.'&-]*)?$/u.test(p.trim()))texto=p.trim();
  const lm=n.match(/letras?\s+(?:en\s+|de\s+color\s+|color\s+)?([a-z]+)/);if(lm&&COLS[lm[1]])letras=COLS[lm[1]];
  const bm=n.match(/(?:base|fondo)\s+(?:en\s+|de\s+color\s+|color\s+)?([a-z]+)/);if(bm&&COLS[bm[1]])base=COLS[bm[1]];
  if(!base)for(const w of n.split(/[^a-z]+/))if(COLS[w]&&COLS[w]!==letras){base=COLS[w];break;}
  const complejo=/soporte|figura|funda|repuesto|engran|maceta|holder|stand|juguete|miniatura|busto|logo|foto|carro|anillo|arete|caja|organizador|pieza/.test(n);
  const aro=/ambos|dos lados|dos orificios|dos argollas|2 argollas|2 orificios/.test(n)?'ambos':/derech/.test(n)?'der':/izquierd/.test(n)?'izq':null;
  return{tipo,forma,texto:texto?texto.trim().replace(/\s+/g,' '):null,base,letras,aro,complejo,raw:p};
}
function completar(o){
  if(!o.tipo)o.tipo='llavero';
  if(!o.forma||(o.forma==='rect'&&o.tipo!=='placa'))o.forma={llavero:'pill',charm:'corazon',placa:'rect',posavasos:'circulo',mascota:'circulo'}[o.tipo];
  if(o.tipo==='placa'&&o.forma!=='rect'&&!/placa|letrero/.test(norm(o.raw)))o.tipo='llavero';
  o.base=o.base||'rosa';o.letras=o.letras||(o.base==='blanco'?'negro':'blanco');if(o.letras===o.base)o.letras=o.base==='negro'?'blanco':'negro';
  o.texto=safe(o.texto).slice(0,o.tipo==='placa'?18:14);return o;
}

/* ---------- visor 3D ---------- */
let V=null;
function viewer(host,m,o){
  if(!V){const r=new THREE.WebGLRenderer({antialias:true,alpha:true});r.setPixelRatio(Math.min(2,devicePixelRatio||1));
    const scene=new THREE.Scene();scene.add(new THREE.HemisphereLight(0xffffff,0x3a3f48,.85));const dl=new THREE.DirectionalLight(0xffffff,.75);dl.position.set(40,70,90);scene.add(dl);
    const cam=new THREE.PerspectiveCamera(32,1.6,1,3000),grp=new THREE.Group();scene.add(grp);
    V={r,scene,cam,grp,rx:-.45,ry:.35,drag:null,auto:!reduceM};const el=r.domElement;el.style.touchAction='none';
    el.addEventListener('pointerdown',e=>{V.drag={x:e.clientX,y:e.clientY,rx:V.rx,ry:V.ry};V.auto=false;el.setPointerCapture(e.pointerId);});
    el.addEventListener('pointermove',e=>{if(!V.drag)return;V.ry=V.drag.ry+(e.clientX-V.drag.x)*.012;V.rx=Math.max(-1.5,Math.min(1.5,V.drag.rx+(e.clientY-V.drag.y)*.012));});
    el.addEventListener('pointerup',()=>V.drag=null);
    (function loop(){if(V.auto)V.ry+=.007;V.grp.rotation.set(V.rx,V.ry,0);V.r.render(V.scene,V.cam);requestAnimationFrame(loop);})();}
  clearView();
  const mk=(a,c)=>{const ge=new THREE.BufferGeometry();ge.setAttribute('position',new THREE.BufferAttribute(a,3));ge.computeVertexNormals();
    const me=new THREE.Mesh(ge,new THREE.MeshStandardMaterial({color:HEX[c],roughness:.55,metalness:.03}));V.grp.add(me);return me;};
  V.mb=mk(m.base,o.base);V.mn=mk(m.name,o.letras);const b=bbox(m.g.ol);
  V.grp.children.forEach(c=>c.position.set(-(b.x0+b.x1)/2,-(b.y0+b.y1)/2,-m.z/2));
  const W=host.clientWidth||320,H=Math.round(W*.62);V.r.setSize(W,H);V.cam.aspect=W/H;V.cam.updateProjectionMatrix();
  V.cam.position.set(0,0,Math.max(m.w,m.h*1.5)*1.9+20);V.cam.lookAt(0,0,0);V.auto=!reduceM;host.appendChild(V.r.domElement);
}
function clearView(){while(V.grp.children.length){const c=V.grp.children.pop();c.traverse(n=>{if(n.geometry)n.geometry.dispose();});}}
function ensureV(host){if(!V){const tmp={base:new Float32Array(9),name:new Float32Array(9),g:{ol:[{x:0,y:0},{x:1,y:0},{x:0,y:1}]},w:1,h:1,z:1};viewer(host,tmp,{base:'negro',letras:'negro'});}}
function showObject(host,obj){
  ensureV(host);clearView();const box=new THREE.Box3().setFromObject(obj),size=box.getSize(new THREE.Vector3()),c=box.getCenter(new THREE.Vector3());
  obj.position.sub(c);const piv=new THREE.Group();piv.add(obj);V.grp.add(piv);
  const W=host.clientWidth||320,H=Math.round(W*.62);V.r.setSize(W,H);V.cam.aspect=W/H;V.cam.updateProjectionMatrix();
  const d=Math.max(size.x,size.y,size.z)||1;V.cam.near=d/100;V.cam.far=d*100;V.cam.updateProjectionMatrix();V.cam.position.set(0,0,d*2.2);V.cam.lookAt(0,0,0);V.rx=-.35;V.ry=.5;V.auto=!reduceM;host.appendChild(V.r.domElement);
}
function recolor(o){if(!V)return;V.mb.material.color.setHex(HEX[o.base]);V.mn.material.color.setHex(HEX[o.letras]);}

/* ---------- chat ---------- */
const ask={pend:null};
let epoch=0;const who=()=>window.HGAuth&&HGAuth.uid?HGAuth.uid():null;
function msg(who,html){const d=document.createElement('div');d.className='tm '+who;d.innerHTML=html;log.appendChild(d);log.scrollTop=log.scrollHeight;return d;}
const EJ=[['Un dragón pequeño de juguete'],['Llavero que diga "Sofía"'],['Llavero de corazón "Luna" en rosa'],['Placa para perro "Max" en cian'],['Letrero "Oficina de Ana" base negra'],['Posavasos que diga "Casa López"']];
const iaOn=()=>!!(AI.endpoint&&window.HGAuth&&HGAuth.online);
function setChips(){chips.innerHTML='';EJ.filter(([t])=>iaOn()||!/^Un dragón/.test(t)).forEach(([t])=>{const b=document.createElement('button');b.type='button';b.textContent=t;b.onclick=()=>run(t);chips.appendChild(b);});}
const equipo=p=>'mailto:agent@hackgorithmic.com?subject='+encodeURIComponent('Idea para diseñar (Taller web)')+'&body='+encodeURIComponent('Mi idea: '+p+'\n\nMi nombre:\nWhatsApp o email:');
function precio(m,o){if(o.tipo==='llavero'||o.tipo==='charm')return 7;const g=m.vol/1000*1.24*.8,h=Math.max(.3,g/T.gph*1.6);return cotizar({g,h,colores:2,prep:T.prep}).total;}
/* ---------- generador 3D con IA (ideas libres) ---------- */
const AI=(window.HACKGORITHMIC_ACCOUNTS||{}).ai||{};
const EX='https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/';
let exP=null;
const SRI={'loaders/GLTFLoader.js':'sha384-fljlqkjWlmSFjkESkQvm77heIZpoWmXEOzlCA7kOpGUH+95Zk0yGfQieWM2q136E','exporters/STLExporter.js':'sha384-4hnpAxcCdErKDH3j3vbC5jLfELShp3G/uQ8o7uSSQomOoxn3G3o083Azy+tj0/VT'};
function loadExtras(){if(exP)return exP;const add=src=>new Promise((res,rej)=>{const s=document.createElement('script');s.src=src;const k=src.slice(EX.length);if(SRI[k]){s.integrity=SRI[k];s.crossOrigin='anonymous';}s.onload=res;s.onerror=()=>rej(new Error('three extras'));document.head.appendChild(s);});
  exP=loadFont().then(()=>Promise.all([THREE.GLTFLoader?0:add(EX+'loaders/GLTFLoader.js'),THREE.STLExporter?0:add(EX+'exporters/STLExporter.js')]));exP.catch(()=>{exP=null;});return exP;}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function aiFetch(path,opt={}){const tok=await HGAuth.token();const r=await fetch(AI.endpoint+path,{...opt,headers:{...(opt.headers||{}),Authorization:'Bearer '+tok}});
  if(!r.ok){let j={};try{j=await r.json();}catch(e){}const e=new Error(j.error||('http '+r.status));e.code=j.error;e.limit=j.limit;throw e;}return r;}
function iaReady(){return !!(AI.endpoint&&window.HGAuth&&HGAuth.online&&HGAuth.user&&HGAuth.token);}
async function genIA(p,task){
  const my=epoch,owner=who(),stale=()=>my!==epoch;
  const titulo='Modelo 3D · “'+p+'”';
  const ejemplos=d=>{const w=document.createElement('div');w.className='tp-ej';
    ['Llavero que diga "Sofía"','Placa para perro "Max" en cian','Letrero "Oficina de Ana" base negra'].forEach(t=>{const b=document.createElement('button');b.type='button';b.textContent=t;b.onclick=()=>run(t);w.appendChild(b);});d.appendChild(w);return d;};
  if(!task&&(p.match(/[\p{L}\p{N}]/gu)||[]).length<4)
    return ejemplos(msg('bot','Cuéntame un poco más de tu idea para poder modelarla, por ejemplo <b>un dragón pequeño</b> o <b>una maceta con hojas</b>. O prueba una pieza con texto:'));
  /* Tarjeta de venta: la idea la modela el equipo. Se usa cuando la IA no está conectada o no puede atender ahora. */
  const ideaCard=(nota)=>{
    /* Sin IA conectada, la idea se convierte en un pedido para el equipo (no en un "no se puede"). */
    if(!task&&window.HGAuth)HGAuth.saveModel({tipo:'idea',texto:p,raw:p},owner);
    if(nota)msg('bot',esc(nota));
    const u=(window.HGAuth&&HGAuth.user)||{},d=msg('bot tcard','');let tam='Mediano (~10 cm)';
    d.innerHTML='<div class="tinfo"><b>¡Buena idea! “'+esc(p)+'”</b><span>Esta figura la modela nuestro equipo. Te mandamos la vista previa en 3D y el precio <b>antes de cobrar</b>: impresa y enviada, o solo el archivo.</span></div>'+
      '<div class="tsw dctl" role="group" aria-label="Tamaño"><span>Tamaño</span>'+['Pequeño (~5 cm)','Mediano (~10 cm)','Grande (~15 cm)'].map(t=>'<button type="button" class="chip" data-tam="'+t+'" aria-pressed="'+(t===tam)+'">'+t+'</button>').join('')+'</div>'+
      '<div class="trow"><button class="btn tpedir" type="button">Pedir este modelo</button><button class="btn alt tsolo" type="button">Solo el archivo 3D</button></div>'+
      '<p class="tnote">Guardado en <b>Mis modelos</b>. Te respondemos por correo.</p>';
    d.querySelectorAll('[data-tam]').forEach(b=>b.onclick=()=>{tam=b.dataset.tam;d.querySelectorAll('[data-tam]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));});
    const pedir=impreso=>{const body='Quiero este modelo 3D: '+p+'\nTamaño: '+tam+'\nLo quiero: '+(impreso?'impreso y enviado':'solo el archivo 3D (STL)')+'\nColor(es):\nPara qué es (regalo, decoración, juguete…):\n\nNombre: '+(u.name||'')+'\nCorreo: '+(u.email||'')+'\nWhatsApp (opcional):\n'+(impreso?'Entrega (envío EE.UU. o recoger en Florida):\n':'')+'\nConfirmamos diseño, precio final y plazo antes de cobrar.';
      location.href='mailto:hackgorithmic@gmail.com?cc=agent%40hackgorithmic.com&subject='+encodeURIComponent('Pedido de modelo 3D: '+p.slice(0,60))+'&body='+encodeURIComponent(body);};
    d.querySelector('.tpedir').onclick=()=>pedir(true);d.querySelector('.tsolo').onclick=()=>pedir(false);
    log.scrollTop=log.scrollHeight;return d;};
  if(!iaReady())return ideaCard();
  const card=msg('bot tcard','');
  card.innerHTML='<div class="tview" aria-label="Vista 3D: arrastra para girar"></div><div class="tinfo"><b>'+esc(titulo)+'</b><span class="tprog" role="status">Preparando…</span></div>';
  const prog=card.querySelector('.tprog');
  try{
    await loadExtras();if(stale())return card.remove();
    if(!task){const r=await aiFetch('',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:p})});task=(await r.json()).task;
      if(window.HGAuth)HGAuth.saveModel({tipo:'ia',texto:p,raw:p,task},owner);if(stale())return card.remove();}
    let st={status:'queued',progress:0};const t0=Date.now();
    while(!/success/.test(st.status)){
      if(/failed|cancel|banned|expired/.test(st.status))throw Object.assign(new Error('fail'),{code:'failed'});
      if(Date.now()-t0>6*60e3)throw Object.assign(new Error('timeout'),{code:'timeout'});
      prog.textContent='Generando tu modelo… '+Math.round(st.progress||0)+'%';await wait(3000);
      st=await (await aiFetch('?task='+encodeURIComponent(task))).json();if(stale())return card.remove();
    }
    prog.textContent='Descargando modelo…';
    const fr=await aiFetch('?task='+encodeURIComponent(task)+'&file=1');let buf;
    if((fr.headers.get('content-type')||'').includes('application/json')){const j=await fr.json();if(!j.url||!/^https:\/\//.test(j.url))throw new Error('file');const f2=await fetch(j.url);if(!f2.ok)throw new Error('file');buf=await f2.arrayBuffer();}
    else buf=await fr.arrayBuffer();
    if(stale())return card.remove();
    const gltf=await new Promise((res,rej)=>new THREE.GLTFLoader().parse(buf,'',res,rej));
    const obj=gltf.scene;showObject(card.querySelector('.tview'),obj);
    const size=new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
    prog.textContent='Listo · arrástralo para girarlo. Medidas y escala se ajustan antes de imprimir.';
    const row=document.createElement('div');row.className='trow';
    row.innerHTML='<button class="btn tdl" type="button">Descargar STL</button><button class="btn alt tped" type="button">Pedirlo impreso</button>';card.appendChild(row);
    row.querySelector('.tdl').onclick=()=>{obj.updateMatrixWorld(true);const data=new THREE.STLExporter().parse(obj,{binary:true});
      const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([data],{type:'model/stl'}));a.download='hackgorithmic_'+norm(p).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40)+'.stl';
      document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},4000);
      msg('bot','¡Listo! 📥 Ábrelo en tu laminador y ajusta la escala al tamaño que quieras.');};
    row.querySelector('.tped').onclick=()=>{const body='Quiero imprimir este modelo que generé en el Taller:\n'+titulo+'\nID del modelo: '+task+'\nProporciones: '+size.x.toFixed(2)+' x '+size.y.toFixed(2)+' x '+size.z.toFixed(2)+'\nTamaño que quiero (cm):\nColor(es):\n\nMi nombre:\nWhatsApp o email:\nEntrega (envío EE.UU. o recoger en Florida):';
      location.href='mailto:agent@hackgorithmic.com?subject='+encodeURIComponent('Pedido del Taller - '+titulo)+'&body='+encodeURIComponent(body);};
  }catch(e){
    if(stale())return card.remove();
    if(e.code==='confirm'){card.className='tm bot';card.innerHTML='Confirma tu correo para usar el generador 3D: revisa tu bandeja de entrada.';return;}
    const nota={limit:'Llegaste al límite de modelos con IA de hoy ('+(e.limit||'')+').',new:'Tu cuenta es nueva: el generador con IA se activa 24 horas después de crearla.',busy:'El generador con IA está al máximo por hoy.',throttle:'Vas muy rápido: vuelve a abrir el modelo desde Mis modelos en un momento.',timeout:'El modelo está tardando más de lo normal; búscalo luego en Mis modelos.'}[e.code]||'';
    card.remove();
    if(task&&(e.code==='throttle'||e.code==='timeout')){msg('bot',esc(nota));return;}
    task=null;ideaCard(nota);return;
  }
  log.scrollTop=log.scrollHeight;
}
async function go(p){
  const my=epoch,owner=who();
  p=String(p||'').trim();if(!p)return;msg('me',esc(p));
  let o=parse(p);
  if(ask.pend){const pe=ask.pend;ask.pend=null;if(!o.tipo&&!o.forma){pe.texto=o.texto||p.replace(/["“”«»]/g,'').trim();o=pe;}}
  if(!o.tipo&&!o.forma&&(o.complejo||!o.texto||o.texto!==p.replace(/["“”«»']/g,'').trim()))return genIA(p);
  if(!o.texto){ask.pend=o;return msg('bot','¡Va! ¿Qué nombre o texto le pongo? ✍️');}
  const wait=msg('bot','Modelando tu pieza… 🖨️');
  try{await loadFont();}catch(e){wait.innerHTML='No pude abrir el generador 3D en este navegador 😕. <a href="'+equipo(p)+'">Mándanos tu idea</a> y te la diseñamos.';return;}
  completar(o);if(!o.texto){wait.textContent='Ese texto no lo puedo grabar. Prueba con letras y números.';return;}
  const m=build(o);
  if(!m){wait.innerHTML='Ese texto es muy largo para esa forma. Prueba uno más corto o pide un <b>letrero</b>.';return;}
  if(my!==epoch)return wait.remove();
  wait.remove();renderCard(o,m);if(window.HGAuth)HGAuth.saveModel({tipo:o.tipo,forma:o.forma,texto:o.texto,base:o.base,letras:o.letras,aro:o.aro||null,raw:o.raw},owner);
}
function renderCard(o,m){
  const card=msg('bot tcard','');const titulo=(TIPO[o.tipo]+' '+(FORMA[o.forma]||'')).trim();const $p=precio(m,o);
  const g=Math.max(1,Math.round(m.vol/1000*1.24*.8));
  card.innerHTML='<div class="tview" aria-label="Vista 3D: arrastra para girar"></div>'+
   '<div class="tinfo"><b>'+esc(titulo)+' · “'+esc(o.texto)+'”</b><span>'+m.w.toFixed(0)+' × '+m.h.toFixed(0)+' × '+m.z.toFixed(1)+' mm · ~'+g+' g de PLA · marca grabada '+(m.g.top?'al frente y atrás':'atrás')+'</span></div>'+
   '<div class="tsw"><span>Base</span><span class="sb"></span><span style="margin-left:8px">Letras</span><span class="sl"></span></div>'+
   (o.forma==='pill'?'<div class="tsw taro" role="group" aria-label="Posición de la argolla"><span>Argolla</span>'+[['izq','Izquierda'],['der','Derecha'],['ambos','Ambos lados']].map(([k,l])=>'<button type="button" class="chip" data-aro="'+k+'" aria-pressed="'+((o.aro||'izq')===k)+'">'+l+'</button>').join('')+'</div>':'')+
   '<div class="trow"><button class="btn tdl" type="button">Descargar STL gratis</button><button class="btn alt tped" type="button">Pedirlo impreso · '+(o.tipo==='llavero'||o.tipo==='charm'?'$7':'aprox. '+$$($p))+'</button></div>'+
   '<p class="tnote">Versión gratis: lleva la marca <b>hackgorithmic</b> grabada en la misma pieza. Sin marca: con el plan <a href="#precios">Creador</a>.</p>';
  const sw=(el,key,list)=>{el.innerHTML='';list.forEach(c=>{const b=document.createElement('button');b.type='button';b.title=c;b.setAttribute('aria-label',key+' '+c);b.style.background='#'+HEX[c].toString(16).padStart(6,'0');b.setAttribute('aria-pressed',String(o[key]===c));b.onclick=()=>{o[key]=c;sw(el,key,list);recolor(o);};el.appendChild(b);});};
  sw(card.querySelector('.sb'),'base',['rosa','negro','blanco','cian','rojo','amarillo']);sw(card.querySelector('.sl'),'letras',['blanco','negro','rosa','amarillo']);
  viewer(card.querySelector('.tview'),m,o);
  card.querySelectorAll('.taro [data-aro]').forEach(b=>b.onclick=()=>{if((o.aro||'izq')===b.dataset.aro)return;const prev=o.aro;o.aro=b.dataset.aro;const m2=build(o);
    if(!m2){o.aro=prev;msg('bot','Con argolla en ambos lados el nombre no cabe. Prueba un texto más corto.');return;}card.remove();renderCard(o,m2);});
  card.querySelector('.tdl').onclick=()=>{if(window.HGAuth&&!HGAuth.user)return HGAuth.require(()=>card.querySelector('.tdl').click(),'Crea tu cuenta gratis para descargar tus modelos y tenerlos siempre a la mano.');const a=document.createElement('a');a.href=URL.createObjectURL(stl([m.base,m.name]));
    a.download='hackgorithmic_'+o.tipo+'_'+norm(o.texto).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')+'.stl';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},4000);
    msg('bot','¡Listo! 📥 Ábrelo en tu laminador (Orca, Bambu, Prusa, Snapmaker). Para 2 colores usa “dividir en partes”: la base y las letras vienen separadas.');};
  card.querySelector('.tped').onclick=()=>{
    const body='Quiero imprimir este modelo que creé en el Taller:\n'+titulo+' · "'+o.texto+'"\nMedidas: '+m.w.toFixed(0)+' x '+m.h.toFixed(0)+' x '+m.z.toFixed(1)+' mm\nColores: base '+o.base+', letras '+o.letras+(o.forma==='pill'?'\nArgolla: '+({izq:'izquierda',der:'derecha',ambos:'ambos lados'}[o.aro||'izq']):'')+'\nPrecio aprox.: '+$$($p)+'\nIdea original: '+o.raw+'\n\nMi nombre:\nWhatsApp o email:\nEntrega (envío EE.UU. o recoger en Florida):';
    location.href='mailto:agent@hackgorithmic.com?subject='+encodeURIComponent('Pedido del Taller - '+titulo)+'&body='+encodeURIComponent(body);};
  log.scrollTop=log.scrollHeight;
}
function loadFont(){if(font)return Promise.resolve(font);if(fontP)return fontP;
  fontP=new Promise((res,rej)=>{let n=0;(function w(){if(window.THREE)return res();if(++n>120)return rej(new Error('three'));setTimeout(w,150);})();})
    .then(()=>new Promise((res,rej)=>new THREE.FontLoader().load(FONT_URL,f=>{font=f;res(f);},undefined,rej)));fontP.catch(()=>{fontP=null;});return fontP;}
window.__taller={parse,completar,build,checkClosed,stl,loadFont,showObject,reset:()=>{ask.pend=null;epoch++;},show:async spec=>{const my=epoch,owner=who();spec=spec&&typeof spec==='object'?spec:{};const str=v=>typeof v==='string'?v:'';if(spec.tipo==='ia'||spec.tipo==='idea'){const p=str(spec.raw||spec.texto).slice(0,400);if(!p)return false;const task=/^[\w-]{6,80}$/.test(str(spec.task))?spec.task:null;msg('me',esc(p));if(task)return genIA(p,task);const d=msg('bot','Esta idea aún no tiene modelo 3D. Generarlo usa uno de tus modelos del día. ');const b=document.createElement('button');b.type='button';b.className='btn';b.textContent='Generar ahora';b.onclick=()=>{b.disabled=true;genIA(p);};d.appendChild(b);return true;}if(!TIPO[spec.tipo])return false;const safe={tipo:spec.tipo,texto:str(spec.texto).slice(0,40),raw:str(spec.raw).slice(0,400)};if(FORMA[spec.forma]!==undefined)safe.forma=spec.forma;if(HEX[spec.base])safe.base=spec.base;if(HEX[spec.letras])safe.letras=spec.letras;if(['izq','der','ambos'].includes(spec.aro))safe.aro=spec.aro;spec=safe;await loadFont();if(my!==epoch||who()!==owner)return false;const o=completar({...spec});const m=build(o);if(!m)return false;renderCard(o,m);return true;}};
if(!log)return;
setChips();if(!iaOn()&&inp){inp.placeholder='Escribe tu pieza: llavero que diga “Luna”, placa para perro “Max”, letrero “Oficina de Ana”…';const h=q('.tp-hint');if(h)h.lastChild.textContent='Piezas con texto al instante · figuras con IA: muy pronto';}
/* Sin cuenta, la idea se queda escrita en la caja hasta que se genera (no se pierde al registrarse). */
const run=v=>{if(!String(v||'').trim())return;if(window.HGAuth&&!HGAuth.user){if(inp)inp.value=v;return HGAuth.require(()=>{if(inp&&inp.value===v)inp.value='';go(v);},'Crea tu cuenta gratis para generar y guardar tus propios modelos 3D.');}if(inp&&inp.value===v)inp.value='';go(v);};
form.addEventListener('submit',e=>{e.preventDefault();run(inp.value);});
const warm=()=>{loadFont().catch(()=>{});};inp.addEventListener('focus',warm,{once:true});setTimeout(warm,4000);
})();
