/* ===== Pedidos dentro de la web: checkout, Mis pedidos y Panel de la tienda =====
 * Producción: Supabase (orders, order_items, order_events) con create_order / owner_update_order (supabase/pedidos.sql).
 * Modo prueba: todo se guarda en este navegador y la cuenta de prueba también es la tienda.
 * Ningún pedido se hace por correo: todo queda en la cuenta de la persona.
 * Uso: HGCheckout.start({kind, title, specs, qty, price:q=>centavos|null, custom, file, fileKind, delivery}) */
(()=>{
const A=()=>window.HGAuth||null;
const online=()=>!!(A()&&A().online);
const $id=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=c=>'$'+(Math.round(c)/100).toFixed(2);
const num=id=>'HG-'+String(id||'').replace(/-/g,'').slice(0,8).toUpperCase();
const fmt=d=>{try{return new Date(d).toLocaleDateString('es',{day:'numeric',month:'short',year:'numeric'});}catch(e){return '';}};
const fmtT=d=>{try{return new Date(d).toLocaleString('es',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'});}catch(e){return '';}};
const uuid=()=>crypto.randomUUID?crypto.randomUUID():'10000000-1000-4000-8000-100000000000'.replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16));
const MAX_FILE=25*1024*1024;

const KIND={taller:'Pieza del Taller',ia:'Modelo 3D con IA',idea:'Diseño a medida',dibujo:'Tu dibujo en 3D','dibujo-figura':'Figura 3D de tu dibujo',stl:'Impresión de tu archivo','plan-creador':'Suscripción mensual','plan-pro':'Suscripción mensual'};
const ICON={cube:'<path d="M12 2 3 7v10l9 5 9-5V7z"/><path d="m3 7 9 5 9-5M12 12v10"/>',pen:'<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13 7 4 4"/>',spark:'<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',file:'<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6"/>',star:'<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',lock:'<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',check:'<path d="m5 12.5 4.5 4.5L19 7.5"/>',box:'<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>'};
const ICON_OF={taller:'cube',ia:'spark',idea:'spark',dibujo:'pen','dibujo-figura':'pen',stl:'file','plan-creador':'star','plan-pro':'star'};
const svg=n=>'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">'+(ICON[n]||ICON.cube)+'</svg>';
const icon=k=>svg(ICON_OF[k]||'box');

const ST={
  awaiting_quote:['Recibido','Revisamos tu pedido y te confirmamos aquí el total con envío. No se cobra nada todavía.'],
  awaiting_payment:['Listo para pagar','Ya confirmamos el total. Paga como te indicamos en los mensajes del pedido.'],
  paid:['Pagado','Recibimos tu pago. Tu pieza entra a producción.'],
  processing:['En producción','Estamos fabricando tu pieza.'],
  shipped:['Enviado','Tu pedido va en camino.'],
  completed:['Entregado','¡Gracias por tu pedido!'],
  cancelled:['Cancelado','Este pedido se canceló.']};
const FLOW=['awaiting_quote','awaiting_payment','paid','processing','shipped','completed'];
const FLOW_LBL=['Recibido','Total confirmado','Pagado','Producción','Enviado','Entregado'];
const STATES='AL Alabama|AK Alaska|AZ Arizona|AR Arkansas|CA California|CO Colorado|CT Connecticut|DE Delaware|DC District of Columbia|FL Florida|GA Georgia|HI Hawaii|ID Idaho|IL Illinois|IN Indiana|IA Iowa|KS Kansas|KY Kentucky|LA Louisiana|ME Maine|MD Maryland|MA Massachusetts|MI Michigan|MN Minnesota|MS Mississippi|MO Missouri|MT Montana|NE Nebraska|NV Nevada|NH New Hampshire|NJ New Jersey|NM New Mexico|NY New York|NC North Carolina|ND North Dakota|OH Ohio|OK Oklahoma|OR Oregon|PA Pennsylvania|RI Rhode Island|SC South Carolina|SD South Dakota|TN Tennessee|TX Texas|UT Utah|VT Vermont|VA Virginia|WA Washington|WV West Virginia|WI Wisconsin|WY Wyoming'.split('|').map(s=>[s.slice(0,2),s.slice(3)]);
const PLANS={
  creador:{kind:'plan-creador',title:'Plan Creador',cents:800,specs:['Archivos sin marca','Descargas ilimitadas','Todos los estilos y colores','Archivos multicolor listos para imprimir']},
  pro:{kind:'plan-pro',title:'Plan Pro',cents:2400,specs:['Diseños a medida con nuestro agente','Uso comercial: vende lo que imprimas','Prioridad y 10% de descuento en impresiones']}};

/* ---------- datos: Supabase en producción, este navegador en modo prueba ---------- */
const LS='hg_orders_prueba';
const lread=()=>{try{const v=JSON.parse(localStorage.getItem(LS)||'[]');return Array.isArray(v)?v:[];}catch(e){return [];}};
const lwrite=v=>{try{localStorage.setItem(LS,JSON.stringify(v.slice(0,100)));}catch(e){}};
const ev=(actor,status,message)=>({created_at:new Date().toISOString(),actor,status,message:message||''});
function localAct(id,action,sub,ship,msg){
  const list=lread(),o=list.find(x=>x.id===id);if(!o)throw new Error('not_found');msg=String(msg||'').trim();let next;
  if(action==='cancel-buyer'){if(!['awaiting_quote','awaiting_payment'].includes(o.status))throw new Error('state');o.status='cancelled';o.order_events.push(ev('cliente','cancelled','Pedido cancelado por el cliente.'));lwrite(list);return;}
  if(action==='message'){if(!msg)throw new Error('message');o.order_events.push(ev('tienda',null,msg));lwrite(list);return;}
  if(action==='quote'){
    if(!['awaiting_quote','awaiting_payment'].includes(o.status))throw new Error('state');
    if(!(sub>=100&&sub<=1e7&&ship>=0&&ship<=1e6))throw new Error('amount');
    Object.assign(o,{subtotal_cents:sub,shipping_cents:ship,total_cents:sub+ship});if(o.order_items.length===1)o.order_items[0].line_total_cents=sub;next='awaiting_payment';
  }else{
    const from={paid:['awaiting_payment'],processing:['paid'],shipped:['processing'],completed:['paid','processing','shipped'],cancel:['awaiting_quote','awaiting_payment','paid','processing','shipped']}[action];
    if(!from)throw new Error('action');if(!from.includes(o.status))throw new Error('state');next=action==='cancel'?'cancelled':action;
  }
  o.status=next;o.order_events.push(ev('tienda',next,msg));lwrite(list);
}
const api={
  async client(){return A().client();},
  async upload(path,blob,type){
    if(!online())return path;
    const c=await api.client();const{error}=await c.storage.from('order-files').upload(path,blob,{contentType:type,upsert:false});if(error)throw error;return path;},
  async create(p){
    if(!online()){
      const list=lread(),ex=list.find(o=>o.request_key===p.key);if(ex)return ex.id;
      const o={id:uuid(),request_key:p.key,created_at:new Date().toISOString(),status:'awaiting_quote',subtotal_cents:p.estimate||0,shipping_cents:null,total_cents:null,
        buyer_name:p.buyer_name,buyer_email:(A().user||{}).email||'',shipping_address:p.address,note:p.note,
        order_items:[{title:KIND[p.kind]+' · '+p.title,quantity:p.quantity,line_total_cents:p.estimate||0,customization:Object.assign({},p.custom,{kind:p.kind},p.estimate!=null?{estimate_cents:p.estimate}:{},p.file?{file:p.file}:{})}],
        order_events:[ev('cliente','awaiting_quote','Pedido recibido.')]};
      list.unshift(o);lwrite(list);return o.id;}
    const c=await api.client();
    const{data,error}=await c.rpc('create_order',{p_kind:p.kind,p_title:p.title,p_quantity:p.quantity,p_estimate_cents:p.estimate,p_customization:p.custom,
      p_file:p.file,p_buyer_name:p.buyer_name,p_shipping_address:p.address,p_note:p.note,p_request_key:p.key});
    if(error)throw error;return data&&data.id;},
  async mine(){
    if(!online())return lread();
    const c=await api.client();
    const{data,error}=await c.from('orders').select('id,created_at,status,subtotal_cents,shipping_cents,total_cents,shipping_address,note,order_items(title,quantity,line_total_cents,customization),order_events(created_at,actor,status,message)')
      .eq('buyer_id',A().user.id).order('created_at',{ascending:false}).limit(50);
    if(error)throw error;return data||[];},
  async cancel(id){if(!online())return localAct(id,'cancel-buyer');const c=await api.client();const{error}=await c.rpc('cancel_my_order',{p_order:id});if(error)throw error;},
  async owner(){if(!online())return lread();const c=await api.client();const{data,error}=await c.rpc('owner_orders',{p_limit:200});if(error)throw error;return Array.isArray(data)?data:[];},
  async act(id,action,sub,ship,msg){
    if(!online())return localAct(id,action,sub,ship,msg);
    const c=await api.client();const{error}=await c.rpc('owner_update_order',{p_order:id,p_action:action,p_subtotal_cents:sub??null,p_shipping_cents:ship??null,p_message:msg||''});if(error)throw error;},
  async isOwner(){
    const a=A();if(!a||!a.user)return false;if(!online())return !!a.user.local;
    const c=await api.client();const{data,error}=await c.from('stores').select('id').eq('slug','hackgorithmic').eq('owner_id',a.user.id).maybeSingle();return !error&&!!data;},
  async fileUrl(path){const c=await api.client();const{data,error}=await c.storage.from('order-files').createSignedUrl(path,300,{download:true});if(error)throw error;return data.signedUrl;}
};
function human(e){
  const m=String((e&&(e.message||e.error_description||e.code))||e||'');
  if(/store_not_ready/.test(m))return 'Estamos terminando de abrir la tienda en línea. Inténtalo de nuevo en unas horas.';
  if(/order_limit/.test(m))return 'Llegaste al máximo de pedidos por hoy. Inténtalo mañana.';
  if(/verified email|Sign in|JWT|not authenticated/i.test(m))return 'Entra con tu cuenta confirmada para continuar.';
  if(/address/.test(m))return 'Revisa los datos de entrega.';
  if(/request_key/.test(m))return 'Este pedido ya se registró. Revísalo en Mis pedidos.';
  if(/size|too large|exceeded|Payload/i.test(m))return 'Tu archivo es muy grande: el máximo es 25 MB.';
  if(/mime|content.?type/i.test(m))return 'Ese tipo de archivo no se acepta.';
  if(/photo/.test(m))return 'No pudimos preparar la foto de tu dibujo. Prueba con otra en JPG o PNG.';
  if(/\bfile\b/i.test(m))return 'No pudimos adjuntar tu archivo. Inténtalo de nuevo.';
  if(/state/.test(m))return 'Este pedido cambió de estado. Actualiza la página.';
  if(/amount/.test(m))return 'Revisa los montos: producto desde $1 y envío desde $0.';
  if(/message/.test(m))return 'Escribe el mensaje para el cliente.';
  if(/fetch|network|Failed|load/i.test(m))return 'No pudimos conectar. Revisa tu internet e inténtalo de nuevo.';
  return 'No pudimos completar la acción. Inténtalo de nuevo en un momento.';
}

/* ---------- lo que se está pidiendo ---------- */
let item=null,key=null,busy=false,last=null;
function trimCustom(c){
  const o={};for(const[k,v]of Object.entries(c||{})){
    if(v==null||v==='')continue;
    if(typeof v==='string')o[k]=v.slice(0,k==='prompt'?400:120);
    else if(typeof v==='number'||typeof v==='boolean')o[k]=v;
    else if(typeof v==='object'&&!Array.isArray(v)){const s={};for(const[k2,v2]of Object.entries(v))if(typeof v2==='string'||typeof v2==='number')s[k2]=typeof v2==='string'?v2.slice(0,60):v2;o[k]=s;}
  }
  while(JSON.stringify(o).length>1400){const k=Object.keys(o).pop();if(!k)break;delete o[k];}
  return o;
}
function normItem(it){
  const kind=KIND[it.kind]?it.kind:'idea',plan=kind.startsWith('plan-');
  return{kind,plan:plan?it.plan:null,title:String(it.title||KIND[kind]).replace(/\s+/g,' ').trim().slice(0,120)||KIND[kind],
    specs:(it.specs||[]).filter(Boolean).map(s=>String(s).slice(0,140)).slice(0,6),
    qty:Math.min(50,Math.max(1,Math.floor(+it.qty||1))),qtyLocked:!!(it.qtyLocked||plan),
    price:typeof it.price==='function'?it.price:()=>null,custom:trimCustom(it.custom),
    file:it.file||null,fileKind:it.fileKind==='photo'?'photo':'stl',fileLabel:it.fileLabel||'',
    delivery:plan?['digital']:(Array.isArray(it.delivery)&&it.delivery.length?it.delivery.filter(d=>['shipping','pickup','digital'].includes(d)):['shipping','pickup']),
    needNote:!!it.needNote,uploaded:null};
}
function start(it){
  const a=A();if(!a||!it)return;
  const go=()=>{item=normItem(it);key=uuid();last=null;if(window.hgRoute&&document.body.dataset.view!=='checkout')hgRoute('checkout');else renderCheckout();};
  if(a.user)go();else a.require(go,'Entra o crea tu cuenta para completar tu pedido. Así lo sigues desde Mis pedidos.');
}
const planItem=n=>{const p=PLANS[n];return p?{kind:p.kind,plan:n,title:p.title,specs:p.specs.concat(['Cobro mensual en USD']),qty:1,qtyLocked:true,price:()=>p.cents,custom:{plan:n}}:null;};
const priceOf=()=>{if(!item)return null;const v=item.price(item.qty);return Number.isFinite(v)&&v>0?Math.round(v):null;};
function payState(){const P=window.HackgorithmicPayments;try{return P?P.validateConfig(window.HACKGORITHMIC_PAYMENTS):{ready:false};}catch(e){return{ready:false};}}

/* ---------- checkout ---------- */
const DELIV={
  shipping:['Envío a domicilio','Estados Unidos · el costo se confirma antes de pagar','Por confirmar'],
  pickup:['Recoger en persona','Florida · te avisamos cuando esté lista','Gratis'],
  digital:['Entrega digital','Se activa en tu cuenta','Gratis']};
function summaryHTML(){
  const p=priceOf(),del=(($id('checkout')||document).querySelector('input[name=delivery]:checked')||{}).value||item.delivery[0];
  const ship=del==='shipping'?'Por confirmar':'Gratis',plan=!!item.plan;
  return '<div class="co-item"><div class="co-thumb">'+icon(item.kind)+(item.qty>1?'<i>'+item.qty+'</i>':'')+'</div><div class="co-info"><b>'+esc(item.title)+'</b><span>'+esc(KIND[item.kind])+'</span>'+
      (item.specs.length?'<ul>'+item.specs.map(s=>'<li>'+esc(s)+'</li>').join('')+'</ul>':'')+'</div></div>'+
    (item.qtyLocked?'':'<div class="co-qty"><span>Cantidad</span><span class="co-step"><button type="button" data-q="-1" aria-label="Quitar una"'+(item.qty<=1?' disabled':'')+'>−</button><output aria-live="polite">'+item.qty+'</output><button type="button" data-q="1" aria-label="Agregar una"'+(item.qty>=50?' disabled':'')+'>+</button></span></div>')+
    '<dl class="co-lines"><div><dt>'+(plan?'Plan mensual':'Subtotal estimado')+'</dt><dd>'+(p?money(p):'Por cotizar')+'</dd></div>'+(plan?'':'<div><dt>Envío</dt><dd>'+ship+'</dd></div>')+'</dl>'+
    '<div class="co-total"><span>'+(plan?'Total al mes':'Total estimado')+'</span><b>'+(p?money(p):'Por cotizar')+'</b></div>'+
    (plan?'':'<p class="co-fine">Te confirmamos el total final antes de cobrar.</p>')+
    '<ul class="co-trust"><li>Revisamos cada pieza antes de fabricarla</li><li>Hecho en Florida</li><li>Sigue tu pedido desde tu cuenta</li></ul>';
}
function renderCheckout(){
  const el=$id('checkout');if(!el)return;const a=A();
  if(last){el.innerHTML=doneHTML(last);return;}
  if(!item){el.innerHTML='<div class="co-empty">'+svg('box')+'<h1>Tu pedido está vacío</h1><p>Crea una pieza en el Taller, convierte tu dibujo en 3D o sube tu archivo STL y pulsa <b>Pedirlo impreso</b>.</p><div class="co-empty-a"><a class="btn" href="#taller">Ir al Taller</a><a class="btn alt" href="#cotizar">Subir mi STL</a></div></div>';return;}
  if(!a||!a.user){el.innerHTML='<div class="co-empty">'+svg('lock')+'<h1>Entra para terminar tu pedido</h1><p>Tu pedido queda guardado en tu cuenta y lo sigues desde Mis pedidos.</p><div class="co-empty-a"><button class="btn" type="button" data-co-login>Entrar o crear cuenta</button></div></div>';
    el.querySelector('[data-co-login]').onclick=()=>a&&a.require(renderCheckout,'Entra o crea tu cuenta para completar tu pedido.');return;}
  const u=a.user,plan=!!item.plan,ps=payState(),stripe=plan&&ps.ready?ps.checkoutUrls[item.plan]:'';
  const opts=item.delivery.map((d,i)=>'<label class="co-opt"><input type="radio" name="delivery" value="'+d+'"'+(i===0?' checked':'')+'><span><b>'+DELIV[d][0]+'</b><small>'+DELIV[d][1]+'</small></span><em>'+DELIV[d][2]+'</em></label>').join('');
  const fileNote=item.file?'<p class="co-filenote">'+svg('file')+'<span>'+esc(item.fileLabel||(item.fileKind==='photo'?'Al realizar el pedido subimos la foto de tu dibujo para que el equipo la modele.':'Al realizar el pedido subimos tu modelo 3D para fabricarlo.'))+' Solo lo ve hackgorithmic.</span></p>':'';
  el.innerHTML='<div class="co">'+
    '<div class="co-head"><a class="co-back" href="'+(plan?'#planes':'#taller')+'">← '+(plan?'Volver a planes':'Seguir creando')+'</a><ol class="co-steps" aria-label="Pasos"><li class="done">'+(plan?'Plan':'Diseño')+'</li><li class="on" aria-current="step">'+(plan?'Datos':'Entrega')+'</li><li>Confirmación</li></ol></div>'+
    '<div class="co-grid">'+
    '<form class="co-main" novalidate>'+
      '<h1 class="co-title">'+(plan?'Activa tu plan':'Finalizar pedido')+'</h1>'+
      '<fieldset class="co-box"><legend>Contacto</legend><p class="co-acc">'+svg('check')+'<span>Pedido para <b>'+esc(u.email||'')+'</b></span></p>'+
        '<div class="co-row"><label>Nombre completo<input name="name" autocomplete="name" maxlength="120" required value="'+esc(u.name||'')+'"></label>'+
        '<label><span>Teléfono o WhatsApp <small>(opcional)</small></span><input name="phone" type="tel" autocomplete="tel" maxlength="30" inputmode="tel"></label></div></fieldset>'+
      '<fieldset class="co-box"><legend>Entrega</legend><div class="co-opts">'+opts+'</div>'+
        (item.delivery.includes('shipping')?'<div class="co-addr"'+(item.delivery[0]==='shipping'?'':' hidden')+'>'+
          '<label>Dirección<input name="line1" autocomplete="address-line1" maxlength="160"></label>'+
          '<label><span>Apartamento, suite, etc. <small>(opcional)</small></span><input name="line2" autocomplete="address-line2" maxlength="160"></label>'+
          '<div class="co-row3"><label>Ciudad<input name="city" autocomplete="address-level2" maxlength="100"></label>'+
          '<label>Estado<select name="region" autocomplete="address-level1"><option value="">Elige…</option>'+STATES.map(([c,n])=>'<option value="'+c+'"'+(c==='FL'?' selected':'')+'>'+n+'</option>').join('')+'</select></label>'+
          '<label>Código postal<input name="zip" autocomplete="postal-code" inputmode="numeric" maxlength="10"></label></div>'+
          '<p class="co-fine">Por ahora enviamos dentro de Estados Unidos.</p></div>':'')+
      '</fieldset>'+
      '<fieldset class="co-box"><legend>'+(item.needNote?'Tu idea':'Detalles para el taller <small>(opcional)</small>')+'</legend>'+
        '<label class="co-sr" for="coNote">'+(item.needNote?'Describe tu idea':'Detalles')+'</label><textarea id="coNote" name="note" rows="3" maxlength="1000" placeholder="'+(item.needNote?'Qué quieres crear, medidas, colores, para cuándo lo necesitas…':'Colores, tamaño, fecha en que lo necesitas…')+'"'+(item.needNote?' required':'')+'></textarea>'+fileNote+'</fieldset>'+
      '<fieldset class="co-box co-pay"><legend>Pago</legend><div class="co-paynote">'+svg('lock')+'<div>'+
        (stripe?'<b>Pago seguro con tarjeta</b><span>Te llevamos a la página de pago de Stripe para completar tu suscripción.</span>'
          :plan?'<b>No se cobra nada ahora.</b><span>Reservamos tu plan y te avisamos en <b>Mis pedidos</b> cómo activarlo.</span>'
          :'<b>No se cobra nada ahora.</b><span>Revisamos tu pedido y te confirmamos el total con envío en <b>Mis pedidos</b>. Pagas solo cuando lo apruebes.</span>')+
      '</div></div></fieldset>'+
      '<button class="btn co-submit" type="submit">'+(stripe?'Continuar al pago seguro':plan?'Reservar mi plan':'Realizar pedido')+'</button>'+
      '<p class="co-status" role="status" aria-live="polite"></p>'+
      '<p class="co-legal">Tus datos se usan solo para fabricar y entregar tu pedido. <a href="privacidad.html" target="_blank" rel="noopener">Privacidad</a></p>'+
    '</form>'+
    '<aside class="co-side" aria-label="Resumen del pedido"><div class="co-sum">'+summaryHTML()+'</div></aside>'+
    '</div></div>';
  const f=el.querySelector('form.co-main'),sum=el.querySelector('.co-sum'),addr=el.querySelector('.co-addr');
  const paintSum=()=>{sum.innerHTML=summaryHTML();};
  f.addEventListener('change',e=>{if(e.target.name==='delivery'){if(addr)addr.hidden=e.target.value!=='shipping';paintSum();}});
  f.addEventListener('input',e=>{if(e.target.setCustomValidity)e.target.setCustomValidity('');});
  sum.addEventListener('click',e=>{const b=e.target.closest('[data-q]');if(!b||!item||busy)return;item.qty=Math.min(50,Math.max(1,item.qty+(+b.dataset.q)));paintSum();});
  f.addEventListener('submit',e=>{e.preventDefault();submit(f,stripe);});
}
async function fileBlob(it){
  let b=typeof it.file==='function'?await it.file():it.file;if(!b)throw new Error('file');
  if(it.fileKind!=='photo')return b;
  const url=URL.createObjectURL(b);
  try{const img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(new Error('photo'));i.src=url;});
    const s=Math.min(1,2000/Math.max(img.naturalWidth,img.naturalHeight)),cv=document.createElement('canvas');cv.width=Math.max(1,Math.round(img.naturalWidth*s));cv.height=Math.max(1,Math.round(img.naturalHeight*s));
    cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height);
    return await new Promise((res,rej)=>cv.toBlob(x=>x?res(x):rej(new Error('photo')),'image/jpeg',.86));}
  finally{URL.revokeObjectURL(url);}
}
async function submit(f,stripe){
  if(busy||!item)return;
  const st=f.querySelector('.co-status'),say=(t,bad)=>{st.textContent=t||'';st.classList.toggle('bad',!!bad);};
  const fail=(field,t)=>{if(field){field.setCustomValidity(t);field.reportValidity();field.focus();}say(t,true);};
  const v=n=>((f.elements[n]&&f.elements[n].value)||'').trim();
  const name=v('name'),phone=v('phone'),del=(f.querySelector('input[name=delivery]:checked')||{}).value||item.delivery[0],note=v('note').slice(0,1000);
  if(name.length<2)return fail(f.elements.name,'Escribe tu nombre completo.');
  if(phone&&!/^[0-9+() .-]{7,30}$/.test(phone))return fail(f.elements.phone,'Revisa el teléfono: solo números y + ( ) -');
  const address={delivery:del,country:'US'};if(phone)address.phone=phone;
  if(del==='shipping'){
    const l1=v('line1'),city=v('city'),reg=v('region'),zip=v('zip'),l2=v('line2');
    if(l1.length<3)return fail(f.elements.line1,'Escribe la dirección de entrega.');
    if(city.length<2)return fail(f.elements.city,'Escribe la ciudad.');
    if(!/^[A-Z]{2}$/.test(reg))return fail(f.elements.region,'Elige el estado.');
    if(!/^\d{5}(-\d{4})?$/.test(zip))return fail(f.elements.zip,'Escribe un código postal de 5 dígitos.');
    Object.assign(address,{line1:l1,city,region:reg,postal_code:zip});if(l2)address.line2=l2;
  }
  if(item.needNote&&note.length<10)return fail(f.elements.note,'Cuéntanos tu idea con un poco más de detalle.');
  const a=A();if(!a||!a.user){say('Entra a tu cuenta para continuar.',true);return;}
  if(stripe){location.href=stripe+'?client_reference_id='+encodeURIComponent(a.user.id||'');return;}
  busy=true;f.querySelectorAll('button,input,select,textarea').forEach(x=>x.disabled=true);f.classList.add('busy');
  try{
    let path=item.uploaded;
    if(item.file&&!path){
      say(item.fileKind==='photo'?'Subiendo la foto de tu dibujo…':'Subiendo tu modelo 3D…');
      const blob=await fileBlob(item);if(blob.size>MAX_FILE)throw new Error('size');
      path=(online()?a.user.id:'prueba')+'/'+uuid().replace(/-/g,'')+(item.fileKind==='photo'?'.jpg':'.stl');
      await api.upload(path,blob,item.fileKind==='photo'?'image/jpeg':'model/stl');item.uploaded=path;
    }
    say('Enviando tu pedido…');
    const est=item.plan?null:priceOf();
    const id=await api.create({kind:item.kind,title:item.title,quantity:item.qty,estimate:est,custom:item.custom,file:path||null,buyer_name:name,address,note,key});
    last={id,plan:!!item.plan,title:item.title};item=null;key=null;
    renderCheckout();scrollTo(0,0);
  }catch(err){console.error('[hackgorithmic] pedido',err);say(human(err),true);}
  finally{busy=false;if(f.isConnected){f.classList.remove('busy');f.querySelectorAll('button,input,select,textarea').forEach(x=>x.disabled=false);}}
}
function progress(s){
  if(s==='cancelled')return '<p class="od-cancel">Pedido cancelado</p>';
  const i=FLOW.indexOf(s);
  return '<ol class="od-flow" aria-label="Estado: '+esc((ST[s]||[s])[0])+'">'+FLOW_LBL.map((l,k)=>'<li class="'+(k<i?'done':k===i?'on':'')+'"'+(k===i?' aria-current="step"':'')+'><span></span>'+l+'</li>').join('')+'</ol>';
}
function doneHTML(o){
  return '<div class="co-done"><div class="co-check">'+svg('check')+'</div><p class="co-kicker">Pedido '+esc(num(o.id))+'</p>'+
    '<h1>'+(o.plan?'¡Listo! Reservamos tu plan':'¡Gracias! Recibimos tu pedido')+'</h1>'+
    '<p>'+(o.plan?'Te avisamos en <b>Mis pedidos</b> cómo activarlo.':'Revisamos <b>'+esc(o.title)+'</b> y te confirmamos el total con envío en <b>Mis pedidos</b>. No se cobra nada hasta que lo apruebes.')+'</p>'+
    progress('awaiting_quote')+'<div class="co-done-a"><a class="btn" href="#pedidos">Ver mis pedidos</a><a class="btn alt" href="#taller">Seguir creando</a></div></div>';
}

