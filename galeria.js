/* Portada: filtros y flechas del carrusel, "Pídelo" (lleva la idea a Studio), barra grande del encabezado
 * y botones "Tu dibujo en 3D" / "Mi dibujo" (abren Studio en la pestaña de dibujo). */
(()=>{
const bar=document.querySelector('.tp-filters'),row=document.querySelector('.hg-row');
if(bar&&row){const items=[...row.children].filter(x=>x.dataset.cat);
  bar.addEventListener('click',e=>{const b=e.target.closest('button[data-filter]');if(!b)return;const f=b.dataset.filter;
    for(const x of bar.querySelectorAll('button'))x.setAttribute('aria-pressed',String(x===b));
    for(const it of items)it.hidden=f!=='all'&&it.dataset.cat!=='*'&&!it.dataset.cat.split(' ').includes(f);
    row.scrollTo({left:0,behavior:'smooth'});});}
document.querySelectorAll('.hg-arrows [data-dir]').forEach(b=>b.addEventListener('click',()=>{if(!row)return;
  const c=row.querySelector('.hg-card:not([hidden])'),w=c?c.getBoundingClientRect().width+16:300;row.scrollBy({left:(+b.dataset.dir)*w*2,behavior:'smooth'});}));
/* Lleva una idea a Studio (modo "Describe tu idea") y la genera; sin texto, solo abre Studio. */
function toStudio(text){
  const tin=document.getElementById('tin'),tf=document.getElementById('tform');
  if(window.hgRoute)hgRoute('taller');else document.getElementById('taller')?.scrollIntoView();
  const tt=document.querySelector('.tp-modes [data-mode="texto"]');if(tt&&tt.getAttribute('aria-selected')!=='true')tt.click();
  if(!tin||!tf)return;
  if(text){tin.value=text;tf.requestSubmit();}else setTimeout(()=>tin.focus({preventScroll:true}),300);
}
document.addEventListener('click',e=>{const a=e.target.closest('a[data-prompt]');if(!a)return;e.preventDefault();toStudio(a.dataset.prompt);});
document.addEventListener('click',e=>{const a=e.target.closest('[data-mode-go]');if(!a)return;e.preventDefault();
  if(window.hgRoute)hgRoute('taller');const t=document.querySelector('.tp-modes [data-mode="'+a.dataset.modeGo+'"]');if(t&&t.getAttribute('aria-selected')!=='true')t.click();});
const hs=document.getElementById('hsearch');
if(hs)hs.addEventListener('submit',e=>{e.preventDefault();const q=document.getElementById('hq'),v=q.value.trim();q.value='';q.blur();toStudio(v);});
})();
