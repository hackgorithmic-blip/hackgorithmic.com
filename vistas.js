/* Vistas tipo app: Inicio (generar + galería), Llaveros, Cotizar, Planes, Contacto */
(()=>{const VIEWS=['inicio','llaveros','cotizar','planes','contacto'];const secs=[...document.querySelectorAll('main [data-view]')];const links=[...document.querySelectorAll('[data-nav]')];
function apply(h){h=(h||'').replace(/^#/,'')||'inicio';const el=document.getElementById(h);const v=VIEWS.includes(h)?h:((el&&el.closest('[data-view]')||{}).dataset||{}).view||'inicio';
  for(const s of secs)s.hidden=s.dataset.view!==v;for(const a of links)a.toggleAttribute('aria-current',a.dataset.nav===v);document.body.dataset.view=v;
  if(el&&!VIEWS.includes(h))requestAnimationFrame(()=>el.scrollIntoView({block:'start'}));else scrollTo(0,0);}
window.hgRoute=id=>{if(location.hash!=='#'+id)history.pushState(null,'','#'+id);apply(id);};
document.addEventListener('click',e=>{const a=e.target.closest('a[href^="#"]');if(!a||a.hasAttribute('data-auth')||a.hasAttribute('data-prompt')||e.defaultPrevented)return;const id=a.getAttribute('href').slice(1);if(!id)return;e.preventDefault();hgRoute(id);});
addEventListener('popstate',()=>apply(location.hash));apply(location.hash);
const tin=document.getElementById('tin');tin&&tin.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();document.getElementById('tform').requestSubmit();}});})();