/* ---------- tarjetas de pedido (cliente y tienda) ---------- */
function deliveryText(s){
  s=s||{};if(s.delivery==='pickup')return 'Recoger en persona (Florida)';if(s.delivery==='digital')return 'Entrega digital';
  return esc([s.line1,s.line2].filter(Boolean).join(', '))+'<br>'+esc([s.city,s.region,s.postal_code].filter(Boolean).join(', '));
}
function specsOf(c){
  const r=[],s=c.spec||{};
  if(c.prompt)r.push(['Idea',c.prompt]);
  if(s.texto)r.push(['Texto',s.texto]);
  if(s.tipo)r.push(['Pieza',s.tipo+(s.forma?' · '+s.forma:'')]);
  if(s.base)r.push(['Colores','base '+s.base+(s.letras?', letras '+s.letras:'')]);
  if(c.colors)r.push(['Colores',c.colors]);
  if(c.size)r.push(['Tamaño',c.size]);
  if(c.mm)r.push(['Medidas',c.mm+' mm']);
  if(c.material)r.push(['Material',c.material]);
  if(c.file_name)r.push(['Archivo',c.file_name]);
  if(c.print===false)r.push(['Formato','Solo el archivo 3D']);
  return r.length?'<h4>Detalles</h4><dl class="od-specs">'+r.map(([k,v])=>'<div><dt>'+esc(k)+'</dt><dd>'+esc(v)+'</dd></div>').join('')+'</dl>':'';
}
function card(o,own){
  const it=(o.order_items||[])[0]||{},c=it.customization||{},k=c.kind||'idea',ship=o.shipping_address||{};
  const evs=(o.order_events||[]).slice().sort((x,y)=>new Date(x.created_at)-new Date(y.created_at));
  const quoted=o.total_cents!=null,est=c.estimate_cents;
  const amount=quoted?money(o.total_cents):est?'Estimado '+money(est):'Por cotizar';
  const msgs=evs.filter(e=>e.message&&e.message!=='Pedido recibido.');
  const who=e=>e.actor==='tienda'?(own?'Tú · tienda':'hackgorithmic'):e.actor==='cliente'?(own?'Cliente':'Tú'):e.actor;
  const extra=own?(
      (c.file?'<button class="btn alt" type="button" data-file="'+esc(c.file)+'">'+svg('file')+'Descargar archivo</button>':'')+
      (c.spec&&c.spec.tipo?'<button class="btn alt" type="button" data-open>Abrir en el Taller</button>':'')+
      (c.task?'<span class="od-meta">Modelo IA: '+esc(c.task)+'</span>':'')):'';
  return '<article class="od" data-id="'+esc(o.id)+'">'+
    '<header class="od-h"><div class="od-thumb">'+icon(k)+'</div><div class="od-t"><b>'+esc(it.title||'Pedido')+'</b><span>'+esc(num(o.id))+' · '+esc(fmt(o.created_at))+' · '+(it.quantity||1)+' u.</span></div><span class="od-pill s-'+esc(o.status)+'">'+esc((ST[o.status]||[o.status])[0])+'</span></header>'+
    progress(o.status)+
    '<div class="od-body"><div class="od-cols"><div><h4>Entrega</h4><p>'+deliveryText(ship)+'</p>'+
      (own?'<h4>Cliente</h4><p>'+esc(o.buyer_name||'')+(o.buyer_email?'<br>'+esc(o.buyer_email):'')+(ship.phone?'<br>'+esc(ship.phone):'')+'</p>':'')+'</div>'+
      '<div><h4>Total</h4><dl class="od-money">'+(quoted?'<div><dt>Producto</dt><dd>'+money(o.subtotal_cents)+'</dd></div><div><dt>Envío</dt><dd>'+(o.shipping_cents?money(o.shipping_cents):'Gratis')+'</dd></div>':'')+
      '<div class="od-tot"><dt>Total</dt><dd>'+amount+'</dd></div></dl>'+(own?'':'<p class="od-hint">'+esc((ST[o.status]||['',''])[1])+'</p>')+'</div></div>'+
    specsOf(c)+(extra?'<div class="od-btns">'+extra+'</div>':'')+
    (o.note?'<h4>'+(own?'Notas del cliente':'Tus notas')+'</h4><p class="od-note">'+esc(o.note)+'</p>':'')+
    (msgs.length?'<h4>Mensajes</h4><ul class="od-msgs">'+msgs.map(e=>'<li class="'+(e.actor==='tienda'?'shop':'me')+'"><b>'+esc(who(e))+'</b> <time>'+esc(fmtT(e.created_at))+'</time>'+(e.status&&ST[e.status]?' <em>'+esc(ST[e.status][0])+'</em>':'')+'<p>'+esc(e.message)+'</p></li>').join('')+'</ul>':'')+
    (own?ownerActions(o):buyerActions(o))+
    '<p class="od-status" role="status" aria-live="polite"></p></div></article>';
}
function buyerActions(o){
  return ['awaiting_quote','awaiting_payment'].includes(o.status)?'<div class="od-btns"><button class="btn alt od-danger" type="button" data-cancel>Cancelar pedido</button></div>':'';
}
function ownerActions(o){
  const s=o.status,d=(o.shipping_address||{}).delivery,est=(((o.order_items||[])[0]||{}).customization||{}).estimate_cents;
  if(s==='completed'||s==='cancelled')return '<div class="od-actions"><textarea class="od-msg" rows="2" maxlength="1000" placeholder="Mensaje para el cliente"></textarea><div class="od-btns"><button class="btn alt" type="button" data-act="message">Enviar mensaje</button></div></div>';
  let h='<div class="od-actions">';
  if(s==='awaiting_quote'||s==='awaiting_payment')
    h+='<form class="od-quote"><label>Precio del producto (USD)<input name="sub" inputmode="decimal" required placeholder="25.00" value="'+(o.total_cents!=null?(o.subtotal_cents/100).toFixed(2):est?(est/100).toFixed(2):'')+'"></label>'+
      '<label>Envío (USD)<input name="ship" inputmode="decimal" required placeholder="0.00" value="'+(o.shipping_cents!=null?(o.shipping_cents/100).toFixed(2):d==='shipping'?'':'0.00')+'"></label>'+
      '<label class="od-wide">Mensaje para el cliente<textarea name="msg" rows="2" maxlength="1000" placeholder="Cómo pagar, plazo de entrega…"></textarea></label>'+
      '<button class="btn" type="submit">'+(s==='awaiting_quote'?'Enviar cotización':'Actualizar cotización')+'</button></form>';
  const next={awaiting_payment:['paid','Marcar como pagado'],paid:['processing','Empezar producción'],
    processing:d==='shipping'?['shipped','Marcar como enviado']:['completed','Marcar como entregado'],shipped:['completed','Marcar como entregado']}[s];
  h+='<textarea class="od-msg" rows="2" maxlength="1000" placeholder="Mensaje para el cliente (opcional: número de guía, fecha de entrega…)"></textarea>'+
    '<div class="od-btns">'+(next?'<button class="btn" type="button" data-act="'+next[0]+'">'+next[1]+'</button>':'')+
    '<button class="btn alt" type="button" data-act="message">Enviar mensaje</button><button class="btn alt od-danger" type="button" data-act="cancel">Cancelar pedido</button></div></div>';
  return h;
}
const cents=v=>{v=String(v||'').replace(/[$,\s]/g,'');if(!/^\d+(\.\d{1,2})?$/.test(v))return NaN;return Math.round(parseFloat(v)*100);};
function bindCards(box,list,own,reload){
  box.querySelectorAll('article.od').forEach(art=>{
    const o=list.find(x=>String(x.id)===art.dataset.id);if(!o)return;
    const st=art.querySelector('.od-status'),say=(t,bad)=>{st.textContent=t||'';st.classList.toggle('bad',!!bad);};
    const run=async(fn,okMsg)=>{art.querySelectorAll('button').forEach(b=>b.disabled=true);say('Guardando…');try{await fn();say(okMsg||'Listo.');setTimeout(reload,500);}catch(e){console.error(e);say(human(e),true);art.querySelectorAll('button').forEach(b=>b.disabled=false);}};
    art.querySelector('[data-cancel]')?.addEventListener('click',()=>{if(confirm('¿Cancelar el pedido '+num(o.id)+'?'))run(()=>api.cancel(o.id),'Pedido cancelado.');});
    art.querySelector('.od-quote')?.addEventListener('submit',e=>{e.preventDefault();const f=e.target,sub=cents(f.elements.sub.value),ship=cents(f.elements.ship.value);
      if(!(sub>=100))return say('Escribe el precio del producto (desde $1.00).',true);if(!(ship>=0))return say('Escribe el envío (0 si es gratis).',true);
      run(()=>api.act(o.id,'quote',sub,ship,f.elements.msg.value),'Cotización enviada: '+money(sub+ship)+'.');});
    art.querySelectorAll('[data-act]').forEach(b=>b.addEventListener('click',()=>{const act=b.dataset.act,msg=(art.querySelector('.od-msg')||{}).value||'';
      if(act==='message'&&!msg.trim())return say('Escribe el mensaje primero.',true);
      if(act==='cancel'&&!confirm('¿Cancelar el pedido '+num(o.id)+'? El cliente lo verá cancelado.'))return;
      run(()=>api.act(o.id,act,null,null,msg));}));
    art.querySelector('[data-file]')?.addEventListener('click',async e=>{const p=e.currentTarget.dataset.file;
      if(!online())return say('En modo prueba los archivos no se suben: aquí descargarías el archivo del cliente.');
      try{say('Preparando descarga…');const url=await api.fileUrl(p);const a=document.createElement('a');a.href=url;a.rel='noopener';a.download='';document.body.appendChild(a);a.click();a.remove();say('');}catch(err){say(human(err),true);}});
    art.querySelector('[data-open]')?.addEventListener('click',async()=>{const t=window.__taller,spec=(((o.order_items||[])[0]||{}).customization||{}).spec;if(!t||!t.show||!spec)return;
      if(window.hgRoute)hgRoute('taller');try{await t.show(spec);}catch(e){console.error(e);}});
  });
}

