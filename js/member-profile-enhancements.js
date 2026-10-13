(function TitaniaMemberProfileEnhancements(){
  'use strict';

  if(!/\/member\.html$/i.test(location.pathname))return;

  const ICON_BASE='./assets/images/job/';
  const ICON_MAP_URL=`${ICON_BASE}job-icons.json?v=20260906-1`;
  let iconMap={};

  function esc(v){return String(v==null?'':v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
  function fmtDateTime(v){const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleString(undefined,{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});}
  function fmtNum(v){const n=Number(v);return Number.isFinite(n)?Math.round(n).toLocaleString():'0';}

  function addStyle(){
    if(document.getElementById('member-profile-enhancements-style'))return;
    const style=document.createElement('style');
    style.id='member-profile-enhancements-style';
    style.textContent=`
      .member-info-class{display:inline-flex;align-items:center;gap:8px;font-weight:700}
      .member-info-class img{width:28px;height:28px;object-fit:contain;flex:none}
      .member-info-yes{color:var(--amber);font-weight:800}
      .member-info-no{color:var(--muted);font-weight:700}
      .member-import-value{font-weight:600}
      .member-title-metric{font-weight:700;color:var(--text)}
      .metric #trackingSince.member-import-value{font-size:23px!important;font-family:inherit!important}
      .class-history-panel{margin-top:14px}
      .class-history-table{width:100%;border-collapse:collapse}
      .class-history-table th,.class-history-table td{text-align:left;padding:10px 8px;border-bottom:1px solid var(--lineSoft);font-size:13px}
      .class-history-table th{color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.7px}
      .class-change-flow{display:inline-flex;align-items:center;gap:7px;vertical-align:middle}
      .class-change{display:inline-flex;align-items:center;gap:7px;font-weight:700;line-height:1.25}
      .class-change img{width:24px;height:24px;object-fit:contain;flex:none}
      .class-arrow{display:inline-flex;align-items:center;justify-content:center;align-self:center;color:var(--muted2);line-height:1;padding:0 2px;transform:translateY(-1px)}
    `;
    document.head.appendChild(style);
  }

  async function loadIconMap(){
    try{
      const res=await fetch(ICON_MAP_URL,{cache:'force-cache'});
      if(res.ok)iconMap=await res.json();
    }catch(_e){}
  }

  function classHtml(cls){
    const name=String(cls||'Unknown');
    const file=iconMap[name];
    return `<span class="member-info-class">${file?`<img src="${ICON_BASE}${esc(file)}" alt="${esc(name)} job icon">`:''}<span>${esc(name)}</span></span>`;
  }

  function classChangeHtml(cls){
    const name=String(cls||'Unknown');
    const file=iconMap[name];
    return `<span class="class-change">${file?`<img src="${ICON_BASE}${esc(file)}" alt="${esc(name)} job icon">`:''}<span>${esc(name)}</span></span>`;
  }

  function glPlacement(assignments,name){
    const entries=Object.entries(assignments||{});
    const found=entries.find(([key,slots])=>/^(main|sub)_\d+$/.test(key)&&Array.isArray(slots)&&slots.includes(name));
    if(!found)return null;
    const key=found[0];
    const n=Number(key.match(/(\d+)$/)?.[1]||0);
    let raid='—';
    if(key.startsWith('main_')) raid=`Raid ${Math.ceil(n/4)}`;
    else if([1,2,3,4,17].includes(n)) raid='Raid 1';
    else if([5,6,7,8,18].includes(n)) raid='Raid 2';
    else if(n>=9&&n<=12) raid='Raid 3';
    else if(n>=13&&n<=16) raid='Raid 4';
    return {teamKey:key,raid,party:`Party ${n}`};
  }

  function siegePlacement(state,name){
    const assignments=state.assignments||{};
    const found=Object.entries(assignments).find(([key,slots])=>/^siege_(main|sub)_\d+$/.test(key)&&Array.isArray(slots)&&slots.includes(name));
    if(!found)return null;
    const key=found[0];
    const n=Number(key.match(/(\d+)$/)?.[1]||0);
    let raid='—';
    const groups=state.siegeRaidGroups||{};
    const groupEntry=Object.entries(groups).find(([,keys])=>Array.isArray(keys)&&keys.includes(key));
    if(groupEntry){
      const groupKey=groupEntry[0];
      const idx=Number(groupKey.match(/(\d+)$/)?.[1]||0);
      raid=groupKey.startsWith('siege_sub_raid_')?`Raid ${idx+3}`:`Raid ${idx}`;
    }
    return {teamKey:key,raid,party:`Party ${n}`};
  }

  function infoRow(label,valueHtml){
    return `<div class="info-row"><div class="info-key">${esc(label)}</div><div class="info-value">${valueHtml}</div></div>`;
  }

  function renderMetricCards(csvData){
    const titleValue=document.getElementById('gainTotal');
    const contributionValue=document.getElementById('trackingSince');
    const imported=csvData||null;

    if(titleValue){
      const card=titleValue.closest('.metric');
      const heading=card&&card.querySelector('.card-head h2');
      const desc=card&&card.querySelector('.card-head p');
      if(heading)heading.innerHTML='<i class="fa-solid fa-award mr-2" aria-hidden="true"></i>Title';
      if(desc)desc.remove();
      titleValue.className='member-title-metric';
      titleValue.textContent=imported&&String(imported.title||'').trim()?String(imported.title).trim():'—';
    }

    if(contributionValue){
      const card=contributionValue.closest('.metric');
      const heading=card&&card.querySelector('.card-head h2');
      const desc=card&&card.querySelector('.card-head p');
      if(heading)heading.innerHTML='<i class="fa-solid fa-coins mr-2" aria-hidden="true"></i>Total Contribution';
      if(desc)desc.textContent='All-time contribution';
      contributionValue.className='member-import-value';
      contributionValue.textContent=imported?fmtNum(imported.total_contribution):'—';
    }
  }

  function renderInfo(member,state,stars,csvData){
    const wrap=document.getElementById('memberInfo');
    if(!wrap)return;
    const gl=glPlacement(state.assignments||{},member.name||'');
    const siege=siegePlacement(state,member.name||'');
    const starYes=Boolean(siege&&stars.has(siege.teamKey));
    const imported=csvData||null;

    wrap.innerHTML=[
      imported?infoRow('This Week Activity',`<span class="member-import-value">${esc(fmtNum(imported.weekly))}</span>`):'',
      imported?infoRow('Weekly Contribution',`<span class="member-import-value">${esc(fmtNum(imported.weekly_contribution))}</span>`):'',
      infoRow('Guild League',gl?`${esc(gl.raid)} · ${esc(gl.party)}`:'Not assigned'),
      infoRow('Siege',siege?`${esc(siege.raid)} · ${esc(siege.party)}`:'Not assigned'),
      infoRow('Star Dungeon',siege?`<span class="${starYes?'member-info-yes':'member-info-no'}">${starYes?'Yes ★':'No'}</span>`:'—'),
      infoRow('Last roster edit',member.updatedAt?esc(fmtDateTime(member.updatedAt)):'—'),
      infoRow('Updated by',esc(member.updatedBy||'—')),
      infoRow('Inactive since',member.inactiveSince?esc(new Date(member.inactiveSince).toLocaleDateString()):'—'),
      infoRow('Last returned',member.lastReturned?esc(new Date(member.lastReturned).toLocaleDateString()):'—'),
      infoRow('Notes',esc(member.notes||'—'))
    ].filter(Boolean).join('');
  }

  function ensureHistoryPanel(){
    let panel=document.getElementById('classHistoryPanel');
    if(panel)return panel;
    const grHistory=document.querySelector('.panel.history');
    if(!grHistory)return null;
    panel=document.createElement('section');
    panel.className='panel class-history-panel';
    panel.id='classHistoryPanel';
    panel.innerHTML='<h2>Class History</h2><div id="classHistoryWrap" class="muted">Loading class history…</div>';
    grHistory.parentNode.insertBefore(panel,grHistory);
    return panel;
  }

  function renderClassHistory(rows){
    const panel=ensureHistoryPanel();
    if(!panel)return;
    const wrap=panel.querySelector('#classHistoryWrap');
    if(!rows.length){
      wrap.className='muted';
      wrap.textContent='No class changes recorded yet. Class changes will be tracked automatically from now on.';
      return;
    }
    wrap.className='';
    wrap.innerHTML=`<table class="class-history-table"><thead><tr><th>Date</th><th>Change</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${esc(fmtDateTime(row.changed_at))}</td><td><span class="class-change-flow">${classChangeHtml(row.old_class)}<span class="class-arrow" aria-hidden="true">→</span>${classChangeHtml(row.new_class)}</span></td></tr>`).join('')}</tbody></table>`;
  }

  async function boot(){
    addStyle();
    await loadIconMap();
    const cfg=window.TITANIA_CONFIG||{};
    if(!window.supabase||!cfg.supabaseUrl||!cfg.supabasePublishableKey)return;
    const memberId=new URLSearchParams(location.search).get('id')||'';
    if(!memberId)return;
    const client=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});

    const [plannerRes,starsRes,classHistoryRes,csvDataRes]=await Promise.all([
      client.from('planner_state').select('state').eq('id',1).single(),
      client.from('party_star_selections').select('team_key').eq('event_key','siege'),
      client.from('class_history').select('old_class,new_class,changed_at').eq('member_id',memberId).order('changed_at',{ascending:false}),
      client.from('member_csv_data').select('title,weekly,weekly_contribution,total_contribution').eq('member_id',memberId).maybeSingle()
    ]);

    if(plannerRes.error)return;
    const state=plannerRes.data&&plannerRes.data.state||{};
    const roster=Array.isArray(state.roster)?state.roster:[];
    const member=roster.find(m=>String(m&&m.id||'')===memberId);
    if(!member)return;
    const stars=new Set((starsRes.data||[]).map(r=>String(r.team_key||'')));
    const csvData=csvDataRes.error?null:csvDataRes.data;

    const waitForBase=()=>{
      const wrap=document.getElementById('memberInfo');
      if(!wrap||document.getElementById('profile')?.style.display!=='block')return false;
      renderMetricCards(csvData);
      renderInfo(member,state,stars,csvData);
      renderClassHistory(classHistoryRes.error?[]:(classHistoryRes.data||[]));
      return true;
    };

    if(waitForBase())return;
    let tries=0;
    const timer=setInterval(()=>{
      tries+=1;
      if(waitForBase()||tries>=40)clearInterval(timer);
    },200);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
