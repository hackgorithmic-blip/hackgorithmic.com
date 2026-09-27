/* Vistas tipo app: Inicio (generar + galería), Taller (espacio de trabajo), Llaveros, Cotizar, Planes, Contacto.
 * Una sección puede pertenecer a varias vistas: data-view="inicio taller". */
(()=>{const VIEWS=['inicio','taller','llaveros','cotizar','planes','contacto'];const inView=(s,v)=>(s.dataset.view||'').split(/\s+/).includes(v);const secs=[...document.querySelectorAll('main [data-view]')];const links=[...document.querySelectorAll('[data-nav]')];
function apply(h){h=(h||'').replace(/^#/,'')||'inicio';const el=document.getElementById(h);const v=VIEWS.includes(h)?h:((((el&&el.closest('[data-view]'))||{}).dataset||{}).view||'inicio').split(/\s+/)[0];
  for(const s of secs)s.hidden=!inView(s,v);for(const a of links){if(a.dataset.nav===v)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');}document.body.dataset.view=v;setTimeout(()=>{if(typeof window.hgRedraw==='function')window.hgRedraw();},0);
  if(el&&!VIEWS.includes(h))requestAnimationFrame(()=>el.scrollIntoView({block:'start'}));else scrollTo(0,0);}
window.hgRoute=id=>{if(location.hash!=='#'+id)history.pushState(null,'','#'+id);apply(id);};
document.addEventListener('click',e=>{const a=e.target.closest('a[href^="#"]');if(a&&a.classList.contains('shader-skip')){e.preventDefault();const m=document.getElementById('inicio');if(m)m.focus();return;}if(!a||a.hasAttribute('data-auth')||a.hasAttribute('data-prompt')||e.defaultPrevented)return;const id=a.getAttribute('href').slice(1);if(!id)return;e.preventDefault();hgRoute(id);});
addEventListener('popstate',()=>apply(location.hash));apply(location.hash);
const tin=document.getElementById('tin');tin&&tin.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();document.getElementById('tform').requestSubmit();}});})();