/* ---------- páginas: Mis pedidos y Panel de la tienda ---------- */
let gen=0;
function gate(el,title,text){
  el.innerHTML='<div class="co-empty">'+svg('lock')+'<h1>'+esc(title)+'</h1><p>'+esc(text)+'</p><div class="co-empty-a"><button class="btn" type="button" data-gate>Entrar o crear cuenta</button></div></div>';
  el.querySelector('[data-gate]').onclick=()=>A()&&A().require(null,text);
}
async function renderMine(){
  const el=$id('pedidos'),a=A();if(!el)return;const my=++gen;
  if(!a||!a.user)return gate(el,'Mis pedidos','Entra a tu cuenta para ver tus pedidos.');
  el.innerHTML='<div class="od-page"><div class="od-head"><h1>Mis pedidos</h1><p>Sigue el estado de tus pedidos y los mensajes de la tienda.</p></div><div class="od-list"><p class="od-empty">Cargando…</p></div></div>';
  const box=el.querySelector('.od-list');let list;
  try{list=await api.mine();}catch(e){if(my===gen)box.innerHTML='<p class="od-empty bad">'+esc(human(e))+'</p>';return;}
  if(my!==gen)return;
  if(!list.length){box.innerHTML='<div class="co-empty">'+svg('box')+'<h1>Aún no tienes pedidos</h1><p>Crea una pieza en el Taller, convierte tu dibujo en 3D o sube tu STL y pídela impresa.</p><div class="co-empty-a"><a class="btn" href="#taller">Ir al Taller</a></div></div>';return;}
  box.innerHTML=list.map(o=>card(o,false)).join('');bindCards(box,list,false,renderMine);
}
const TABS=[['nuevos','Por cotizar',['awaiting_quote']],['cobrar','Por cobrar',['awaiting_payment']],['curso','En curso',['paid','processing','shipped']],['cerrados','Cerrados',['completed','cancelled']],['todos','Todos',null]];
let tab='nuevos';
async function renderPanel(){
  const el=$id('panel'),a=A();if(!el)return;const my=++gen;
  if(!a||!a.user)return gate(el,'Panel de la tienda','Entra con la cuenta de la tienda.');
  el.innerHTML='<div class="od-page"><div class="od-head"><h1>Panel de la tienda</h1><p>Los pedidos que llegan desde la web. Confirma el total, cobra y avanza cada pedido: el cliente ve cada cambio en Mis pedidos.</p></div><div class="od-list"><p class="od-empty">Cargando…</p></div></div>';
  const box=el.querySelector('.od-list');let own=false,list=[];
  try{own=await api.isOwner();if(own)list=await api.owner();}catch(e){if(my===gen)box.innerHTML='<p class="od-empty bad">'+esc(human(e))+'</p>';return;}
  if(my!==gen)return;
  if(!own){box.innerHTML='<p class="od-empty">Esta sección es solo para la cuenta de la tienda.</p>';return;}
  const cur=TABS.find(t=>t[0]===tab)||TABS[0],shown=list.filter(o=>!cur[2]||cur[2].includes(o.status));
  const tabs='<div class="op-tabs" role="tablist" aria-label="Filtrar pedidos">'+TABS.map(t=>'<button type="button" role="tab" data-tab="'+t[0]+'" aria-selected="'+(t===cur)+'">'+t[1]+'<i>'+list.filter(o=>!t[2]||t[2].includes(o.status)).length+'</i></button>').join('')+'</div>';
  box.insertAdjacentHTML('beforebegin',tabs);
  el.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;renderPanel();});
  box.innerHTML=shown.length?shown.map(o=>card(o,true)).join(''):'<p class="od-empty">No hay pedidos en esta lista.</p>';
  bindCards(box,shown,true,renderPanel);
}

