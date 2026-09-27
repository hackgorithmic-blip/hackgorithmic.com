(()=>{const bar=document.querySelector('.tp-filters');if(!bar)return;const items=[...document.querySelectorAll('.tp-grid > [data-cat]')];
bar.addEventListener('click',e=>{const b=e.target.closest('button[data-filter]');if(!b)return;const f=b.dataset.filter;
for(const x of bar.querySelectorAll('button'))x.setAttribute('aria-pressed',String(x===b));
for(const it of items)it.hidden=f!=='all'&&it.dataset.cat!=='*'&&!it.dataset.cat.split(' ').includes(f);});
document.addEventListener('click',e=>{const a=e.target.closest('a[data-prompt]');if(!a)return;e.preventDefault();const tin=document.getElementById('tin'),tf=document.getElementById('tform');if(!tin||!tf)return;
window.hgRoute?hgRoute('taller'):document.getElementById('taller').scrollIntoView();const tt=document.querySelector('.tp-modes [data-mode="texto"]');if(tt&&tt.getAttribute('aria-selected')!=='true')tt.click();tin.value=a.dataset.prompt;tf.requestSubmit();});})();
