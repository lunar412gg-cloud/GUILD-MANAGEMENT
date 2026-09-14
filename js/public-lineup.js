'use strict';

const VIEW = document.body.dataset.view || 'guild';
const TEAM_SIZE = 5;

const MAIN_RAIDS = [
  {id:'raid_1',label:'Raid 1',keys:['main_1','main_2','main_3','main_4']},
  {id:'raid_2',label:'Raid 2',keys:['main_5','main_6','main_7','main_8']},
  {id:'raid_3',label:'Raid 3',keys:['main_9','main_10','main_11','main_12']}
];
const SUB_RAIDS = [
  {id:'sub_raid_1',label:'Raid 1',keys:['sub_1','sub_2','sub_3','sub_4']},
  {id:'sub_raid_2',label:'Raid 2',keys:['sub_5','sub_6','sub_7','sub_8']},
  {id:'sub_raid_3',label:'Raid 3',keys:['sub_9','sub_10','sub_11','sub_12']},
  {id:'sub_raid_4',label:'Raid 4',keys:['sub_13','sub_14','sub_15','sub_16']},
  {id:'sub_raid_5',label:'Raid 5',keys:['sub_17','sub_18']}
];
const STAR_RAIDS = [
  {id:'pz_star_1',label:'Raid Team',keys:['elite_1','elite_2','elite_3','elite_4','elite_5']},
  {id:'pz_star_2',label:'Raid Team',keys:['elite_6','elite_7','elite_8','elite_9','elite_10']}
];
const DUNGEONS = Array.from({length:5},(_,i)=>({
  id:`pz_dungeon_${i+1}`,
  dungeon:i+1,
  label:`Normal Dungeon ${i+1}`,
  keys:Array.from({length:8},(_,j)=>`dungeon${i+1}_${j+1}`)
}));
const HEALERS = new Set(['Acolyte','Priest','High Priest']);
const CLASS_COLORS = {
  Swordman:'#e2776b',Knight:'#e2776b','Lord Knight':'#e2776b',Crusader:'#e2776b',Paladin:'#e2776b',
  Mage:'#579ed3',Wizard:'#579ed3','High Wizard':'#579ed3',Archer:'#e2aa50',Hunter:'#e2aa50',Sniper:'#e2aa50',
  Bard:'#e2aa50',Clown:'#e2aa50',Dancer:'#e2aa50',Gypsy:'#e2aa50',Acolyte:'#78bd5b',Priest:'#78bd5b','High Priest':'#78bd5b',Monk:'#78bd5b',Champion:'#78bd5b',
  Thief:'#a579f2',Assassin:'#a579f2','Assassin Cross':'#a579f2',Merchant:'#df9056',Blacksmith:'#df9056',Whitesmith:'#df9056',Alchemist:'#df9056',Creator:'#df9056',
  Gunslinger:'#b27d69',Rebel:'#b27d69','Night Watch':'#b27d69',Druid:'#32947e',Kanos:'#32947e',Alithea:'#32947e',Unknown:'#8b93b0'
};

let client = null;
let state = null;
let members = new Map();

document.addEventListener('DOMContentLoaded',()=>{
  setupTheme();
  const refresh = document.getElementById('refreshBtn');
  if(refresh) refresh.addEventListener('click',loadLineup);
  loadLineup();
  setInterval(loadLineup,60000);
});

function setupTheme(){
  let theme='';
  try{theme=localStorage.getItem('titania_public_theme')||'';}catch(_e){}
  if(!theme) theme=window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';
  applyTheme(theme);
  const btn=document.getElementById('themeBtn');
  if(btn) btn.addEventListener('click',()=>applyTheme(document.documentElement.dataset.theme==='light'?'dark':'light'));
}

function applyTheme(theme){
  document.documentElement.dataset.theme=theme;
  const btn=document.getElementById('themeBtn');
  if(btn) btn.innerHTML=theme==='light'?'<span class="theme-icon">☾</span> Dark':'<span class="theme-icon">☀</span> Light';
  try{localStorage.setItem('titania_public_theme',theme);}catch(_e){}
}

async function loadLineup(){
  const content=document.getElementById('content');
  if(!content) return;
  if(!state) content.innerHTML='<div class="loading"><div class="spinner"></div>Loading lineup…</div>';
  try{
    const cfg=window.TITANIA_CONFIG||{};
    const url=cfg.supabaseUrl||cfg.SUPABASE_URL;
    const key=cfg.supabasePublishableKey||cfg.SUPABASE_PUBLISHABLE_KEY;
    if(!url||!key) throw new Error('Supabase configuration is missing.');
    if(!window.supabase) throw new Error('Supabase library did not load.');
    if(!client) client=window.supabase.createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
    const {data,error}=await client.rpc('get_public_lineup');
    if(error) throw error;
    state=normalize(data||{});
    members=new Map(state.roster.map(m=>[m.name,m]));
    render();
  }catch(err){
    content.innerHTML=`<div class="error-box"><b>Could not load lineup</b>${esc(err&&err.message?err.message:String(err))}<br><br><span class="error-note">Make sure <code>public_view_setup.sql</code> has been run in Supabase.</span></div>`;
  }
}

