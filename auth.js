/* Cuentas hackgorithmic.
 * mode "prueba":     cuentas y modelos solo en este navegador (para probar la página). NO es seguro para clientes.
 * mode "produccion": cuentas reales en Supabase (flujo PKCE). Si la configuración está incompleta o es insegura,
 *                    las cuentas se BLOQUEAN; nunca se cae al modo prueba. Ver entrega/SEGURIDAD.md. */
(()=>{
const CFG=window.HACKGORITHMIC_ACCOUNTS||{};
const SB_SRC='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js';
const SB_SRI='sha384-Rj26LVGvoeRVR6+mwQmFfcR3QOBEwT+ZmuCWpuiqeTzJpCs0ER4ITAWGb4Hiy3Ok';
const CAP_SRC='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/* ---------- acceso de prueba del dueño (solo esta pestaña, nunca toca Supabase) ---------- */
const TEST_KEY='hg_test_tab';
const TEST=(()=>{try{return sessionStorage.getItem(TEST_KEY)==='1';}catch(e){return false;}})();
(async()=>{
  const q=new URLSearchParams(location.search),c=q.get('prueba');if(c===null)return;
  q.delete('prueba');history.replaceState(null,'',location.pathname+(q.toString()?'?'+q:'')+location.hash);
  const want=CFG.testAccess&&CFG.testAccess.codeHash;if(!want||!window.crypto||!crypto.subtle)return;
  const h=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(c)))].map(b=>b.toString(16).padStart(2,'0')).join('');
  if(h===want){try{sessionStorage.setItem(TEST_KEY,'1');}catch(e){}location.reload();}
  else console.warn('[hackgorithmic] código de prueba incorrecto');
})();

/* ---------- modo (falla cerrado) ---------- */
const rawMode=String(CFG.mode||'').normalize('NFD').replace(/[̀-ͯ]/g,'').trim().toLowerCase();
const HAS_KEYS=!!(CFG.url||CFG.anonKey);
function keyProblem(k){
  if(/^sb_secret_/.test(k))return 'es una clave secreta';
  const p=String(k).split('.');
  if(p.length===3){try{const j=JSON.parse(atob(p[1].replace(/-/g,'+').replace(/_/g,'/')));if(j.role&&j.role!=='anon')return 'tiene rol "'+j.role+'"';}catch(e){return 'no se pudo leer';}}
  return '';
}
let MODE='produccion',problem='';
if(TEST){MODE='prueba';}
else if(rawMode==='prueba'){MODE='prueba';if(HAS_KEYS)problem='mode "prueba" con url/anonKey puestos. Para usar Supabase pon mode "produccion".';}
else if(rawMode==='produccion'){
  if(!CFG.url||!CFG.anonKey)problem='mode "produccion" requiere url y anonKey.';
  else if(!/^https:\/\/[^\s/]+\/?$/.test(CFG.url))problem='url de Supabase inválida (debe ser https://TU-PROYECTO.supabase.co).';
  else if(keyProblem(CFG.anonKey))problem='anonKey '+keyProblem(CFG.anonKey)+'. En el sitio solo va la clave pública (anon / publishable), NUNCA service_role ni secret.';
}else problem='mode desconocido "'+CFG.mode+'". Usa "prueba" o "produccion".';
const BROKEN=!!problem, ONLINE=MODE==='produccion'&&!BROKEN;
if(BROKEN)console.error('[hackgorithmic] Cuentas desactivadas: '+problem);
const CAP=ONLINE&&CFG.captcha&&CFG.captcha.siteKey?CFG.captcha:null;
if(ONLINE&&!CAP)console.error('[hackgorithmic] Producción SIN CAPTCHA: cualquiera puede crear cuentas en masa. Pon captcha.siteKey (Cloudflare Turnstile) antes del lanzamiento. Ver entrega/SEGURIDAD.md');

