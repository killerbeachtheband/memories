const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const source=fs.readFileSync(path.join(__dirname,'../archive.js'),'utf8');
const start=source.indexOf("document.querySelector('#detail-content').innerHTML=");
const statement=source.slice(start,source.indexOf('\n',start));
const renderDetail=(e,body)=>{
 const target={};
 const memberReview=source.slice(source.indexOf('function memberReviewMarkup'),source.indexOf('\n}',source.indexOf('function memberReviewMarkup'))+2);
 const context=vm.createContext({document:{querySelector:()=>target},e,facts:[],links:[],body,scoreContext:'',reviews:[e],ratingBarMarkup:()=>'',coverMarkup:()=>'',isFormative:()=>false,safeURL:u=>u,renderMarkdown:v=>`<p>${v}</p>`,detailSources:()=>({body}),ratingText:r=>typeof r.rating==='number'?`${r.rating} / 10`:'Not rated yet'});
 vm.runInContext(source.slice(source.indexOf('const escapeHTML'),source.indexOf('\n',source.indexOf('const jaLang')))+'\n'+memberReview+'\n'+statement,context);
 return target.innerHTML;
};
test('index.html has exactly one h1 reading Memories and keeps the skip link',()=>{
 const h1s=html.match(/<h1[^>]*>[\s\S]*?<\/h1>/g)||[];
 assert.equal(h1s.length,1);
 assert.match(h1s[0],/>Memories — Killer Beach</);
 assert.match(html,/<a href="#collection" class="skip">Skip to collection<\/a>/);
});
test('Japanese detail text is tagged lang="ja"',()=>{
 const out=renderDetail({title:'君の名は。',originalTitle:'Your Name',creator:'新海誠',tags:[],note:'夏の記憶',url:''},'本文です。');
 assert.match(out,/<h2 id="detail-title" class="jp" lang="ja">/);
 assert.match(out,/<p class="original-title">Your Name<\/p>/);
 assert.match(out,/<p class="detail-creator" lang="ja">/);
 assert.match(out,/<p class="detail-note" lang="ja">/);
 assert.match(out,/<div class="member-review-body" lang="ja">/);
 assert.match(out,/<section class="member-reviews">/);
});
test('English-only detail text gets no lang attribute',()=>{
 const out=renderDetail({title:'Blade Runner',originalTitle:'ブレードランナー',creator:'Ridley Scott',tags:[],note:'',url:''},'');
 assert.match(out,/<h2 id="detail-title" class="">Blade Runner<\/h2>/);
 assert.match(out,/<p class="original-title" lang="ja">/);
 assert.match(out,/<p class="detail-creator">Ridley Scott<\/p>/);
 assert.match(out,/<p class="detail-note note-empty">/);
 assert.match(out,/<section class="member-reviews">/);
 assert.equal((out.match(/lang="ja"/g)||[]).length,1);
});