/* ---------- cuenta: ¿es la tienda? (muestra el Panel en el menú) ---------- */
async function refreshOwner(){
  const a=A();let own=false;
  if(a&&a.user){try{own=await api.isOwner();}catch(e){own=false;}}
  if(a)a.owner=own;document.documentElement.toggleAttribute('data-owner',own);
}
function onView(v){
  if(v!=='checkout'&&last)last=null;
  if(v==='checkout')renderCheckout();else if(v==='pedidos')renderMine();else if(v==='panel')renderPanel();
}
addEventListener('hg:view',e=>onView(e.detail));
addEventListener('hg:user',()=>{refreshOwner();const v=document.body.dataset.view;if(v==='pedidos'||v==='panel')onView(v);else if(v==='checkout'&&!busy)renderCheckout();});

/* Botones de la página: planes (data-plan) y diseño a medida (data-order="idea"). */
document.addEventListener('click',e=>{
  const p=e.target.closest('a[data-plan]');if(p){e.preventDefault();start(planItem(p.dataset.plan));return;}
  const o=e.target.closest('[data-order="idea"]');if(o){e.preventDefault();start({kind:'idea',title:'Diseño a medida',specs:['Nuestro equipo modela tu idea','Te mostramos la vista previa antes de cobrar'],needNote:true,custom:{}});}
});

window.HGCheckout=Object.freeze({start,plan:n=>start(planItem(n))});
onView(document.body.dataset.view);refreshOwner();
})();