/* ---------- utilidades ---------- */
const K={acc:'hg_account'};
const mkey=()=>'hg_models:'+((A.user&&A.user.email)||'');
const read=(k,d)=>{try{const v=localStorage.getItem(k);return v?JSON.parse(v):d;}catch(e){return d;}};
const write=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));return true;}catch(e){return false;}};
const drop=k=>{try{localStorage.removeItem(k);}catch(e){}};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TIPO={llavero:'Llavero',charm:'Charm',mascota:'Placa para mascota',placa:'Letrero',posavasos:'Posavasos',ia:'Modelo 3D',idea:'Idea'};
const cut=(s,n)=>{s=String(s??'');return s.length>n?s.slice(0,n-1)+'…':s;};
const titleOf=s=>(TIPO[s.tipo]||'Modelo')+' · “'+cut(s.texto,80)+'”';
/* Debe coincidir EXACTO con Authentication → URL Configuration (sin barra final en la raíz). */
const redirect=()=>location.origin+(location.pathname==='/'?'':location.pathname);
/* Ir al Taller siempre en modo "Pieza con texto" (en modo dibujo la caja de texto está oculta). */
const toTaller=()=>{const tt=document.querySelector('.tp-modes [data-mode="texto"]');if(tt&&tt.getAttribute('aria-selected')!=='true')tt.click();if(window.hgRoute)hgRoute('taller');else document.getElementById('taller')?.scrollIntoView();};
/* Solo guardamos campos conocidos y cortos: el spec vuelve a la página al abrir el modelo. */
function cleanSpec(s){
  const o={},str=(v,n)=>typeof v==='string'?v.slice(0,n):undefined;
  for(const[k,n]of[['tipo',12],['forma',12],['base',12],['letras',12],['aro',6],['task',80]]){const v=str(s[k],n);if(v)o[k]=v;}
  const libre=o.tipo==='ia'||o.tipo==='idea';
  o.texto=str(s.texto,libre?400:40)||'';const raw=str(s.raw,400);if(raw)o.raw=raw;
  return o;
}

let sb=null,sbP=null,pendingAction=null,note='',capToken='',capWidget=null,capP=null,lastUserId=null;
const uid=()=>A.user?(A.user.id||A.user.email):null;
const A={user:null,owner:false,online:ONLINE,mode:MODE,require,open,saveModel,signOut,token,uid,client};
async function token(){if(!ONLINE)return '';const c=await client();const{data}=await c.auth.getSession();return (data.session&&data.session.access_token)||'';}
window.HGAuth=A;

/* ---------- UI ---------- */
const dlg=document.createElement('dialog');
dlg.className='hg-auth';dlg.setAttribute('aria-labelledby','hgAuthTitle');
document.body.appendChild(dlg);
dlg.addEventListener('click',e=>{if(e.target===dlg)dlg.close();});
dlg.addEventListener('close',()=>{pendingAction=null;note='';capToken='';});

const btn=document.createElement('button');
btn.type='button';btn.className='btn hg-account-btn';
const cta=document.querySelector('.tp-top .shader-header-cta');
if(cta)cta.before(btn);else document.querySelector('header.top')?.appendChild(btn);
btn.addEventListener('click',()=>A.user?open('models'):open('signup'));
if(MODE==='prueba'&&!BROKEN){const t=document.createElement(TEST?'button':'span');t.className='hg-test-badge';
  if(TEST){t.type='button';t.textContent='Modo prueba · Salir';t.title='Acceso de prueba solo en esta pestaña. Pulsa para salir.';
    t.addEventListener('click',()=>{try{sessionStorage.removeItem(TEST_KEY);}catch(e){}drop(K.acc);location.reload();});}
  else{t.textContent='Modo prueba';t.title='Las cuentas se guardan solo en este navegador. Cambiar a modo producción antes del lanzamiento.';}
  btn.before(t);}

