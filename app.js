import {initializeApp} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js';
import {getFirestore,collection,getDocs,doc,getDoc,setDoc,updateDoc,writeBatch,query,where,serverTimestamp} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
import {getAuth,RecaptchaVerifier,signInWithPhoneNumber,onAuthStateChanged,signOut} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';

const firebaseConfig={apiKey:'AIzaSyCw0GNrUYIvwPYY5LpCgnuFYi7a903qAuE',authDomain:'aldhfyantree-f3273.firebaseapp.com',projectId:'aldhfyantree-f3273',storageBucket:'aldhfyantree-f3273.firebasestorage.app',messagingSenderId:'436236972378',appId:'1:436236972378:web:e57101eeb8c3b41a2b8363'};
const app=initializeApp(firebaseConfig),db=getFirestore(app),auth=getAuth(app);
auth.languageCode='ar';
const ADMIN_PHONES=['+966552806075','+16505553434'];
let people=window.SEED_PEOPLE||[],remoteLoaded=false,currentPerson=null,userProfile=null,confirmation=null,zoom=1,radialState=null,selectedId=null,treeMode='radial',expandedIds=new Set();
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const ar=n=>Number(n).toLocaleString('ar-SA');
const norm=s=>(s||'').normalize('NFKD').replace(/[ًٌٍَُِّْـ]/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/عبد\s+/g,'عبد').trim().toLowerCase();
const isAdmin=()=>ADMIN_PHONES.includes(auth.currentUser?.phoneNumber);
const toast=m=>{const t=$('#toast');t.textContent=m;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2600)};
const byId=()=>new Map(people.map(p=>[p.id,p]));
const childrenMap=()=>{const m=new Map();people.forEach(p=>{if(!m.has(p.parent))m.set(p.parent,[]);m.get(p.parent).push(p)});return m};
function lineage(p){const map=byId(),names=[];let x=p;while(x){names.push(x.name);x=map.get(x.parent)}return names.join(' بن ')}
function generations(){const map=byId(),memo=new Map();function d(p){if(!p?.parent)return 1;if(memo.has(p.id))return memo.get(p.id);const v=1+d(map.get(p.parent));memo.set(p.id,v);return v}return Math.max(...people.map(d))}

