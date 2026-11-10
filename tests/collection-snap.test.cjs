const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../collection-snap.js'),'utf8');
const css=fs.readFileSync(require('node:path').join(__dirname,'../floating.css'),'utf8');
function setup(options={}){
 let time=0,id=0,dialog=false,rows=254;
 const timers=new Map(),frames=new Map(),listeners={},viewListeners={},observers=[];
 const style=()=>{const values=new Map();return {getPropertyValue:n=>values.get(n)||'',setProperty(n,v){values.set(n,v);if(n==='--collection-row-height')rows=parseFloat(v);},removeProperty:n=>values.delete(n)};};
 const classes=()=>{const set=new Set();return {contains:v=>set.has(v),add:v=>set.add(v),remove:v=>set.delete(v),toggle(v,on){if(on)set.add(v);else set.delete(v);}};};
 class Element{closest(){return options.editable?{}:null;}}
 const collection={offsetTop:700,offsetParent:null},target=new Element(),root={classList:classes(),style:style()};
 const grid={children:[],classList:classes(),style:style(),contains:()=>false};
 const on=(all,name,fn)=>(all[name]??=[]).push(fn);
 const viewport={offsetTop:760,offsetParent:null,clientHeight:560,scrollTop:options.y??620,style:style(),addEventListener:(n,f)=>on(viewListeners,n,f),get scrollHeight(){return 16+Math.ceil(grid.children.length/2)*(rows+20)-20+(parseFloat(grid.style.getPropertyValue('--collection-tail-space'))||16);}};
 const event=(name,props={},where=viewListeners)=>{const e={target,touches:[],preventDefault(){throw Error('native scroll must not be intercepted');},...props};(where[name]||[]).forEach(f=>f(e));};
 viewport.scrollTo=({top})=>{viewport.scrollTop=top;event('scroll');};
 function setCards(count){grid.children=Array.from({length:count},(_,i)=>({classList:{contains:v=>v==='object-card'},get offsetTop(){return 16+Math.floor(i/(options.wide?4:2))*(rows+20);},offsetParent:viewport,querySelector(){return {offsetHeight:180};},get offsetHeight(){return options.oversized?900:rows-(i%2?0:32);}}));}
 setCards(options.cards??24);
 const media=matches=>({matches,addEventListener(n,f){this.changed=f;}}),phone=media(options.phone!==false),wide=media(!!options.wide),reduced=media(!!options.reduced);
 const document={documentElement:root,hidden:false,activeElement:options.editable?target:null,querySelector:s=>s==='#collection'?collection:s==='#collection-grid'?grid:s==='#collection-viewport'?viewport:s==='dialog[open]'&&dialog?{}:null,querySelectorAll:()=>[{}],addEventListener:(n,f)=>on(listeners,n,f)};
 const context={document,Element,innerHeight:740,scrollY:700,performance:{now:()=>time},addEventListener:(n,f)=>on(listeners,n,f),matchMedia:q=>q.includes('max-width')?phone:q.includes('min-width')?wide:reduced,MutationObserver:class{constructor(f){observers.push(f);}observe(){}},ResizeObserver:class{observe(){}},getComputedStyle:()=>({getPropertyValue:()=>'',paddingBottom:grid.style.getPropertyValue('--collection-tail-space')||'16px'}),requestAnimationFrame:f=>{frames.set(++id,f);return id;},cancelAnimationFrame:n=>frames.delete(n),setTimeout:(f,delay)=>{timers.set(++id,{f,at:time+delay});return id;},clearTimeout:n=>timers.delete(n)};
 context.scrollTo=({top})=>{context.scrollY=top;};context.window=context;context.visualViewport={height:740,scale:options.zoom||1,addEventListener(){}};
 vm.runInNewContext(source,context);
 function advance(ms){const end=time+ms;while(time<end){time=Math.min(end,time+16);for(const [key,t]of [...timers])if(t.at<=time){timers.delete(key);t.f();}const jobs=[...frames.values()];frames.clear();jobs.forEach(f=>f(time));}}
 return {root,grid,collection,viewport,context,advance,event:(n,p)=>event(n,p),global:(n,p)=>event(n,p,listeners),scroll(y){viewport.scrollTop=y;event('scroll');},setCards,setDialog(value){dialog=value;observers.forEach(f=>f());},resize(height){viewport.clientHeight=height;event('resize',{},listeners);},setReduced(value){reduced.matches=value;reduced.changed();},setPhone(value){phone.matches=value;phone.changed();}};
}
test('uses a native phone window without masking or changing any artwork opacity',()=>{
 const t=setup();assert(t.root.classList.contains('collection-windowed'));assert(!/rest-occluded|collection-at-rest|opacity/.test(source));
});
test('stopping is the browser scroll snap, declared in CSS, not a script animation',()=>{
 assert.match(css,/\.collection-windowed \.collection-viewport\{[^}]*scroll-snap-type:y mandatory/);
 assert.match(css,/\.collection-windowed \.collection-grid \.object-card\{scroll-snap-align:start;translate:none!important\}/);
 assert.match(css,/@media \(prefers-reduced-motion:reduce\)\{\.collection-windowed \.collection-viewport\{scroll-snap-type:none\}\}/);
 assert(!/function settle|watchStop|addEventListener\('scroll'/.test(source));
});
test('the script never moves the collection after a scroll, at any width',()=>{
 for(const opt of [{},{phone:false,wide:true},{phone:false}]){
  const t=setup(opt);t.scroll(640);t.advance(1200);assert.equal(t.viewport.scrollTop,640);
 }
});
test('the script leaves reduced-motion, zoomed, editing and oversized cases alone',()=>{
 for(const opt of [{reduced:true},{zoom:2},{editable:true},{oversized:true}]){const t=setup(opt);t.scroll(640);t.advance(650);assert.equal(t.viewport.scrollTop,640);}
});
test('browser toolbar resize preserves the same resting passage',()=>{
 const t=setup();t.scroll(730.6666666666665);t.resize(600);t.advance(100);assert.equal(t.viewport.scrollTop,784);
});
test('partial final groups can reach the top of the window',()=>{
 const t=setup({cards:5,y:0});assert(t.viewport.scrollHeight-t.viewport.clientHeight>=182);
});
test('resting covers reserve clearance above the floating nav even with a full-height window',()=>{
 const t=setup();
 const coverLimit=parseFloat(t.viewport.style.getPropertyValue('--collection-cover-limit'));
 const rowHeight=parseFloat(t.viewport.style.getPropertyValue('--collection-row-height'));
 const diagonal=16,navTop=560-68;
 assert.equal(16+2*(rowHeight+20)+coverLimit+diagonal,navTop-8);
});
test('desktop uses four columns with one row per screen',()=>{
 const t=setup({phone:false,wide:true});assert(t.root.classList.contains('collection-windowed'));
 assert.equal(parseFloat(t.viewport.style.getPropertyValue('--collection-row-height')),528);
 assert.equal(t.context.scrollY,700);
});
test('narrow desktop windows use two rows per screen',()=>{
 const t=setup({phone:false});assert.equal(parseFloat(t.viewport.style.getPropertyValue('--collection-row-height')),254);
});
test('resizing a browser keeps the collection at the top of the screen',()=>{
 const t=setup();t.collection.offsetTop=780;t.resize(600);t.advance(80);assert.equal(t.context.scrollY,780);
});
test('switching to phone width keeps the same first artwork in view',()=>{
 const t=setup({phone:false});t.scroll(548);t.setPhone(true);t.advance(80);assert.equal(t.viewport.scrollTop,365.33333333333326);
});
test('an empty filtered collection stays where it is put',()=>{
 const t=setup({cards:0,y:0});t.scroll(30);t.advance(650);assert.equal(t.viewport.scrollTop,30);
});