function paintButton(){
  if(A.user){const n=(A.user.name||A.user.email||'?').trim();btn.innerHTML='<span class="hg-avatar" aria-hidden="true">'+esc(n[0].toUpperCase())+'</span>Mi cuenta';btn.classList.add('in');}
  else{btn.textContent='Crear cuenta';btn.classList.remove('in');}
}
function shell(title,body){
  dlg.innerHTML='<form method="dialog" class="hg-x"><button aria-label="Cerrar">×</button></form><h2 id="hgAuthTitle">'+title+'</h2>'+body;
}
function field(id,label,type,extra=''){return '<label for="'+id+'">'+label+'</label><input id="'+id+'" name="'+id+'" type="'+type+'" '+extra+'>';}
function status(msg,bad){const s=dlg.querySelector('.hg-status');if(s){s.textContent=msg||'';s.classList.toggle('bad',!!bad);}}
function busy(on){dlg.querySelectorAll('button,input').forEach(x=>{if(!x.closest('.hg-x'))x.disabled=on;});}
const capBox=()=>CAP?'<div class="hg-captcha" aria-label="Verificación"></div>':'';
const PRIVACY='<p class="hg-fine">Guardamos tu nombre, tu correo, tus modelos y las ideas que escribes para darte acceso y fabricar tus piezas. Las cuentas funcionan con Supabase; si usas el generador con IA, tu descripción se envía a Tripo para crear el modelo. <a href="privacidad.html" target="_blank" rel="noopener">Privacidad</a> · Para borrar tu cuenta escríbenos a hackgorithmic@gmail.com.</p>';

function open(view='signup',msg){
  if(typeof msg==='string')note=msg;
  if(BROKEN)view='off';
  if(view==='models'&&!A.user)view='signup';
  const lead=note?'<p class="hg-lead">'+esc(note)+'</p>':'';
  if(view==='off'){
    shell('Cuentas no disponibles','<p class="hg-sub">Estamos ajustando el acceso a las cuentas. Vuelve a intentarlo en unos minutos o escríbenos a hackgorithmic@gmail.com.</p><form method="dialog"><button class="btn">Entendido</button></form>');
  }else if(view==='signup'){
    shell('Crea tu cuenta',lead+
      '<p class="hg-sub">Guarda los modelos que creas en el Taller y descárgalos cuando quieras.</p>'+
      (ONLINE&&CFG.google?'<button type="button" class="btn alt hg-google">Continuar con Google</button><div class="hg-or"><span>o con tu correo</span></div>':'')+
      '<form class="hg-form" novalidate>'+field('hgName','Nombre','text','autocomplete="name" maxlength="60" required')+
      field('hgEmail','Correo','email','autocomplete="email" maxlength="120" required')+
      (ONLINE?field('hgPass','Contraseña (mínimo 8, con letras y números)','password','autocomplete="new-password" minlength="8" maxlength="72" required'):'')+
      capBox()+'<button class="btn" type="submit">Crear cuenta</button><p class="hg-status" role="status" aria-live="polite"></p></form>'+
      (ONLINE?'<p class="hg-switch">¿Ya tienes cuenta? <button type="button" data-view="login">Entrar</button></p>'+PRIVACY
        :'<p class="hg-fine"><b>Modo prueba:</b> la cuenta y los modelos se guardan solo en este navegador. No pedimos contraseña en este modo.</p>'));
  }else if(view==='login'){
    shell('Entrar',lead+
      (CFG.google?'<button type="button" class="btn alt hg-google">Continuar con Google</button><div class="hg-or"><span>o con tu correo</span></div>':'')+
      '<form class="hg-form" novalidate>'+field('hgEmail','Correo','email','autocomplete="email" maxlength="120" required')+
      field('hgPass','Contraseña','password','autocomplete="current-password" maxlength="72" required')+
      capBox()+'<button class="btn" type="submit">Entrar</button><p class="hg-status" role="status" aria-live="polite"></p></form>'+
      '<p class="hg-switch"><button type="button" data-view="reset">¿Olvidaste tu contraseña?</button> · ¿Nueva aquí? <button type="button" data-view="signup">Crea tu cuenta</button></p>'+PRIVACY);
  }else if(view==='reset'){
    shell('Recuperar contraseña','<form class="hg-form" novalidate>'+field('hgEmail','Correo de tu cuenta','email','autocomplete="email" required')+
      capBox()+'<button class="btn" type="submit">Enviar enlace</button><p class="hg-status" role="status" aria-live="polite"></p></form>'+
      '<p class="hg-switch"><button type="button" data-view="login">Volver</button></p>');
  }else if(view==='newpass'){
    shell('Nueva contraseña','<p class="hg-sub">Escribe tu nueva contraseña para terminar de recuperar tu cuenta.</p><form class="hg-form" novalidate>'+
      field('hgPass','Nueva contraseña (mínimo 8, con letras y números)','password','autocomplete="new-password" minlength="8" maxlength="72" required')+
      field('hgPass2','Repítela','password','autocomplete="new-password" minlength="8" maxlength="72" required')+
      '<button class="btn" type="submit">Guardar contraseña</button><p class="hg-status" role="status" aria-live="polite"></p></form>');
  }else if(view==='check'){
    shell('Revisa tu correo','<p class="hg-sub">Te enviamos un enlace para confirmar tu cuenta. Ábrelo <b>en este mismo navegador</b> y vuelve a esta pestaña: tu idea sigue escrita en el Taller.</p><form method="dialog"><button class="btn">Entendido</button></form>');
  }else if(view==='models'){
    shell('Mi cuenta','<p class="hg-sub">Hola, '+esc(A.user.name||A.user.email)+'.</p>'+
      '<div class="hg-links"><a class="btn alt" href="#pedidos" data-go>Mis pedidos</a>'+(A.owner?'<a class="btn alt" href="#panel" data-go>Panel de la tienda</a>':'')+'</div>'+
      '<h3 class="hg-h3">Mis modelos</h3><p class="hg-sub">Los modelos que has creado en el Taller.</p><ul class="hg-models"><li class="hg-empty">Cargando…</li></ul>'+
      '<div class="hg-actions"><a class="btn" href="#taller" data-close>Crear un modelo nuevo</a><button type="button" class="btn alt hg-out">Cerrar sesión</button></div>'+
      (A.user.local?'<p class="hg-fine">Modo prueba: cuenta guardada en este navegador.</p>':''));
    renderModels();
  }
  wire(view);
  if(!dlg.open)dlg.showModal();
  (dlg.querySelector('.hg-form input')||dlg.querySelector('.btn'))?.focus();
  mountCaptcha();
}

