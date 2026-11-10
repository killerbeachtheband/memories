'use strict';
const collectionDate=e=>Object.prototype.hasOwnProperty.call(e,'sortDate')?(e.sortDate||''):(e.experiencedDate||e.releaseDate||'');
const registeredEntries=ARCHIVE.entries.map(e=>({...e,pageTitle:e.title,title:e.category==='映画'?(e.originalTitle?.trim()||e.title):e.title}));
const entries=[...registeredEntries].sort((a,b)=>collectionDate(b).slice(0,10).localeCompare(collectionDate(a).slice(0,10))),grid=document.querySelector('#collection-grid'),search=document.querySelector('#search'),filters=document.querySelector('.filters'),detailDialog=document.querySelector('#detail-dialog'),aboutDialog=document.querySelector('#about-dialog');
// The grid opens in a fresh shuffle on every visit; Newest lists the latest registrations first.
const shuffled=list=>{const a=[...list];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
let sortMode='shuffle';
let displayEntries=shuffled(registeredEntries);
function updateSortButtons(){
 document.querySelectorAll('[data-sort]').forEach(b=>{const s=b.dataset.sort===sortMode;b.classList.toggle('active',s);b.setAttribute('aria-pressed',String(s));});
 const pill=document.querySelector('#sort-order');
 if(pill)pill.setAttribute('aria-label',sortMode==='shuffle'?'Sort: Shuffle — tap to switch to Newest':'Sort: Newest — tap to switch to Shuffle');
}
function applySort(mode){
 sortMode=mode;
 displayEntries=mode==='newest'?[...registeredEntries].reverse():shuffled(registeredEntries);
 displayLimit=12;updateSortButtons();render();
}
const activeFilters=new Set();
let activeMember='all';
const activeRatings=new Set();
let collectionScope='both';
const filterHelp={collection:'All records except the Formative picks.',formative:'The records that influenced us most.',both:'All records, including the Formative picks.',goat:'GOAT marks all-time favourites.'};
let displayLimit=12;
// Formative is an explicit checkbox in the log sheet, independent of all dates.
function isFormative(e){
 return e.formative===true;
}
function matchesCollectionFilter(e,selected=activeFilters,scope=collectionScope){
 return (scope==='both'||isFormative(e)===(scope==='formative'))&&(!selected.size||selected.has(e.category));
}
function matchesRating(e,selected=activeRatings){
 if(!selected.size)return typeof e.rating==='number';
 if(typeof e.rating!=='number')return selected.has('unrated');
 if(selected.has('goat')&&e.hallOfFame)return true;
 return typeof e.rating==='number'&&selected.has(`score-${e.rating}`);
}
function updateRatingButtons(){
 const panel=document.querySelector('#rating-filters');if(!panel)return;
 panel.querySelectorAll('[data-rating]').forEach(b=>{
  const selected=activeRatings.has(b.dataset.rating);b.classList.toggle('active',selected);b.setAttribute('aria-pressed',String(selected));
 });
 const summary=panel.querySelector('#rating-summary');
 if(summary)summary.textContent=activeRatings.size?[...activeRatings].map(v=>v==='goat'?'GOAT':v==='unrated'?'Unrated':v.slice(6)).join(', '):'Rated';
 const clear=panel.querySelector('#rating-clear');if(clear)clear.hidden=!activeRatings.size;
}
function initRatingFilters(){
 const panel=document.querySelector('#rating-filters');if(!panel)return;
 const help=panel.querySelector('#goat-help');if(help)help.textContent=filterHelp.goat;
 panel.querySelector('[data-rating-group="score"] .rating-options').innerHTML=Array.from({length:11},(_,i)=>10-i).map(n=>`<button class="rating-filter" data-rating="score-${n}" aria-pressed="false" aria-label="${n} out of 10">${n}</button>`).join('');
 panel.addEventListener('click',event=>{
  if(event.target.closest('#rating-clear')){activeRatings.clear();displayLimit=12;updateFilterButtons();updateRatingButtons();render();return;}
  const button=event.target.closest('[data-rating]');if(!button)return;
  const value=button.dataset.rating;if(activeRatings.has(value))activeRatings.delete(value);else activeRatings.add(value);
  displayLimit=12;updateFilterButtons();updateRatingButtons();render();
 });
 updateRatingButtons();
}
let autoMoreObserver=null,autoMoreFrame=0;
const escapeHTML=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const isJapanese=v=>/[\u3040-\u30ff\u3400-\u9fff]/.test(v);
const jaLang=v=>v&&isJapanese(v)?' lang="ja"':'';
const pad=v=>String(v).padStart(2,'0');
const formatDate=v=>v?v.slice(0,10).replaceAll('-','.'):'UNDATED';
const categoryNames={'all':'All media','映画':'Cinema','音楽':'Music','アート':'Art','舞台・ライブ':'Live','建築':'Architecture','ゲーム':'Games','本':'Books','その他':'Other'};
const ratingText=e=>typeof e.rating==='number'?`${e.rating} / 10`:'Unrated';
const safeURL=v=>{try{const u=new URL(v);return ['https:','http:'].includes(u.protocol)?u.href:'';}catch{return '';}};
// The object edition uses short panel transitions; other editions keep native dialogs.
const floatingEdition=document.documentElement.dataset.edition==='floating';
const dialogClosures=new WeakMap(),dialogOpeners=new WeakMap();
function openArchiveDialog(dialog,opener=document.activeElement){
 if(dialog.open)return;
 dialogOpeners.set(dialog,opener||document.activeElement);
 dialog.classList.remove('is-closing');dialog.showModal();dialog.scrollTop=0;
}
function closeArchiveDialog(dialog){
 if(dialogClosures.has(dialog))return dialogClosures.get(dialog);
 if(!dialog.open)return Promise.resolve();
 const finish=()=>{
  dialog.close();dialog.classList.remove('is-closing');
  const opener=dialogOpeners.get(dialog);if(opener?.isConnected)opener.focus({preventScroll:true});
 };
 if(!floatingEdition||matchMedia('(prefers-reduced-motion: reduce)').matches){if(typeof detailArtworkTransition!=='undefined')detailArtworkTransition.cancel(dialog);finish();return Promise.resolve();}
 if(typeof detailArtworkTransition!=='undefined'){
  const flight=detailArtworkTransition.leave(dialog,finish);
  if(flight){dialogClosures.set(dialog,flight);flight.finally(()=>dialogClosures.delete(dialog));return flight;}
 }
 const closing=new Promise(resolve=>{
  dialog.classList.add('is-closing');
  setTimeout(()=>{finish();dialogClosures.delete(dialog);resolve();},160);
 });
 dialogClosures.set(dialog,closing);return closing;
}
const palettes={'映画':'cinema','音楽':'music','アート':'art','建築':'architecture','舞台・ライブ':'live','ゲーム':'game','本':'book','その他':'other'};
function coverMarkup(e,eager=false){
 const n=pad(entries.indexOf(e)+1);
 if(e.cover)return `<div class="cover cover-photo ${e.source==='music'?'is-album':''}"><img src="${escapeHTML(e.cover)}" alt="${escapeHTML(e.title)} — cover artwork" ${eager?'':'loading="lazy"'}><span class="photo-number" aria-hidden="true">M / ${n}</span></div>`;
 return `<div class="cover cover-typographic palette-${palettes[e.category]||'other'}" aria-hidden="true"><span class="cover-index">M / ${n}</span><span class="fallback-shape"></span><span class="real-cover-title${isJapanese(e.title)?' japanese':''}${e.title.length>28?' long-title':''}">${escapeHTML(e.title)}</span><span class="cover-year">${e.label} / TEXT EDITION</span></div>`;
}
function inlineMarkdown(text){
 return text.split(/(\[[^\]]+\]\(https?:\/\/[^\s]+\)|\*\*[^*]+\*\*|`[^`]+`)/g).map(part=>{
  const link=part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s]+)\)$/);
  if(link){const u=safeURL(link[2]);return u?`<a href="${escapeHTML(u)}" target="_blank" rel="noopener noreferrer">${escapeHTML(link[1])} ↗</a>`:escapeHTML(link[1]);}
  if(part.startsWith('**')&&part.endsWith('**'))return `<strong>${escapeHTML(part.slice(2,-2))}</strong>`;
  if(part.startsWith('`')&&part.endsWith('`'))return `<code>${escapeHTML(part.slice(1,-1))}</code>`;
  return escapeHTML(part);
 }).join('');
}
// Hide unfilled template sections, preserving written content and the source snapshot.
function omitEmptySections(markdown){
 const optional=new Set(['感想','印象に残ったところ','感じたこと・考えたこと','好きだった点 / いまいちだった点','お気に入りの曲','メモ','お気に入りの一節・シーン','次に観たい・読みたいもの','批評家スコア']);
 const lines=markdown.replaceAll('\r','').split('\n').filter(line=>!/^\s*(?:[-*+]\s+|\d+\.\s+)?(?:Pitchfork|Metacritic)\s*[:：]\s*$/i.test(line.replace(/\*\*/g,'')));
 const heading=line=>line.match(/^(#{1,6})\s+(.+)$/);
 const hasContent=line=>{
  const text=line.trim().replace(/^>\s*/,'').replace(/^(?:[-*+]\s*|\d+\.\s*)/,'').replace(/^\[[ xX]\]\s*/,'').replace(/\*\*/g,'').trim();
  return !!text&&!/^[-*_]+$/.test(text)&&!heading(text)&&!/^(?:好き|いまいち)\s*[:：]\s*$/.test(text);
 };
 for(let i=lines.length-1;i>=0;i--){
  const h=heading(lines[i]);if(!h||!optional.has(h[2].trim().replace(/\s*[／/]\s*/g,' / ')))continue;
  let end=i+1;while(end<lines.length){const next=heading(lines[end]);if(next&&next[1].length<=h[1].length)break;end++;}
  if(!lines.slice(i+1,end).some(hasContent))lines.splice(i,end-i);
 }
 return lines.join('\n');
}
// Escape source content before rendering. Notion HTML is never executed.
function renderMarkdown(markdown){
 let html='',paragraph=[],list=null,section='';
 const flush=()=>{if(paragraph.length){html+=`<p${section==='synopsis'?' class="synopsis-text"':''}>${paragraph.map(inlineMarkdown).join('<br>')}</p>`;paragraph=[];}};
 const closeList=()=>{if(list){html+=`</${list}>`;list=null;}};
 const lines=omitEmptySections(markdown).split('\n');
 for(let i=0;i<lines.length;i++){
  const line=lines[i];
  const trackHeading=line.match(/^(#{1,6})\s+(?:トラックリスト|track\s*list)\s*$/i);
  if(trackHeading){
   flush();closeList();let end=i+1;
   while(end<lines.length){const next=lines[end].match(/^(#{1,6})\s+/);if(next&&next[1].length<=trackHeading[1].length)break;end++;}
   const content=lines.slice(i+1,end);
   const count=content.filter(l=>/^\s*(?:\d+\.\s+|[-*+]\s+)\S/.test(l)).length;
   html+=`<details class="tracklist"><summary>Tracklist · ${count} ${count===1?'track':'tracks'}</summary>${renderMarkdown(content.join('\n'))}</details>`;
   i=end-1;continue;
  }
  if(!line.trim()){flush();closeList();continue;}
  const h=line.match(/^(#{1,6})\s+(.+)$/);
  if(h){flush();closeList();section=h[2].trim()==='概要'?'synopsis':'';const n=h[1].length<=2?3:4;html+=`<h${n}${section==='synopsis'?' class="synopsis-heading"':''}>${inlineMarkdown(h[2])}</h${n}>`;continue;}
  if(/^---+$/.test(line.trim())){flush();closeList();html+='<hr>';continue;}
  const item=line.match(/^\s*(?:([-*])\s+|\d+\.\s+)(.*)$/);
  if(item){flush();const kind=item[1]?'ul':'ol';if(list!==kind){closeList();html+=`<${kind}>`;list=kind;}html+=`<li>${inlineMarkdown(item[2])}</li>`;continue;}
  if(/^>/.test(line)){flush();closeList();const q=line.replace(/^>\s?/,'');if(q.trim())html+=`<blockquote>${inlineMarkdown(q)}</blockquote>`;continue;}
  closeList();paragraph.push(line);
 }
 flush();closeList();return html;
}
function initFilters(){
 const order=['all','映画','音楽','アート','舞台・ライブ','建築','ゲーム','本','その他'];
 filters.innerHTML=order.filter(c=>c==='all'||entries.some(e=>e.category===c)).map(c=>`<button class="filter" data-filter="${escapeHTML(c)}" aria-pressed="false">${categoryNames[c]} <sup></sup></button>`).join('');
 const front=document.querySelector('#category-filters');if(front)front.innerHTML=filters.innerHTML;
 document.querySelector('#collection-scope')?.addEventListener('click',event=>{
  const button=event.target.closest('[data-scope]');if(!button)return;
  collectionScope=button.dataset.scope;displayLimit=12;updateFilterButtons();render();
 });
 const sortPill=document.querySelector('#sort-order');
 sortPill?.addEventListener('click',()=>applySort(sortMode==='shuffle'?'newest':'shuffle'));
 sortPill?.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();applySort(sortMode==='shuffle'?'newest':'shuffle');}});
 updateSortButtons();
 updateFilterButtons();
}
function resetCollectionFilters(){
 search.value='';activeFilters.clear();activeRatings.clear();collectionScope='both';activeMember='all';updateMemberButtons();
 displayLimit=12;sortMode='shuffle';displayEntries=shuffled(registeredEntries);updateSortButtons();updateFilterButtons();updateRatingButtons();render();
}
function updateFilterButtons(){
 document.querySelectorAll('[data-scope]').forEach(button=>{
  const selected=button.dataset.scope===collectionScope;button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected));
  const count=entries.filter(e=>matchesRating(e)&&matchesCollectionFilter(e,activeFilters,button.dataset.scope)).length;
  button.querySelector('sup').textContent=pad(count);
 });
 const help=document.querySelector('#scope-help');if(help&&help.textContent!==filterHelp[collectionScope])help.textContent=filterHelp[collectionScope];
 [...filters.querySelectorAll('[data-filter]'),...(document.querySelector('#category-filters')?.querySelectorAll?.('[data-filter]')||[])].forEach(button=>{
  const key=button.dataset.filter,selected=key==='all'?activeFilters.size===0:activeFilters.has(key);
  button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected));
  const count=entries.filter(e=>matchesRating(e)&&matchesCollectionFilter(e,key==='all'?new Set():new Set([key]))).length;
  button.querySelector('sup').textContent=pad(count);
 });
}
function cardMarkup(e){
 const date=collectionDate(e);
 if(document.documentElement.dataset.edition==='floating')return `<article class="object-card"><button class="object-open" data-entry="${e.id}" aria-label="Read the note: ${escapeHTML(e.title)}"><span class="object-index">${pad(entries.indexOf(e)+1)}</span>${coverMarkup(e)}<span class="object-caption"><span class="object-title"${isJapanese(e.title)?' lang="ja"':''}>${escapeHTML(e.title)}</span><span class="object-label">${e.label}${e.member?` · ${escapeHTML(e.member)}`:''}</span><span class="object-rating">${escapeHTML(ratingText(e))}</span></span><span class="hover-label" aria-hidden="true">Open ↗</span></button></article>`;
 return `<article class="object-card"><button class="object-open" data-entry="${e.id}" aria-label="Read the note: ${escapeHTML(e.title)}">${coverMarkup(e)}<div class="card-content"><div class="object-meta"><span>${e.label}</span><span>${date?`${e.source==='music'?'RELEASED':'EXPERIENCED'} ${formatDate(date)}`:'UNDATED'}</span></div><h3 class="object-title${isJapanese(e.title)?' jp':''}"${isJapanese(e.title)?' lang="ja"':''}>${escapeHTML(e.title)}</h3><p class="object-creator">${escapeHTML(e.creator||'Creator unrecorded')}</p><p class="card-excerpt${e.note?'':' is-empty'}"${isJapanese(e.note)?' lang="ja"':''}>${escapeHTML(e.note||'No note.')}</p><div class="object-bottom"><span class="card-rating${e.hallOfFame?' is-favorite':''}">${e.hallOfFame?'◇ ':''}${escapeHTML(ratingText(e))}${e.hallOfFame&&e.source==='music'?' · GOAT':''}</span><span class="card-read">Read note <span class="card-arrow" aria-hidden="true">↗</span></span></div></div></button></article>`;
}
function render(append=false,focusAdded=false){
 if(!append)document.querySelector('#load-status').textContent='';
 const q=search.value.trim().normalize('NFKC').toLocaleLowerCase('ja');
 let visible=displayEntries.filter(e=>matchesCollectionFilter(e)&&matchesRating(e)&&(activeMember==='all'||e.member===activeMember)&&[e.title,e.pageTitle,e.originalTitle,e.creator,e.category,e.label,e.note,e.member,...e.tags].join(' ').normalize('NFKC').toLocaleLowerCase('ja').includes(q));
 const shown=visible.slice(0,displayLimit);
 const previousCount=append?grid.children.length:0;
 // Keep existing DOM, image state, reveal state and scroll position when extending.
 if(append)grid.insertAdjacentHTML('beforeend',shown.slice(previousCount).map(cardMarkup).join(''));
 else grid.innerHTML=shown.map(cardMarkup).join('');
 if(!append&&floatingEdition)document.querySelector('#collection-viewport')?.scrollTo({top:0,behavior:'instant'});
 document.querySelector('#result-count').textContent=`${pad(visible.length)} ${visible.length===1?'OBJECT':'OBJECTS'} / ${collectionScope==='both'?'ALL':collectionScope==='formative'?'FORMATIVE':'COLLECTION'}${q||activeFilters.size||activeRatings.size?' / FILTERED':''}`;
 document.querySelector('#empty-state').hidden=visible.length>0;
 const more=document.querySelector('#load-more');more.hidden=shown.length>=visible.length;more.innerHTML=`Load more <span class="remaining-count">${visible.length-shown.length} remaining</span><span aria-hidden="true">↓</span>`;
 document.querySelector('#shown-count').textContent=visible.length?`${shown.length} / ${visible.length} RECORDS`:'';
 if(append){
  document.querySelector('#load-status').textContent=`${shown.length-previousCount} more records added. Showing ${shown.length} of ${visible.length}.`;
  // Continue keyboard reading at the newly inserted content without scrolling.
  if(focusAdded)grid.children[previousCount]?.querySelector('button').focus({preventScroll:true});
 }
 if(autoMoreObserver)queueAutoMore();
}
function loadNextRecords(focusAdded=false){
 if(document.querySelector('#load-more').hidden)return;
 displayLimit+=12;render(true,focusAdded);
}
function queueAutoMore(){
 if(autoMoreFrame)return;
 autoMoreFrame=requestAnimationFrame(()=>{
  autoMoreFrame=0;
  if(document.hidden||document.querySelector('dialog[open]')||document.querySelector('#load-more').hidden)return;
  const bounds=document.querySelector('.load-more-wrap').getBoundingClientRect();
  if(bounds.top<=innerHeight+900&&bounds.bottom>=0)loadNextRecords();
 });
}
function detailSources(e){
 const links=Object.entries(e.links).filter(([,u])=>safeURL(u));
 const scores=new Map(),extraFacts=[];
 const scoreText=(label,value)=>{
  const text=String(value??'').trim();if(!text)return '';
  const n=text.match(/^(\d+(?:\.\d+)?)(?:\s*(%|\/\s*\d+))?(.*)$/);
  if(!n)return text;
  const unit=n[2]||(label.startsWith('Rotten Tomatoes')?'%':label==='Metacritic'?'/ 100':'/ 10');
  return `${n[1]}${unit==='%'?'%':' '+unit}${n[3]}`;
 };
 for(const[label,value]of Object.entries(e.scores||{})){const text=scoreText(label,value);if(text)scores.set(label,text);}
 const body=[],review=[];let sectionLevel=0;
 for(const line of (e.body||'').replaceAll('\r','').split('\n')){
  const heading=line.match(/^(#{1,6})\s+(.+)$/);
  if(heading&&sectionLevel&&heading[1].length<=sectionLevel)sectionLevel=0;
  if(heading&&heading[2].trim()==='批評家スコア'){sectionLevel=heading[1].length;continue;}
  (sectionLevel?review:body).push(line);
 }
 for(const line of review){
  for(const[,label,url]of line.matchAll(/\[([^\]]+)\]\((https?:\/\/[^\s]+)\)/g)){
   if(!safeURL(url))continue;
   const host=new URL(url).hostname.replace(/^www\./,'');
   const name=host==='pitchfork.com'?'Pitchfork':host==='metacritic.com'?'Metacritic':host==='rottentomatoes.com'?'Rotten Tomatoes':label;
   if(!links.some(([,u])=>safeURL(u)===safeURL(url)))links.push([name,url]);
  }
  const text=line.replace(/^\s*(?:[-*]\s+|>\s*)/,'').replace(/\[([^\]]+)\]\(https?:\/\/[^\s]+\)/g,'$1').replace(/\*\*/g,'').trim();
  if(!text||/^[-*_]+$/.test(text)||/^出典\s*[:：]/.test(text))continue;
  const score=text.match(/^(Pitchfork|Metacritic|Rotten Tomatoes)([^:：]*)[:：]\s*(.*)$/);
  if(score){
   const name=score[1]==='Rotten Tomatoes'&&/オーディエンス|audience/i.test(score[2])?'Rotten Tomatoes / Audience':score[1];
   const value=scoreText(name,score[3]);if(value)scores.set(name,value);continue;
  }
  const fact=text.match(/^([^:：]+)[:：]\s*(.+)$/);
  if(fact)extraFacts.push([fact[1]==='参照日'?'SCORES CHECKED ON':fact[1]==='プラットフォーム'?'PLATFORM':fact[1],fact[2]]);
  else if(!/^#/.test(text))extraFacts.push(['REVIEW NOTE',text]);
 }
 return {links,body:body.join('\n'),reviewFacts:[...scores,...extraFacts]};
}

function workKey(e){return `${e.category}|${String(e.title||'').trim().replace(/^(?:\(\S{1,8}\)|（[^）]{1,8}）)\s*/,'').toLowerCase()}`}
const MEMBER_COLORS={Naoki:'#FF4D00',Toshi:'#2563EB',Ryota:'#0E9F6E',Ryusei:'#7C3AED'};
const memberColor=m=>MEMBER_COLORS[m]||'#6B7280';
function ratingBarMarkup(r){
 if(typeof r.rating!=='number')return '';
 const pct=Math.max(0,Math.min(100,r.rating*10));
 return `<span class="rating-bar" role="img" aria-label="Rating ${escapeHTML(ratingText(r))}"><span class="rating-fill" style="width:${pct}%;background:${memberColor(r.member)}"></span><span class="rating-grid"></span></span>`;
}
function sameWorkReviews(e){
 const group=entries.filter(item=>workKey(item)===workKey(e));
 if(group.length<2)return null;
 const rank=m=>{const i=['Naoki','Toshi','Ryota','Ryusei'].indexOf(m);return i<0?99:i};
 return [e,...group.filter(item=>item.id!==e.id).sort((a,b)=>rank(a.member)-rank(b.member))];
}
function memberReviewMarkup(r){
 const {body}=detailSources(r);
 return `<article class="member-review"><header class="member-review-head"><span class="member-review-name">${escapeHTML(r.member||'Unknown member')}</span><span class="member-review-rating">${escapeHTML(ratingText(r))}${isFormative(r)?'<span class="formative-badge">Formative</span>':''}</span></header>${typeof r.rating==='number'?`<div class="rating-row">${ratingBarMarkup(r)}</div>`:''}<p class="detail-note${r.note?'':' note-empty'}"${jaLang(r.note)}>${r.note?escapeHTML(r.note):'No note has been recorded yet.'}</p>${body?`<div class="member-review-body"${jaLang(body)}>${renderMarkdown(body)}</div>`:''}</article>`;
}
let currentDetailId=null;
function renderDetail(e){
 currentDetailId=e.id;
 const reviews=sameWorkReviews(e)||[e];
 const facts=[[e.dateLabel||(e.source==='music'?'RELEASED ON':'EXPERIENCED ON'),formatDate(collectionDate(e))]];
 if(e.format)facts.push(['FORMAT',e.format]);
 const {links,body,reviewFacts}=detailSources(e);
 const checkedOn=reviewFacts.filter(([k])=>k==='SCORES CHECKED ON').map(([,v])=>v);
 facts.push(...reviewFacts.filter(([k])=>k!=='SCORES CHECKED ON'));
 const scoreContext=checkedOn.length?`<span class="score-context">Checked ${checkedOn.map(v=>escapeHTML(formatDate(v))).join(', ')}. Scores may change.</span>`:'';
 document.querySelector('#detail-content').innerHTML=`<div class="detail-layout"><div class="detail-visual">${coverMarkup(e,true)}</div><div class="detail-body"><h2 id="detail-title" class="${isJapanese(e.title)?'jp':''}"${jaLang(e.title)}>${escapeHTML(e.title)}</h2>${e.originalTitle?.trim() && e.originalTitle.trim()!==e.title?`<p class="original-title"${jaLang(e.originalTitle)}>${escapeHTML(e.originalTitle)}</p>`:''}<p class="detail-creator"${jaLang(e.creator)}>${escapeHTML(e.creator||'Creator unrecorded')}</p><div class="detail-tags">${e.tags.map(t=>`<span>${escapeHTML(t)}</span>`).join('')}</div><dl class="detail-facts">${facts.map(([k,v])=>`<div><dt>${escapeHTML(k)}</dt><dd>${escapeHTML(v)}</dd></div>`).join('')}</dl><div class="source-links">${links.map(([k,u])=>`<a href="${escapeHTML(safeURL(u))}" target="_blank" rel="noopener noreferrer">${k==='リンク'?'Listen online':escapeHTML(k)} ↗</a>`).join('')}</div></div></div>${`<section class="member-reviews"><h3 class="member-reviews-heading">MEMBER REVIEWS</h3>${reviews.map(memberReviewMarkup).join('')}</section>`}<p class="detail-disclaimer"><a href="${escapeHTML(safeURL(e.url))}" target="_blank" rel="noopener noreferrer">Open the log sheet</a>${scoreContext}</p>`;
}
function showEntry(id,button=null){
 if(detailDialog.open)return;
 const e=entries.find(item=>item.id===id);if(!e)return;
 renderDetail(e);
 const reveal=()=>openArchiveDialog(detailDialog,button);
 if(floatingEdition&&typeof detailArtworkTransition!=='undefined')detailArtworkTransition.open(detailDialog,button,reveal);
 else reveal();
}
// A horizontal swipe steps through the collection in the order currently
// on screen: the open detail slides out and the next one slides in.
function detailNavList(){
 const q=search.value.trim().normalize('NFKC').toLocaleLowerCase('ja');
 const seen=new Set(),list=[];
 for(const e of displayEntries){
  if(!matchesCollectionFilter(e)||!matchesRating(e)||(activeMember!=='all'&&e.member!==activeMember))continue;
  if(![e.title,e.pageTitle,e.originalTitle,e.creator,e.category,e.label,e.note,e.member,...e.tags].join(' ').normalize('NFKC').toLocaleLowerCase('ja').includes(q))continue;
  const key=workKey(e);if(seen.has(key))continue;seen.add(key);list.push(e);
 }
 return list;
}
let detailStepping=false;
function stepDetail(dir){
 if(!detailDialog.open||!currentDetailId||detailStepping)return;
 const list=detailNavList(),index=list.findIndex(e=>e.id===currentDetailId);
 if(index<0)return;
 const next=list[index+dir];if(!next)return;
 const content=document.querySelector('#detail-content');
 const swap=()=>{
  renderDetail(next);detailDialog.scrollTop=0;
  content.animate?.([{transform:`translateX(${dir*36}px)`,opacity:0},{transform:'translateX(0px)',opacity:1}],{duration:210,easing:'cubic-bezier(.22,.9,.3,1)'});
 };
 if(content.animate){
  detailStepping=true;
  const out=content.animate([{transform:'translateX(0px)',opacity:1},{transform:`translateX(${-dir*36}px)`,opacity:0}],{duration:130,easing:'ease-in'});
  const done=()=>{if(!detailStepping)return;detailStepping=false;swap();};
  out.onfinish=done;out.oncancel=done;
 }else swap();
}
if(detailDialog){
 let touchX=null,touchY=null;
 detailDialog.addEventListener('touchstart',event=>{
  if(event.touches.length!==1){touchX=null;return;}
  touchX=event.touches[0].clientX;touchY=event.touches[0].clientY;
 },{passive:true});
 detailDialog.addEventListener('touchend',event=>{
  if(touchX===null)return;
  const dx=event.changedTouches[0].clientX-touchX,dy=event.changedTouches[0].clientY-touchY;touchX=null;
  if(Math.abs(dx)>=56&&Math.abs(dx)>=Math.abs(dy)*1.5)stepDetail(dx<0?1:-1);
 });
 detailDialog.addEventListener('keydown',event=>{
  if(event.key==='ArrowRight')stepDetail(1);
  else if(event.key==='ArrowLeft')stepDetail(-1);
 });
}
function renderFavorites(){
 if(!document.querySelector('.favorite-grid'))return;
 const favorites=entries.filter(e=>e.hallOfFame);
 document.querySelector('.favorite-grid').innerHTML=favorites.map((e,i)=>`<button class="favorite" data-entry="${e.id}" aria-label="Hall of fame: ${escapeHTML(e.title)}"><span class="favorite-number">${['I.','II.','III.','IV.'][i]||i+1}</span><div class="round-art ${e.cover?'':'round-fallback'}">${e.cover?`<img src="${escapeHTML(e.cover)}" alt="${escapeHTML(e.title)} — cover artwork" loading="lazy">`:`<span>${escapeHTML(e.originalTitle||e.title)}</span>`}</div><span class="favorite-kind">${e.label} / ${e.source==='music'?'GOAT':'ALL-TIME BEST'}</span><h3 class="${isJapanese(e.title)?'jp':''}">${escapeHTML(e.title)}</h3><span class="favorite-link">${escapeHTML(ratingText(e))} <span aria-hidden="true">↗</span></span></button>`).join('');
 document.querySelector('#favorites-count').textContent=`${pad(favorites.length)} PERSONAL FAVORITES`;
}
function onFilterClick(event){
 const b=event.target.closest('[data-filter]');if(!b)return;
 const key=b.dataset.filter;
 if(key==='all'){activeFilters.clear();}
 else if(activeFilters.has(key))activeFilters.delete(key);
 else activeFilters.add(key);
 displayLimit=12;updateFilterButtons();updateRatingButtons();render();
}
filters.addEventListener('click',onFilterClick);
document.querySelector('#category-filters')?.addEventListener('click',onFilterClick);
search.addEventListener('input',()=>{displayLimit=12;render();});
document.querySelector('#load-more').addEventListener('click',()=>loadNextRecords(true));
document.addEventListener('click',event=>{const b=event.target.closest('[data-entry]');if(b)showEntry(b.dataset.entry,b);});
document.querySelector('#reset-search').addEventListener('click',()=>{resetCollectionFilters();const menu=document.querySelector('#menu-dialog');if(menu&&!menu.open)openArchiveDialog(menu);search.focus();});
for(const id of ['about-open','credits-open'])document.getElementById(id)?.addEventListener('click',()=>{if(floatingEdition&&id==='about-open')return;openArchiveDialog(aboutDialog);});
document.querySelectorAll('dialog').forEach(dialog=>{
 dialog.querySelector('.dialog-close').addEventListener('click',()=>closeArchiveDialog(dialog));
 let backdropStart=false;
 const outside=event=>{const r=dialog.getBoundingClientRect();return event.target===dialog&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom);};
 dialog.addEventListener('pointerdown',event=>{backdropStart=outside(event);});
 dialog.addEventListener('click',event=>{if(backdropStart&&outside(event))closeArchiveDialog(dialog);backdropStart=false;});
 dialog.addEventListener('cancel',event=>{if(floatingEdition){event.preventDefault();closeArchiveDialog(dialog);}});
 dialog.addEventListener('close',()=>{if(typeof detailArtworkTransition!=='undefined')detailArtworkTransition.cancel(dialog);if(!document.querySelector('dialog[open]'))document.body.style.overflow='';});
 new MutationObserver(()=>{if(dialog.open)document.body.style.overflow='hidden';}).observe(dialog,{attributes:true,attributeFilter:['open']});
});
document.addEventListener('keydown',event=>{if(event.key==='/'&&!document.querySelector('dialog[open]')&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)){event.preventDefault();search.focus();search.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}});
document.addEventListener('error',event=>{const img=event.target;if(img.tagName!=='IMG'||!img.closest('.cover-photo'))return;const card=img.closest('.cover-photo');card.classList.add('image-unavailable','cover-typographic');card.classList.remove('cover-photo');img.remove();const label=document.createElement('span');label.className='real-cover-title';label.textContent=img.alt.replace(/ — cover artwork$/,'');card.append(label);},true);
function updateMemberButtons(){
 document.querySelectorAll('[data-member]').forEach(b=>{const s=b.dataset.member===activeMember;b.classList.toggle('active',s);b.setAttribute('aria-pressed',String(s));});
}
function initMemberFilters(){
 const box=document.querySelector('#member-filters');if(!box)return;
 const members=[...new Set(['Naoki','Toshi','Ryota','Ryusei',...entries.map(e=>e.member).filter(Boolean)])];
 box.innerHTML=['all',...members].map(m=>`<button class="filter" data-member="${escapeHTML(m)}" aria-pressed="false">${m==='all'?'All members':escapeHTML(m)}</button>`).join('');
 box.addEventListener('click',event=>{const b=event.target.closest('[data-member]');if(!b)return;activeMember=b.dataset.member;displayLimit=12;updateMemberButtons();render();});
 updateMemberButtons();
}
initFilters();initRatingFilters();initMemberFilters();renderFavorites();render();
if('IntersectionObserver' in window){
 document.documentElement.classList.add('auto-load-ready');
 autoMoreObserver=new IntersectionObserver(items=>{if(items.some(item=>item.isIntersecting))queueAutoMore();},{rootMargin:'0px 0px 900px 0px'});
 autoMoreObserver.observe(document.querySelector('.load-more-wrap'));
 document.querySelector('#collection-viewport')?.addEventListener('scroll',queueAutoMore,{passive:true});
 document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('close',queueAutoMore));
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)queueAutoMore();});
}
document.querySelectorAll('[data-snapshot-date]').forEach(item=>item.textContent=ARCHIVE.snapshotDate);
if(document.querySelector('#archive-total'))document.querySelector('#archive-total').textContent=`${pad(entries.length)} OBJECTS / 02 COLLECTIONS`;