function normalize(raw){
  const roster=Array.isArray(raw.roster)
    ? raw.roster.map(m=>({name:str(m.name),cls:str(m.cls)||'Unknown'})).filter(m=>m.name)
    : [];
  const assignments=raw.assignments&&typeof raw.assignments==='object'?raw.assignments:{};
  return {
    roster,
    assignments,
    raidLeaders:raw.raidLeaders||{},
    raidModes:raw.raidModes||{},
    finishedDungeons:Array.isArray(raw.finishedDungeons)?raw.finishedDungeons.map(Number):[],
    revision:num(raw.revision),
    updatedAt:str(raw.updatedAt)
  };
}

function render(){
  const content=document.getElementById('content');
  if(!content) return;
  const title=VIEW==='guild'?'Guild League':'Polarity Zone';
  document.title=`Titania · ${title}`;
  const updated=state.updatedAt?formatDateTime(state.updatedAt):'Live';
  content.innerHTML=`<section class="lineup-sheet">
    <div class="sheet-head">
      <div class="sheet-brand">${esc(title)}</div>
      <div class="sheet-meta">Dark Lord Server<br>Updated ${esc(updated)}</div>
    </div>
    ${VIEW==='guild'?renderGuild():renderPolarity()}
  </section>`;
}

function renderGuild(){
  return section('⚔ Main Battlefield','main')+
    MAIN_RAIDS.map(r=>raidBlock(r,'main',false)).join('')+
    section('◈ Sub Battlefield','sub')+
    SUB_RAIDS.map(r=>raidBlock(r,'sub',false)).join('');
}

function renderPolarity(){
  let html=section('★ Star Dungeon','star');
  html+=STAR_RAIDS.map(r=>raidBlock(r,'star',true)).join('');
  DUNGEONS.forEach(d=>{
    const leader=str(state.raidLeaders[d.id])||'Not assigned';
    const finished=state.finishedDungeons.includes(d.dungeon);
    html+=`<div class="raid-block dungeon-block">
      <div class="raid-head">
        <div class="raid-name">NORMAL DUNGEON ${d.dungeon} · TEAM <b>${esc(leader)}</b></div>
        ${finished?'<span class="finished">✓ Run Finished</span>':''}
        <div class="raid-line"></div>
      </div>
      <div class="team-grid">${d.keys.map((k,i)=>teamCard(k,'normal',`Team ${i+1}`)).join('')}</div>
    </div>`;
  });
  return html;
}

function raidBlock(raid,kind,five){
  const leader=str(state.raidLeaders[raid.id])||'Not assigned';
  const mode=MAIN_RAIDS.some(r=>r.id===raid.id)?(str(state.raidModes[raid.id]).toUpperCase()==='DEF'?'DEF':'ATK'):'';
  const raidTitle=kind==='star'?`RAID TEAM — <b>${esc(leader)}</b>`:`${esc(raid.label.toUpperCase())} · TEAM <b>${esc(leader)}</b>`;
  return `<div class="raid-block">
    <div class="raid-head">
      <div class="raid-name">${raidTitle}</div>
      ${mode?`<span class="mode ${mode.toLowerCase()}">${mode==='DEF'?'🛡':'⚔'} ${mode}</span>`:''}
      <div class="raid-line"></div>
    </div>
    <div class="team-grid ${five?'five':''}">${raid.keys.map(k=>teamCard(k,kind)).join('')}</div>
  </div>`;
}

function teamCard(key,kind,label){
  const s=slots(key);
  const filled=s.filter(Boolean).length;
  const noHealer=teamNoHealer(key);
  return `<article class="team-card ${kind}">
    <div class="team-head"><div class="team-name">${esc(label||teamLabel(key))}</div><div class="team-count">${filled}/${TEAM_SIZE}</div></div>
    ${s.map((name,i)=>slotHtml(name,i)).join('')}
    ${noHealer?'<div class="no-healer">⚠ No healer</div>':''}
  </article>`;
}

function slotHtml(name,index){
  if(!name){
    return `<div class="slot ${index===0?'leader-slot':''}"><span class="crown">${index===0?'♛':''}</span><span class="empty">${index===0?'Empty team leader':'Empty slot'}</span></div>`;
  }
  const m=members.get(name)||{name,cls:'Unknown'};
  const c=CLASS_COLORS[m.cls]||CLASS_COLORS.Unknown;
  return `<div class="slot ${index===0?'leader-slot':''}">
    <span class="${index===0?'crown':'dot'}" style="${index===0?'':'background:'+c+';color:'+c}">${index===0?'♛':''}</span>
    <div class="member"><div class="member-name">${esc(name)}</div></div>
    <span class="job-class" style="color:${c}">${esc(m.cls)}</span>
  </div>`;
}

function section(title,kind){
  return `<div class="section-head"><div class="section-title ${kind}">${title}</div><div class="section-line"></div></div>`;
}

function slots(key){
  const a=Array.isArray(state.assignments[key])?state.assignments[key].slice(0,TEAM_SIZE):[];
  while(a.length<TEAM_SIZE)a.push(null);
  return a.map(v=>str(v)||null);
}

function teamNoHealer(key){
  const names=slots(key).filter(Boolean);
  return names.length>0&&!names.some(n=>HEALERS.has((members.get(n)||{}).cls));
}

function teamLabel(key){
  const m=/_([0-9]+)$/.exec(key);
  return `Team ${m?m[1]:'?'}`;
}

function formatDateTime(v){
  const d=new Date(v);
  return Number.isNaN(d.getTime())?'':d.toLocaleString(undefined,{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
}
function str(v){return v==null?'':String(v);}
function num(v){const n=Number(v);return Number.isFinite(n)?n:0;}
function esc(v){return str(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