/* ---------- CAPTCHA (Cloudflare Turnstile, opcional) ---------- */
function loadCaptcha(){
  if(capP)return capP;
  capP=new Promise((res,rej)=>{if(window.turnstile)return res();const s=document.createElement('script');s.src=CAP_SRC;s.async=true;s.onload=()=>res();s.onerror=()=>rej(new Error('network: verificación'));document.head.appendChild(s);});
  capP.catch(()=>{capP=null;});return capP;
}
async function mountCaptcha(){
  const box=dlg.querySelector('.hg-captcha');capToken='';if(!box||!CAP)return;
  try{await loadCaptcha();if(!box.isConnected)return;
    capWidget=window.turnstile.render(box,{sitekey:CAP.siteKey,theme:'dark',language:'es',callback:t=>{capToken=t;},'expired-callback':()=>{capToken='';},'error-callback':()=>{capToken='';}});
  }catch(e){status(human(e),true);}
}
function capReset(){capToken='';if(CAP&&window.turnstile&&capWidget!=null){try{window.turnstile.reset(capWidget);}catch(e){}}}
const capOpt=()=>CAP?{captchaToken:capToken}:{};

function wire(view){
  dlg.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>open(b.dataset.view));
  dlg.querySelectorAll('[data-go]').forEach(a=>a.addEventListener('click',()=>dlg.close()));
  dlg.querySelectorAll('[data-close]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();dlg.close();toTaller();setTimeout(()=>document.getElementById('tin')?.focus({preventScroll:true}),350);}));
  dlg.querySelector('.hg-google')?.addEventListener('click',async()=>{try{const c=await client();const{error}=await c.auth.signInWithOAuth({provider:'google',options:{redirectTo:redirect()}});if(error)throw error;}catch(e){status(human(e),true);}});
  dlg.querySelector('.hg-out')?.addEventListener('click',signOut);
  const f=dlg.querySelector('.hg-form');if(!f)return;
  f.addEventListener('submit',async e=>{
    e.preventDefault();
    const v=id=>(dlg.querySelector('#'+id)?.value||'').trim();
    const name=v('hgName').slice(0,60),email=v('hgEmail').toLowerCase(),pass=dlg.querySelector('#hgPass')?.value||'';
    if(view==='newpass'){
      if(pass.length<8)return status('La contraseña necesita al menos 8 caracteres.',true);
      if(!/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(pass)||!/\d/.test(pass))return status('Usa letras y números en tu contraseña.',true);
      if(pass!==(dlg.querySelector('#hgPass2')?.value||''))return status('Las dos contraseñas no coinciden.',true);
    }else{
      if(view==='signup'&&!name)return status('Escribe tu nombre.',true);
      if(!EMAIL.test(email))return status('Revisa tu correo: parece incompleto.',true);
      if(ONLINE&&view==='signup'&&pass.length<8)return status('La contraseña necesita al menos 8 caracteres.',true);
      if(ONLINE&&view==='signup'&&(!/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(pass)||!/\d/.test(pass)))return status('Usa letras y números en tu contraseña.',true);
      if(view==='login'&&!pass)return status('Escribe tu contraseña.',true);
      if(CAP&&!capToken)return status('Completa la verificación de seguridad.',true);
    }
    busy(true);status('Un momento…');
    try{
      if(BROKEN)return status('Las cuentas no están disponibles ahora mismo.',true);
      if(!ONLINE){write(K.acc,{name,email,created:new Date().toISOString()});setUser({name,email,local:true});return done();}
      const c=await client();
      if(view==='signup'){const{data,error}=await c.auth.signUp({email,password:pass,options:{data:{name,display_name:name},emailRedirectTo:redirect(),...capOpt()}});if(error)throw error;
        if(data.session){console.warn('[hackgorithmic] Supabase no pidió confirmar el correo: activa "Confirm email" en Authentication.');setUser(fromSb(data.session.user));return done();}
        open('check');return;}
      if(view==='login'){const{data,error}=await c.auth.signInWithPassword({email,password:pass,options:capOpt()});if(error)throw error;setUser(fromSb(data.user));return done();}
      if(view==='reset'){const{error}=await c.auth.resetPasswordForEmail(email,{redirectTo:redirect(),...capOpt()});if(error)throw error;status('Listo. Si ese correo tiene cuenta, te llegará un enlace. Ábrelo en este mismo navegador.');}
      if(view==='newpass'){const{error}=await c.auth.updateUser({password:pass});if(error)throw error;status('Contraseña actualizada.');setTimeout(()=>dlg.close(),900);}
    }catch(err){status(human(err),true);}
    finally{busy(false);if(view!=='newpass')capReset();}
  });
}