async function loadPeople(){
  try{const snap=await getDocs(collection(db,'persons'));if(!snap.empty){people=snap.docs.map(x=>x.data());remoteLoaded=true;$('#dataStatus').textContent='متصل بالنسخة المعتمدة'}}catch(e){console.warn(e)}
  renderAll();
}
function renderAll(){
  $('#peopleCount').textContent=ar(people.length);$('#generationCount').textContent=ar(generations());
  const kids=childrenMap(),roots=kids.get('')||[];if(roots[0]&&!expandedIds.size)expandedIds.add(roots[0].id);renderTree();
  const root=roots[0],branches=root?(kids.get(root.id)||[]):[];$('#branchCount').textContent=ar(branches.length);
  $('#branches').innerHTML=branches.map((p,i)=>`<button class="branch-btn branch-${i+1}" data-branch="${p.id}"><span class="branch-dot"></span><b>${p.name}</b><small>${ar(countDesc(p.id,kids)+1)} شخصًا</small></button>`).join('');
}
function countDesc(id,kids){let n=0;(kids.get(id)||[]).forEach(c=>{n++;n+=countDesc(c.id,kids)});return n}
function esc(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function visibleTree(){
  const kids=childrenMap(),root=people.find(x=>!x.parent);if(!root)return {root:null,kids,nodes:[]};const nodes=[];
  const walk=(p,depth)=>{nodes.push({...p,depth});if(expandedIds.has(p.id))(kids.get(p.id)||[]).forEach(c=>walk(c,depth+1))};walk(root,0);return {root,kids,nodes};
}
function buildRadialData(){
  const {root,kids,nodes}=visibleTree();if(!root)return null;const angle=new Map([[root.id,0]]),branches=(kids.get(root.id)||[]).filter(b=>nodes.some(n=>n.id===b.id));
  function placeBranch(branch,index){const start=-Math.PI/2+index*(Math.PI*2/Math.max(1,branches.length))+.12,end=-Math.PI/2+(index+1)*(Math.PI*2/Math.max(1,branches.length))-.12;let leaves=[];
    const collect=p=>{const cs=expandedIds.has(p.id)?(kids.get(p.id)||[]).filter(c=>nodes.some(n=>n.id===c.id)):[];if(!cs.length)leaves.push(p);else cs.forEach(collect)};collect(branch);
    leaves.forEach((p,i)=>angle.set(p.id,start+(end-start)*(leaves.length===1?.5:i/(leaves.length-1))));
    const settle=p=>{const cs=expandedIds.has(p.id)?(kids.get(p.id)||[]).filter(c=>nodes.some(n=>n.id===c.id)):[];cs.forEach(settle);if(cs.length)angle.set(p.id,cs.reduce((n,c)=>n+angle.get(c.id),0)/cs.length)};settle(branch)
  }branches.forEach(placeBranch);const maxDepth=Math.max(1,...nodes.map(n=>n.depth)),step=Math.min(155,410/maxDepth);
  const placed=nodes.map(p=>{const r=p.depth*step,a=angle.get(p.id)||0;return {...p,x:500+Math.cos(a)*r,y:500+Math.sin(a)*r,a}});
  return {root,kids,nodes:placed,nodeMap:new Map(placed.map(n=>[n.id,n])),maxDepth};
}
function radialLink(a,b){const mx=(a.x+b.x)/2,my=(a.y+b.y)/2,dx=b.x-a.x,dy=b.y-a.y,bend=.16;return `M${a.x.toFixed(1)},${a.y.toFixed(1)} C${(mx-dy*bend).toFixed(1)},${(my+dx*bend).toFixed(1)} ${(mx-dy*bend).toFixed(1)},${(my+dx*bend).toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`}
function renderRadialTree(){
  radialState=buildRadialData();if(!radialState)return;const {root,nodes,nodeMap}=radialState;
  const links=nodes.filter(n=>n.parent&&nodeMap.has(n.parent)).map(n=>`<path class="family-link" data-link="${n.id}" d="${radialLink(nodeMap.get(n.parent),n)}"/>`).join('');
  const dots=nodes.map(n=>{const main=n.depth===1,rootNode=n.id===root.id,displayName=rootNode?'ضفي':n.name,hasKids=(radialState.kids.get(n.id)||[]).length,open=expandedIds.has(n.id);return `<g class="radial-person depth-${n.depth}${main?' main-branch':''}${rootNode?' root-person':''}${open?' is-open':''}" data-node="${n.id}" transform="translate(${n.x.toFixed(1)} ${n.y.toFixed(1)})"><circle class="node-halo" r="${rootNode?42:main?24:13}"/><circle class="node-dot" r="${rootNode?31:main?16:8}"/><text class="node-name" y="${rootNode?5:main?-27:-15}" text-anchor="middle">${esc(displayName)}</text>${hasKids?`<text class="node-toggle" y="${rootNode?55:main?35:25}" text-anchor="middle">${open?'−':'＋'}</text>`:''}${!rootNode?'<text class="node-more" data-menu="1" x="15" y="5">⋮</text>':''}</g>`}).join('');
  $('#tree').innerHTML=`<svg id="familySvg" viewBox="0 0 1000 1000" role="img"><defs><filter id="soft"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity=".14"/></filter></defs><g id="radialGraph"><g class="links-layer">${links}</g><g class="nodes-layer">${dots}</g></g></svg>`;
  zoom=1;updateRadialVisibility();bindRadialGestures();$('#zoomLabel').textContent='١٠٠٪';
}
function renderClassicTree(){
  const {root,kids}=visibleTree();if(!root)return;const node=p=>{const cs=expandedIds.has(p.id)?(kids.get(p.id)||[]):[],hasKids=(kids.get(p.id)||[]).length,open=expandedIds.has(p.id);return `<li class="classic-node"><div class="classic-card" data-node="${p.id}"><span class="classic-name">${p.id===root.id?'ضفي':esc(p.name)}</span>${hasKids?`<span class="classic-toggle">${open?'−':'＋'}</span>`:''}${p.id!==root.id?`<button class="classic-more" data-menu="1" aria-label="خيارات">⋮</button>`:''}</div>${cs.length?`<ul>${cs.map(node).join('')}</ul>`:''}</li>`};
  $('#tree').innerHTML=`<div class="classic-tree"><ul>${node(root)}</ul></div>`;$('#zoomLabel').textContent='١٠٠٪'
}
function renderTree(){treeMode==='radial'?renderRadialTree():renderClassicTree()}
function updateRadialVisibility(){const svg=$('#familySvg');if(!svg)return;svg.classList.toggle('zoom-mid',zoom>=1.45);svg.classList.toggle('zoom-full',zoom>=2.25)}
function ancestorIds(id){const map=byId(),ids=[];let p=map.get(id);while(p){ids.push(p.id);p=map.get(p.parent)}return ids}
function selectPerson(id,focus=false){selectedId=id;const path=new Set(ancestorIds(id));$$('.radial-person').forEach(n=>n.classList.toggle('selected',n.dataset.node===id));$$('.family-link').forEach(l=>l.classList.toggle('path-active',path.has(l.dataset.link)));$('#familySvg')?.classList.add('has-selection');const p=byId().get(id);$('#dataStatus').textContent=p?lineage(p):'الشجرة كاملة';if(focus)zoomToPerson(id)}
function zoomToPerson(id){const n=radialState?.nodeMap.get(id);if(!n)return;zoom=Math.max(zoom,2.15);const size=1000/zoom,x=Math.max(0,Math.min(1000-size,n.x-size/2)),y=Math.max(0,Math.min(1000-size,n.y-size/2));$('#familySvg').setAttribute('viewBox',`${x} ${y} ${size} ${size}`);updateRadialVisibility();$('#zoomLabel').textContent=`${ar(Math.round(zoom*100))}٪`}
function showPersonMenu(p,x,y){currentPerson=p;selectPerson(p.id);const m=$('#personMenu');$('#menuPersonName').textContent=p.name;m.style.left=`${Math.min(innerWidth-230,Math.max(12,x))}px`;m.style.top=`${Math.min(innerHeight-260,Math.max(82,y))}px`;m.classList.remove('hidden')}
$('#tree').onclick=e=>{const n=e.target.closest('[data-node]');if(!n)return;const p=byId().get(n.dataset.node);if(!p)return;if(e.target.closest('[data-menu]')){showPersonMenu(p,e.clientX,e.clientY);return}const hasKids=(childrenMap().get(p.id)||[]).length;if(hasKids){expandedIds.has(p.id)?expandedIds.delete(p.id):expandedIds.add(p.id);renderTree()}else selectPerson(p.id)};
function bindRadialGestures(){const svg=$('#familySvg');let drag=null;svg.onwheel=e=>{e.preventDefault();const box=svg.getBoundingClientRect(),vb=svg.viewBox.baseVal,f=e.deltaY<0?.84:1.19,nw=Math.max(220,Math.min(1000,vb.width*f)),px=(e.clientX-box.left)/box.width,py=(e.clientY-box.top)/box.height,nx=vb.x+(vb.width-nw)*px,ny=vb.y+(vb.height-nw)*py;svg.setAttribute('viewBox',`${nx} ${ny} ${nw} ${nw}`);zoom=1000/nw;updateRadialVisibility();$('#zoomLabel').textContent=`${ar(Math.round(zoom*100))}٪`};svg.onpointerdown=e=>{drag={x:e.clientX,y:e.clientY,vx:svg.viewBox.baseVal.x,vy:svg.viewBox.baseVal.y};svg.setPointerCapture(e.pointerId)};svg.onpointermove=e=>{if(!drag)return;const b=svg.getBoundingClientRect(),v=svg.viewBox.baseVal;svg.setAttribute('viewBox',`${drag.vx-(e.clientX-drag.x)*v.width/b.width} ${drag.vy-(e.clientY-drag.y)*v.height/b.height} ${v.width} ${v.height}`)};svg.onpointerup=svg.onpointercancel=()=>drag=null}
function openPerson(p){currentPerson=p;$('#profileInitial').textContent=p.name[0];$('#profileName').textContent=lineage(p);$('#profileLineage').textContent='سجل الشخص والمعلومات المعتمدة';
  const fields=[['الميلاد',p.birthDate],['الوفاة',p.deathDate],['المنصب أو العمل',p.position],['المدينة',p.city]].filter(x=>x[1]);$('#profileDetails').innerHTML=fields.length?fields.map(([k,v])=>`<div><dt>${k}</dt><dd>${v}</dd></div>`).join(''):'<p class="muted">لا توجد معلومات إضافية منشورة.</p>';
  const hasKids=people.some(x=>x.parent===p.id);$('#addChildBtn').classList.toggle('hidden',hasKids);$('#personDialog').showModal();
}
function switchView(name){$$('.view').forEach(v=>v.classList.toggle('active',v.id===`${name}View`));$$('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===name));if(name==='review')loadRequests()}
$$('[data-view]').forEach(b=>b.onclick=()=>switchView(b.dataset.view));$$('[data-close]').forEach(b=>b.onclick=()=>document.getElementById(b.dataset.close).close());
function resetTree(){const root=people.find(x=>!x.parent);expandedIds=new Set(root?[root.id]:[]);zoom=1;selectedId=null;$('#dataStatus').textContent='الفروع الرئيسية';renderTree()}
$('#rootBtn').onclick=resetTree;$('#rootBtnMobile').onclick=resetTree;
$('#expandAllBtn').onclick=()=>{const kids=childrenMap();expandedIds=new Set(people.filter(p=>(kids.get(p.id)||[]).length).map(p=>p.id));$('#dataStatus').textContent='الشجرة كاملة';renderTree()};
$('#expandAllTop').onclick=()=>$('#expandAllBtn').click();
$('#zoomIn').onclick=()=>buttonZoom(1.28);$('#zoomOut').onclick=()=>buttonZoom(.78);function buttonZoom(f){const svg=$('#familySvg');if(!svg)return;const v=svg.viewBox.baseVal,nw=Math.max(220,Math.min(1000,v.width/f)),x=v.x+(v.width-nw)/2,y=v.y+(v.height-nw)/2;svg.setAttribute('viewBox',`${x} ${y} ${nw} ${nw}`);zoom=1000/nw;updateRadialVisibility();$('#zoomLabel').textContent=`${ar(Math.round(zoom*100))}٪`}
$('#branches').onclick=e=>{const b=e.target.closest('[data-branch]');if(!b)return;expandedIds.add(b.dataset.branch);renderTree();if(treeMode==='radial')selectPerson(b.dataset.branch,true)};
$('#search').oninput=e=>{const q=norm(e.target.value),box=$('#searchResults');if(q.length<2){box.classList.add('hidden');return}const hits=people.filter(p=>norm(p.name).includes(q)||norm(lineage(p)).includes(q)).slice(0,30);box.innerHTML=hits.map(p=>`<div class="result" data-result="${p.id}"><b>${p.name}</b><small>${lineage(p)}</small></div>`).join('')||'<p class="empty">لا توجد نتائج.</p>';box.classList.remove('hidden')};
$('#searchResults').onclick=e=>{const r=e.target.closest('[data-result]');if(!r)return;ancestorIds(r.dataset.result).forEach(id=>expandedIds.add(id));renderTree();if(treeMode==='radial')selectPerson(r.dataset.result,true);else document.querySelector(`[data-node="${r.dataset.result}"]`)?.scrollIntoView({behavior:'smooth',block:'center'});$('#searchResults').classList.add('hidden');$('#search').value=''};

$$('[data-tree-mode]').forEach(b=>b.onclick=()=>{treeMode=b.dataset.treeMode;$$('[data-tree-mode]').forEach(x=>x.classList.toggle('active',x===b));renderTree()});

$('#closePersonMenu').onclick=()=>$('#personMenu').classList.add('hidden');
$('#copyLineageBtn').onclick=async()=>{await navigator.clipboard.writeText(lineage(currentPerson));$('#personMenu').classList.add('hidden');toast('تم نسخ الاسم الكامل')};
$('#suggestMenuBtn').onclick=()=>{$('#personMenu').classList.add('hidden');openRequest('update')};
$('#addChildMenuBtn').onclick=()=>{$('#personMenu').classList.add('hidden');openRequest('addChild')};
document.addEventListener('click',e=>{if(!e.target.closest('#personMenu')&&!e.target.closest('[data-node]'))$('#personMenu').classList.add('hidden')});

$('#loginBtn').onclick=()=>$('#loginDialog').showModal();
$('#accountBtn').onclick=()=>{$('#accountInfo').innerHTML=`${userProfile?.name||'مساهم'}<br><span dir="ltr">${auth.currentUser?.phoneNumber||''}</span>`;$('#accountDialog').showModal()};
$('#logoutBtn').onclick=async()=>{await signOut(auth);$('#accountDialog').close();toast('تم تسجيل الخروج')};
$('#phoneForm').onsubmit=async e=>{e.preventDefault();try{$('#authMessage').textContent='';if(!window.recaptchaVerifier)window.recaptchaVerifier=new RecaptchaVerifier(auth,'recaptcha',{size:'invisible'});confirmation=await signInWithPhoneNumber(auth,$('#phone').value.trim(),window.recaptchaVerifier);$('#phoneForm').classList.add('hidden');$('#codeForm').classList.remove('hidden')}catch(err){$('#authMessage').textContent='تعذر إرسال الرمز. تحقق من الرقم وإعدادات SMS.';window.recaptchaVerifier?.clear();window.recaptchaVerifier=null}};
$('#codeForm').onsubmit=async e=>{e.preventDefault();try{await confirmation.confirm($('#code').value);$('#loginDialog').close();$('#phoneForm').classList.remove('hidden');$('#codeForm').classList.add('hidden')}catch(err){$('#authMessage').textContent='الرمز غير صحيح.'}};
onAuthStateChanged(auth,async u=>{if(!u){userProfile=null;$('#loginBtn').classList.remove('hidden');$('#accountBtn').classList.add('hidden');$('#reviewBtn')?.classList.add('hidden');return}$('#loginBtn').classList.add('hidden');$('#accountBtn').classList.remove('hidden');$('#accountInitial').textContent='ع';
  const ps=await getDoc(doc(db,'profiles',u.uid));if(ps.exists())userProfile=ps.data();else if(!isAdmin()){$('#profileSetupDialog').showModal()}else userProfile={name:'مدير الشجرة',relation:'المدير'};
  $('#accountName').textContent=userProfile?.name||'حسابي';if(isAdmin()){$('#reviewBtn')?.classList.remove('hidden');$('#seedBtn').classList.toggle('hidden',remoteLoaded);await updatePendingBadge()}
});
$('#profileSetupForm').onsubmit=async e=>{e.preventDefault();userProfile={name:$('#contributorName').value.trim(),relation:$('#contributorRelation').value.trim(),phone:auth.currentUser.phoneNumber,createdAt:serverTimestamp()};await setDoc(doc(db,'profiles',auth.currentUser.uid),userProfile);$('#profileSetupDialog').close();$('#accountName').textContent=userProfile.name;toast('تم حفظ بياناتك')};

$('#suggestBtn').onclick=()=>openRequest('update');$('#addChildBtn').onclick=()=>openRequest('addChild');
function openRequest(type){if(!auth.currentUser){$('#personDialog').close();$('#loginDialog').showModal();return}$('#personDialog').close();$('#requestType').value=type;$('#requestPersonId').value=currentPerson.id;$('#requestTitle').textContent=type==='addChild'?`إضافة ابن لـ ${currentPerson.name}`:`اقتراح تعديل: ${currentPerson.name}`;$('#requestName').value=type==='addChild'?'':currentPerson.name;$('#metadataFields').classList.toggle('hidden',type==='addChild');$('#requestDialog').showModal()}
$('#requestForm').onsubmit=async e=>{e.preventDefault();const type=$('#requestType').value,proposed=type==='addChild'?{id:`N${Date.now().toString(36)}`,name:$('#requestName').value.trim(),parent:currentPerson.id,note:''}:{name:$('#requestName').value.trim(),birthDate:$('#birthDate').value,deathDate:$('#deathDate').value,position:$('#position').value.trim(),city:$('#city').value.trim(),note:$('#requestNote').value.trim()};
  await setDoc(doc(collection(db,'changeRequests')),{type,personId:currentPerson.id,personName:currentPerson.name,proposed,reason:$('#requestReason').value.trim(),submittedBy:auth.currentUser.uid,submittedPhone:auth.currentUser.phoneNumber,submittedName:userProfile?.name||'',submittedRelation:userProfile?.relation||'',status:'pending',createdAt:serverTimestamp()});$('#requestDialog').close();e.target.reset();toast('أُرسل الاقتراح للمراجعة')};

async function updatePendingBadge(){if(!isAdmin())return;const s=await getDocs(query(collection(db,'changeRequests'),where('status','==','pending')));$('#pendingBadge').textContent=ar(s.size)}
async function loadRequests(){if(!isAdmin())return;const s=await getDocs(query(collection(db,'changeRequests'),where('status','==','pending'))),list=$('#reviewList');if(s.empty){list.innerHTML='<p class="empty">لا توجد طلبات معلّقة.</p>';return}list.innerHTML=s.docs.map(x=>{const r=x.data();return `<article class="review-card" data-request="${x.id}"><header><div><b>${r.type==='addChild'?'إضافة ابن':'تعديل معلومات'} — ${r.personName}</b><small>${r.submittedName||'مساهم'} · <span dir="ltr">${r.submittedPhone}</span> · ${r.submittedRelation||''}</small></div></header><div class="diff">${Object.entries(r.proposed||{}).filter(([k])=>!['id','parent'].includes(k)).map(([k,v])=>`<b>${k}:</b> ${v||'—'}`).join('<br>')}<hr><b>المصدر:</b> ${r.reason}</div><button class="primary" data-approve>اعتماد</button> <button class="danger" data-reject>رفض</button></article>`}).join('')}
$('#reviewList').onclick=async e=>{const card=e.target.closest('[data-request]');if(!card)return;const ref=doc(db,'changeRequests',card.dataset.request),snap=await getDoc(ref),r=snap.data();if(e.target.matches('[data-approve]')){if(r.type==='addChild')await setDoc(doc(db,'persons',r.proposed.id),r.proposed);else await updateDoc(doc(db,'persons',r.personId),r.proposed);await updateDoc(ref,{status:'approved',reviewedAt:serverTimestamp(),reviewedBy:auth.currentUser.uid});toast('تم اعتماد التعديل')}else if(e.target.matches('[data-reject]')){await updateDoc(ref,{status:'rejected',reviewedAt:serverTimestamp(),reviewedBy:auth.currentUser.uid});toast('تم رفض الطلب')}else return;await loadPeople();await loadRequests();await updatePendingBadge()};
$('#seedBtn').onclick=async()=>{if(!isAdmin()||remoteLoaded)return;$('#seedBtn').disabled=true;$('#seedBtn').textContent='جارٍ الاستيراد…';for(let i=0;i<people.length;i+=400){const batch=writeBatch(db);people.slice(i,i+400).forEach(p=>batch.set(doc(db,'persons',p.id),{...p,birthDate:'',deathDate:'',position:'',city:''}));await batch.commit()}remoteLoaded=true;$('#seedBtn').classList.add('hidden');$('#dataStatus').textContent='متصل بالنسخة المعتمدة';toast(`تم استيراد ${ar(people.length)} شخصًا`)};

loadPeople();
if(new URLSearchParams(location.search).get('login')==='1')$('#loginDialog').showModal();
