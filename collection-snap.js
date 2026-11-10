// The collection is a native scroll window at every width. Resting stops are
// the browser's own scroll snap (see floating.css): every row start is a stop,
// so a phone rests on six works and larger screens on a full row, with the
// browser itself braking each fling — no script fights the momentum.
(()=>{
 'use strict';
 const collection=document.querySelector('#collection'),root=document.documentElement,grid=document.querySelector('#collection-grid'),viewport=document.querySelector('#collection-viewport');
 if(!grid||!viewport)return;
 const phone=matchMedia('(max-width:540px)'),wide=matchMedia('(min-width:901px)'),reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let layoutFrame=0,layoutStops=[],layoutStarts=[],previousPageStart=null;
 const enabled=()=>!grid.classList.contains('index-mode');
 function layoutTop(element){let top=0;for(let node=element;node;node=node.offsetParent)top+=node.offsetTop;return top;}
 function groups(){
  const cards=[...grid.children].filter(card=>card.classList.contains('object-card')),offset=layoutTop(viewport),result=[];
  // Every two-column layout can place either visible row at the top; four columns keep full-row stops.
  const step=wide.matches?4:2,page=wide.matches?4:phone.matches?6:4,limit=!wide.matches&&cards.length>0?Math.max(1,cards.length-2):cards.length;
  for(let i=0;i<limit;i+=step){
   const items=cards.slice(i,i+page),top=layoutTop(items[0])-offset,end=Math.max(...items.map(card=>layoutTop(card)-offset+card.offsetHeight));
   result.push({top,end,count:items.length,start:i});
  }
  return result;
 }
 function groupStop(group){return Math.max(0,group.top-16);}
 // A page of works is built to fill the window, so tolerate real card heights
 // (stagger, captions, rounding) running past the nominal window height;
 // only a group a full row taller than the window is not a resting stop.
 const fitsWindow=group=>group.end-group.top<=viewport.clientHeight+16;
 function setLayout(element,name,value){const text=`${value}px`;if(element.style.getPropertyValue(name)!==text)element.style.setProperty(name,text);}
 function syncLayout(){
  layoutFrame=0;
  const preservePage=previousPageStart!==null&&Math.abs(scrollY-previousPageStart)<3&&!root.classList.contains('section-sliding');
  const resting=layoutStops.findIndex(target=>Math.abs(target-viewport.scrollTop)<3);
  const restingStart=layoutStarts[resting]??0;
  root.classList.toggle('collection-windowed',enabled());
  if(!enabled()){
   layoutStops=[];layoutStarts=[];grid.style.removeProperty('--collection-tail-space');viewport.style.removeProperty('--collection-row-height');viewport.style.removeProperty('--collection-cover-limit');return;
  }
  // Four columns on a wide screen; three staggered rows on phones, two on other small screens.
  setLayout(root,'--collection-page-height',Math.min(innerHeight,window.visualViewport?.height||innerHeight));
  // The scroll window reaches the screen edge; resting artwork still clears the floating nav.
  const nav=document.querySelector('.central-nav'),safeBottom=parseFloat(getComputedStyle(grid).getPropertyValue('--collection-safe-bottom'))||0;
  const navReserve=(phone.matches?38:42)+(nav?.offsetHeight||60)/2+safeBottom+8;
  // On phones a resting page must clear the docked nav entirely — titles
  // included, not just artwork — and leave a peek of the next row visible
  // above the pill so the collection reads as continuing.
  const peek=phone.matches?66:0,pageReserve=phone.matches?navReserve-8+peek:0;
  const rows=wide.matches?1:phone.matches?3:2,rowHeight=Math.max(48,(viewport.clientHeight-pageReserve-32-20*(rows-1))/rows);
  setLayout(viewport,'--collection-row-height',rowHeight);
  const precedingRows=(rows-1)*(rowHeight+20),motionAllowance=phone.matches?16:24;
  setLayout(viewport,'--collection-cover-limit',Math.max(48,viewport.clientHeight-precedingRows-16-navReserve-motionAllowance));
  const pageStart=collection?layoutTop(collection):null;
  if(preservePage&&pageStart!==null&&Math.abs(scrollY-pageStart)>1)scrollTo({top:pageStart,behavior:'instant'});
  previousPageStart=pageStart;
  const items=groups();
  if(!items.length){layoutStops=[];layoutStarts=[];setLayout(grid,'--collection-tail-space',16);return;}
  const padding=parseFloat(getComputedStyle(grid).paddingBottom)||16,last=items[items.length-1];
  const withoutTail=viewport.scrollHeight-padding;
  // Allow the final one, two or three records to align without inserting any internal gaps.
  setLayout(grid,'--collection-tail-space',Math.max(16,Math.ceil(groupStop(last)+viewport.clientHeight-withoutTail)));
  const stopGroups=groups().filter(fitsWindow);
  layoutStops=stopGroups.map(groupStop);layoutStarts=stopGroups.map(group=>group.start);
  // Keep the same works in view when the column count or viewport height changes.
  const restore=stopGroups.reduce((chosen,group,index)=>group.start<=restingStart?index:chosen,0);
  if(resting>=0&&layoutStops[restore]!==undefined&&Math.abs(layoutStops[restore]-viewport.scrollTop)>1){
   viewport.scrollTo({top:layoutStops[restore],behavior:'instant'});
  }
 }
 function queueLayout(){if(!layoutFrame)layoutFrame=requestAnimationFrame(syncLayout);}
 addEventListener('resize',queueLayout,{passive:true});window.visualViewport?.addEventListener('resize',queueLayout,{passive:true});
 phone.addEventListener('change',queueLayout);wide.addEventListener('change',queueLayout);reduced.addEventListener('change',queueLayout);
 new ResizeObserver(queueLayout).observe(viewport);
 new MutationObserver(queueLayout).observe(grid,{childList:true,attributes:true,attributeFilter:['class']});
 document.fonts?.ready.then(queueLayout);
 syncLayout();
})();