function human(e){
  if(e&&(e.code==='weak_password'||e.name==='AuthWeakPasswordError')){const r=e.reasons||[];return r.includes('pwned')?'Esa contraseña apareció en filtraciones de otros sitios. Usa otra.':'Usa al menos 8 caracteres, con letras y números.';}
  const m=String(e&&e.message||e);
  if(/Invalid login/i.test(m))return 'Correo o contraseña incorrectos.';
  if(/already registered|already exists/i.test(m))return 'Ese correo ya tiene cuenta. Entra con tu contraseña.';
  if(/Email not confirmed/i.test(m))return 'Confirma tu correo primero: revisa tu bandeja de entrada.';
  if(/rate limit|too many/i.test(m))return 'Demasiados intentos. Espera un minuto y vuelve a probar.';
  if(/captcha/i.test(m))return 'La verificación de seguridad falló. Inténtalo de nuevo.';
  if(/weak|pwned|leaked|character/i.test(m))return 'Esa contraseña no es segura. Usa una más larga y que no hayas usado en otro sitio.';
  if(/same.*password|different from the old/i.test(m))return 'La nueva contraseña debe ser distinta de la anterior.';
  if(/fetch|network|load/i.test(m))return 'No pudimos conectar. Revisa tu internet e inténtalo de nuevo.';
  return 'No pudimos completar la acción. Inténtalo de nuevo en un momento.';
}

