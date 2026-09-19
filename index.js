(() => {
'use strict';

const MODULE='antique_wardrobe', META_KEY='antiqueWardrobeState', PROMPT_KEY='ANTIQUE_WARDROBE';
const DEFAULTS={enabled:true,endpoint:'',apiKey:'',model:'',temperature:.55,maxTokens:1800,freezeMessages:10,updateMode:'both',injectionPosition:0,injectionDepth:0,injectionRole:0,recentMessages:18,includeCharacterCard:true,includeUserPersona:true};
let initialized=false,lastChatLength=0,busy=false,panelOpen=false;

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const ctx=()=>SillyTavern.getContext();

function settings(){
 const {extensionSettings,saveSettingsDebounced}=ctx();
 extensionSettings[MODULE]??=structuredClone(DEFAULTS);
 for(const [k,v] of Object.entries(DEFAULTS)) if(!(k in extensionSettings[MODULE])) extensionSettings[MODULE][k]=v;
 saveSettingsDebounced(); return extensionSettings[MODULE];
}
function state(){
 const c=ctx(); c.chatMetadata[META_KEY]??={char:{outfit:'',continuity:'',locked:0,updatedAt:0},user:{outfit:'',continuity:'',locked:0,updatedAt:0},revision:0};
 const s=c.chatMetadata[META_KEY]; s.char??={outfit:'',continuity:'',locked:0,updatedAt:0}; s.user??={outfit:'',continuity:'',locked:0,updatedAt:0}; return s;
}
async function saveState(){const c=ctx(); if(typeof c.saveMetadata==='function') await c.saveMetadata(); else c.saveMetadataDebounced?.();}
function getChar(){const c=ctx(); return c.characterId==null?null:c.characters?.[c.characterId]??null;}
const getCharName=()=>getChar()?.name||ctx().name2||'CHAR';
const getUserName=()=>ctx().name1||'USER';
const clean=(v,n=5000)=>String(v??'').replace(/\r/g,'').trim().slice(0,n);

function characterCard(){
 const ch=getChar(); if(!ch)return '';
 return [`Name: ${ch.name||getCharName()}`,`Description:\n${clean(ch.description,7000)}`,`Personality:\n${clean(ch.personality,5000)}`,`Scenario:\n${clean(ch.scenario,5000)}`].join('\n\n');
}
function userPersona(){return clean(ctx().powerUserSettings?.persona_description,6000);}
function recentChat(limit){
 return (Array.isArray(ctx().chat)?ctx().chat:[]).slice(-limit).map(m=>{
  const n=m.name||(m.is_user?getUserName():getCharName()),t=clean(m.mes,2500); return t?`${n}: ${t}`:'';
 }).filter(Boolean).join('\n\n');
}
function parseJson(text){
 let s=String(text||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/i,'').trim();
 const a=s.indexOf('{'),b=s.lastIndexOf('}'); if(a>=0&&b>a)s=s.slice(a,b+1); return JSON.parse(s);
}
function endpoint(v){
 let u=String(v||'').trim().replace(/\/+$/,''); if(!u)throw Error('API endpoint is empty.');
 if(!/\/chat\/completions$/i.test(u))u+=/\/v1$/i.test(u)?'/chat/completions':'/v1/chat/completions'; return u;
}
function buildPrompt(mode){
 const s=settings(),st=state(),cn=getCharName(),un=getUserName();
 const targets=mode==='char'?['CHAR']:mode==='user'?['USER']:['CHAR','USER'];
 const targetText=targets.map(t=>`${t}:
Create a complete NEW outfit for ${t==='CHAR'?cn:un}.
${(t==='CHAR'?st.char:st.user).outfit?'Previous outfit for continuity only:\n'+(t==='CHAR'?st.char:st.user).outfit:'No previous wardrobe state.'}`).join('\n\n');
 return `You are the wardrobe continuity manager for a roleplay scene.

Produce ONLY precise wardrobe data. No prose, dialogue, emotions, anatomy, body descriptions, attractiveness judgments, or scene narration.
Generate a NEW practical outfit based on location, activity, weather, time and situation. Do not copy an avatar/reference image.

Describe enough detail for image generation: garment type and cut; exact colors; fabric and texture; layers; closures; collars/cuffs/hems/seams/pockets/hardware; patterns/graphics; footwear; accessories; outerwear; condition/state; continuity details; what must remain unchanged until the next manual update.
Do not use anatomy terms. Fit may describe the garment only (relaxed, tailored, oversized, etc.).

Return VALID JSON ONLY:
{"CHAR":{"outfit":"very detailed plain-text outfit description","continuity":"fixed visual continuity details"},"USER":{"outfit":"very detailed plain-text outfit description","continuity":"fixed visual continuity details"}}
For unrequested targets return empty strings.

TARGETS:
${targetText}

CHARACTER CARD:
${s.includeCharacterCard?characterCard():'[not included]'}

USER PERSONA:
${s.includeUserPersona?(userPersona()||'[no persona text available]'):'[not included]'}

RECENT SCENE:
${recentChat(Number(s.recentMessages)||18)}`;
}
async function callModel(mode){
 const s=settings(),u=endpoint(s.endpoint),headers={'Content-Type':'application/json'};
 if(s.apiKey.trim())headers.Authorization=`Bearer ${s.apiKey.trim()}`;
 const r=await fetch(u,{method:'POST',headers,body:JSON.stringify({model:s.model.trim(),messages:[
  {role:'system',content:'You are a strict wardrobe-state generator. Return valid JSON only.'},
  {role:'user',content:buildPrompt(mode)}
 ],temperature:Number(s.temperature)||.55,max_tokens:Number(s.maxTokens)||1800,stream:false})});
 const raw=await r.text(); if(!r.ok)throw Error(`HTTP ${r.status}: ${raw.slice(0,500)}`);
 let d; try{d=JSON.parse(raw)}catch{throw Error('The proxy returned non-JSON data.');}
 const content=d?.choices?.[0]?.message?.content??d?.choices?.[0]?.text??d?.content??'';
 if(!content)throw Error('The model returned an empty response.'); return parseJson(content);
}
function formatBlock(){
 const s=state(),cn=getCharName(),un=getUserName();
 const part=(tag,name,x)=>`<${tag}>
Name: ${name}
OUTFIT:
${x.outfit||'No wardrobe has been generated yet.'}
${x.outfit?`CONTINUITY:
${x.continuity||'Keep this outfit unchanged until the wardrobe is manually updated.'}
LOCK:
${x.locked>0?`${x.locked} messages remaining.`:'Ready for manual wardrobe update.'}`:''}
</${tag}>`;
 return `<wardrobe>\n${part('CHAR',cn,s.char)}\n\n${part('USER',un,s.user)}\n</wardrobe>`;
}
async function setPrompt(text){
 const c=ctx(),s=settings();
 if(typeof c.setExtensionPrompt==='function'){c.setExtensionPrompt(PROMPT_KEY,text,Number(s.injectionPosition),Number(s.injectionDepth),false,Number(s.injectionRole));return;}
 try{const m=await import('/script.js');m.setExtensionPrompt?.(PROMPT_KEY,text,Number(s.injectionPosition),Number(s.injectionDepth),false,Number(s.injectionRole));}catch(e){console.warn('[Antique Wardrobe] setExtensionPrompt unavailable',e);}
}
const refreshPrompt=()=>setPrompt(formatBlock());

async function update(mode=settings().updateMode){
 if(busy)return; const s=settings();
 if(!s.endpoint.trim()){toastr.error('Укажи API endpoint в настройках Antique Wardrobe.');openPanel();return;}
 if(!s.model.trim()){toastr.error('Укажи модель в настройках Antique Wardrobe.');openPanel();return;}
 busy=true;render();
 try{
  const result=await callModel(mode),st=state(),freeze=Math.max(0,Number(s.freezeMessages)||0),now=Date.now();
  if((mode==='char'||mode==='both')&&result.CHAR?.outfit){st.char.outfit=clean(result.CHAR.outfit,12000);st.char.continuity=clean(result.CHAR.continuity,3000);st.char.locked=freeze;st.char.updatedAt=now;}
  if((mode==='user'||mode==='both')&&result.USER?.outfit){st.user.outfit=clean(result.USER.outfit,12000);st.user.continuity=clean(result.USER.continuity,3000);st.user.locked=freeze;st.user.updatedAt=now;}
  st.revision=Number(st.revision||0)+1; await saveState(); await refreshPrompt(); toastr.success('Гардероб обновлён и заморожен.');
 }catch(e){console.error('[Antique Wardrobe]',e);toastr.error(e.message||String(e),'Antique Wardrobe');}
 finally{busy=false;render();}
}
async function decrementLocks(){
 const st=state();let changed=false;
 for(const k of ['char','user'])if(st[k].locked>0){st[k].locked=Math.max(0,st[k].locked-1);changed=true;}
 if(changed){await saveState();await refreshPrompt();render();}
}
function onNewMessage(){const n=Array.isArray(ctx().chat)?ctx().chat.length:0;if(n<=lastChatLength)return;lastChatLength=n;void decrementLocks();}
const badge=()=>{const s=state();if(busy)return'…';if(!s.char.outfit&&!s.user.outfit)return'NEW';if(s.char.locked===s.user.locked)return String(s.char.locked);return`${s.char.locked}/${s.user.locked}`;};
function openPanel(){panelOpen=true;render()} function closePanel(){panelOpen=false;render()}

function render(){
 const host=document.getElementById('antique-wardrobe-root');if(!host)return;const st=state(),s=settings();
 host.innerHTML=`<button class="aw-fab" id="aw-fab"><span class="aw-fab-ornament">✦</span><span class="aw-fab-label">WARDROBE</span><span class="aw-badge">${esc(badge())}</span></button>
 <section class="aw-panel ${panelOpen?'is-open':''}">
 <div class="aw-panel-head"><div><div class="aw-kicker">PRIVATE DRESSING ROOM</div><h2>Antique Wardrobe</h2></div><button class="aw-close" id="aw-close">×</button></div>
 <div class="aw-lock-grid"><div class="aw-lock-card"><span>CHAR</span><strong>${st.char.locked>0?'🔒 '+st.char.locked:'✦ READY'}</strong></div><div class="aw-lock-card"><span>USER</span><strong>${st.user.locked>0?'🔒 '+st.user.locked:'✦ READY'}</strong></div></div>
 <div class="aw-divider"><span>✦</span></div><label class="aw-label">UPDATE</label>
 <div class="aw-actions"><button class="aw-action" data-mode="both">✦ BOTH</button><button class="aw-action" data-mode="char">CHAR</button><button class="aw-action" data-mode="user">USER</button></div>
 <div class="aw-current"><div class="aw-current-title">CURRENT STATE</div><div class="aw-current-row"><b>${esc(getCharName())}</b><span>${st.char.outfit?'Outfit stored':'No outfit yet'}</span></div><div class="aw-current-row"><b>${esc(getUserName())}</b><span>${st.user.outfit?'Outfit stored':'No outfit yet'}</span></div></div>
 <details class="aw-settings"><summary>Wardrobe room settings</summary><div class="aw-settings-body">
 <label>Freeze after update <input id="aw-freeze" type="number" min="0" max="999" value="${esc(s.freezeMessages)}"></label>
 <label>API endpoint <input id="aw-endpoint" type="text" placeholder="https://your-proxy.example/v1/chat/completions" value="${esc(s.endpoint)}"></label>
 <label>API key <input id="aw-key" type="password" placeholder="optional" value="${esc(s.apiKey)}"></label>
 <label>Model <input id="aw-model" type="text" placeholder="your-model-name" value="${esc(s.model)}"></label>
 <label>Temperature <input id="aw-temp" type="number" min="0" max="2" step=".05" value="${esc(s.temperature)}"></label>
 <label>Max tokens <input id="aw-max" type="number" min="256" max="16000" value="${esc(s.maxTokens)}"></label>
 <label>Recent scene messages <input id="aw-recent" type="number" min="4" max="100" value="${esc(s.recentMessages)}"></label>
 <label>Injection depth <input id="aw-depth" type="number" min="0" max="999" value="${esc(s.injectionDepth)}"></label>
 <button class="aw-save" id="aw-save">SAVE SETTINGS</button></div></details>
 <div class="aw-foot"><span>Separate &lt;wardrobe&gt; info block</span><span>Revision ${Number(st.revision||0)}</span></div></section>`;
 host.querySelector('#aw-fab')?.addEventListener('click',()=>panelOpen?closePanel():openPanel());
 host.querySelector('#aw-close')?.addEventListener('click',closePanel);
 host.querySelectorAll('.aw-action').forEach(b=>b.addEventListener('click',()=>update(b.dataset.mode)));
 host.querySelector('#aw-save')?.addEventListener('click',()=>{const x=settings();x.freezeMessages=Number(host.querySelector('#aw-freeze').value)||0;x.endpoint=host.querySelector('#aw-endpoint').value.trim();x.apiKey=host.querySelector('#aw-key').value;x.model=host.querySelector('#aw-model').value.trim();x.temperature=Number(host.querySelector('#aw-temp').value)||.55;x.maxTokens=Number(host.querySelector('#aw-max').value)||1800;x.recentMessages=Number(host.querySelector('#aw-recent').value)||18;x.injectionDepth=Number(host.querySelector('#aw-depth').value)||0;ctx().saveSettingsDebounced();toastr.success('Настройки сохранены.');void refreshPrompt();render();});
}
async function init(){
 if(initialized)return;initialized=true;settings();
 const root=document.createElement('div');root.id='antique-wardrobe-root';document.body.appendChild(root);
 const c=ctx();lastChatLength=Array.isArray(c.chat)?c.chat.length:0;const e=c.eventTypes||c.event_types||{};
 c.eventSource?.on(e.MESSAGE_SENT||'MESSAGE_SENT',onNewMessage);c.eventSource?.on(e.MESSAGE_RECEIVED||'MESSAGE_RECEIVED',onNewMessage);
 c.eventSource?.on(e.CHAT_CHANGED||'CHAT_CHANGED',async()=>{lastChatLength=Array.isArray(ctx().chat)?ctx().chat.length:0;await refreshPrompt();render();});
 await refreshPrompt();render();
}
window.AntiqueWardrobe={update,openPanel,closePanel};
jQuery(()=>{if(window.SillyTavern?.getContext)init().catch(console.error);});
})();