/* Tema claro / oscuro: sigue el modo del teléfono o la computadora y recuerda si la persona lo cambia.
 * Se carga en <head> (antes de pintar) para que la página no parpadee. El botón es .hg-theme en el encabezado. */
(()=>{
const K='hg_theme',root=document.documentElement,mq=matchMedia('(prefers-color-scheme: dark)');
const saved=()=>{try{const v=localStorage.getItem(K);return v==='light'||v==='dark'?v:null;}catch(e){return null;}};
function apply(t){
  root.dataset.theme=t;root.style.colorScheme=t;
  document.querySelectorAll('.hg-theme').forEach(b=>{b.dataset.mode=t;b.setAttribute('aria-label',t==='dark'?'Cambiar a modo claro':'Cambiar a modo oscuro');b.title=b.getAttribute('aria-label');});
}
apply(saved()||(mq.matches?'dark':'light'));
if(mq.addEventListener)mq.addEventListener('change',e=>{if(!saved())apply(e.matches?'dark':'light');});
document.addEventListener('click',e=>{
  if(!e.target.closest('.hg-theme'))return;
  const t=root.dataset.theme==='dark'?'light':'dark';
  try{localStorage.setItem(K,t);}catch(x){}
  apply(t);
});
document.addEventListener('DOMContentLoaded',()=>apply(root.dataset.theme));
})();