async function done(){
  const act=pendingAction;pendingAction=null;note='';
  dlg.close();
  if(act)setTimeout(act,50);
}

/* ---------- sesión ---------- */
function fromSb(u){const md=(u&&u.user_metadata)||{},n=typeof md.name==='string'?md.name:typeof md.display_name==='string'?md.display_name:'';return u?{id:u.id,email:u.email,name:n.slice(0,60)}:null;}
function clearWorkspace(){const log=document.getElementById('tlog');if(log)log.innerHTML='';if(window.__taller&&window.__taller.reset)window.__taller.reset();}
function setUser(u){
  const id=u?(u.id||u.email):null;
  if(lastUserId!==null&&id!==lastUserId)clearWorkspace();
  const changed=id!==lastUserId;lastUserId=id;A.user=u;if(changed)A.owner=false;paintButton();document.documentElement.toggleAttribute('data-signed-in',!!u);
  if(changed)window.dispatchEvent(new CustomEvent('hg:user'));
}
function client(){
  if(sb)return Promise.resolve(sb);
  if(!ONLINE)return Promise.reject(new Error('cuentas desactivadas'));
  if(!sbP)sbP=new Promise((res,rej)=>{
    if(window.supabase&&window.supabase.createClient)return res();
    const s=document.createElement('script');s.src=SB_SRC;s.integrity=SB_SRI;s.crossOrigin='anonymous';s.async=true;
    s.onload=()=>res();s.onerror=()=>rej(new Error('network: no se pudo cargar el servicio de cuentas'));document.head.appendChild(s);
  }).then(()=>{
    sb=window.supabase.createClient(CFG.url,CFG.anonKey,{auth:{flowType:'pkce',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:'hg-auth'}});
    sb.auth.onAuthStateChange((ev,session)=>{
      setUser(fromSb(session&&session.user));
      if(ev==='PASSWORD_RECOVERY')setTimeout(()=>open('newpass'),0);
      if(ev==='SIGNED_OUT')pendingAction=null;
    });
    return sb;});
  sbP.catch(()=>{sbP=null;});
  return sbP;
}
async function signOut(){
  if(ONLINE){
    try{const c=await client();const{error}=await c.auth.signOut();if(error)throw error;}
    catch(e){try{const c=await client();await c.auth.signOut({scope:'local'});}catch(_){}}
  }else drop(K.acc);
  pendingAction=null;setUser(null);clearWorkspace();dlg.close();
}

/* ---------- modelos ---------- */
function toast(t){const log=document.getElementById('tlog');if(!log)return;const d=document.createElement('div');d.className='tm bot';d.textContent=t;log.appendChild(d);log.scrollTop=log.scrollHeight;}
/* owner: A.uid() de quien empezó a crear el modelo. Si la sesión cambió mientras tanto, no se guarda. */
async function saveModel(spec,owner){
  if(BROKEN||!spec||!spec.texto||!A.user)return;
  if(owner!==undefined&&owner!==uid())return;
  spec=cleanSpec(spec);
  if(ONLINE){
    try{const c=await client();const{error}=await c.from('models').insert({title:titleOf(spec).slice(0,120),spec});if(error)throw error;}
    catch(e){console.error('[hackgorithmic] no se pudo guardar el modelo',e);toast('No pudimos guardar este modelo en tu cuenta. '+(/limit|quota|check/i.test(String(e&&e.message))?'Llegaste al máximo de modelos guardados.':'Inténtalo de nuevo.'));}
    return;
  }
  const same=m=>['tipo','forma','texto','base','letras','aro','task'].every(k=>(m.spec[k]||null)===(spec[k]||null));
  const list=read(mkey(),[]).filter(m=>!same(m));
  list.unshift({id:Date.now().toString(36),created:new Date().toISOString(),spec});
  write(mkey(),list.slice(0,60));
}
async function listModels(){
  if(!ONLINE)return read(mkey(),[]).map(m=>({id:m.id,created:m.created,spec:cleanSpec(m.spec||{})}));
  const c=await client();const{data,error}=await c.from('models').select('id,created_at,spec').eq('user_id',A.user.id).order('created_at',{ascending:false}).limit(60);
  if(error)throw error;return data.map(m=>({id:m.id,created:m.created_at,spec:cleanSpec(m.spec||{})}));
}
async function removeModel(id){
  if(!ONLINE){write(mkey(),read(mkey(),[]).filter(m=>m.id!==id));return;}
  const c=await client();const{error}=await c.from('models').delete().eq('id',id).eq('user_id',A.user.id);if(error)throw error;
}
async function renderModels(){
  const ul=dlg.querySelector('.hg-models');if(!ul)return;
  let items;try{items=await listModels();}catch(e){ul.innerHTML='<li class="hg-empty">'+esc(human(e))+'</li>';return;}
  if(!dlg.querySelector('.hg-models'))return;
  if(!items.length){ul.innerHTML='<li class="hg-empty">Aún no tienes modelos. Describe tu idea en el Taller y aparecerá aquí.</li>';return;}
  const fmt=d=>{try{return new Date(d).toLocaleDateString('es',{day:'numeric',month:'short',year:'numeric'});}catch(e){return '';}};
  ul.innerHTML=items.map(m=>'<li data-id="'+esc(m.id)+'"><div><b>'+esc(titleOf(m.spec))+'</b><span>'+esc([m.spec.base&&('base '+m.spec.base),m.spec.letras&&('letras '+m.spec.letras),fmt(m.created)].filter(Boolean).join(' · '))+'</span></div>'+
    '<button type="button" class="btn hg-open">Abrir</button><button type="button" class="hg-del" aria-label="Quitar '+esc(titleOf(m.spec))+'">Quitar</button></li>').join('');
  ul.querySelectorAll('li[data-id]').forEach(li=>{
    const m=items.find(x=>String(x.id)===li.dataset.id);
    li.querySelector('.hg-open').onclick=async()=>{dlg.close();const t=window.__taller;toTaller();
      if(t&&t.show){try{await t.show(m.spec);}catch(e){console.error(e);}}};
    li.querySelector('.hg-del').onclick=async()=>{try{await removeModel(m.id);}catch(e){console.error(e);}renderModels();};
  });
}

/* ---------- entradas "crear" ---------- */
function require(fn,msg){if(A.user){fn&&fn();return;}pendingAction=fn||null;open('signup',msg);}
document.addEventListener('click',e=>{
  const a=e.target.closest('[data-auth]');if(!a)return;
  e.preventDefault();
  const go=()=>{toTaller();setTimeout(()=>document.getElementById('tin')?.focus({preventScroll:true}),400);};
  require(go,'Crea tu cuenta gratis y empieza a crear tus modelos 3D.');
});

/* ---------- arranque ---------- */
paintButton();
if(ONLINE){
  /* Las cuentas de prueba viejas (nombre/correo en este navegador) ya no sirven en producción: se borran. */
  try{for(let i=localStorage.length-1;i>=0;i--){const k=localStorage.key(i);if(k&&(k===K.acc||k.startsWith('hg_models:')))localStorage.removeItem(k);}}catch(e){}
  client().then(c=>c.auth.getSession()).then(({data})=>{
    setUser(fromSb(data.session&&data.session.user));
    /* PKCE: quitar ?code=… / errores de la URL después del canje. */
    if(/[?&](code|error|error_code|error_description)=/.test(location.search))history.replaceState(null,'',location.pathname+location.hash);
  }).catch(e=>console.error('[hackgorithmic] servicio de cuentas',e));
}else if(!BROKEN){let acc=read(K.acc,null);
  if(TEST&&!(acc&&acc.email)){acc={name:'Modo prueba',email:'prueba@hackgorithmic.test',created:new Date().toISOString()};write(K.acc,acc);}
  if(acc&&acc.email)setUser({name:String(acc.name||'').slice(0,60),email:acc.email,local:true});}
})();
