/* Reusable 5-member Party Pool for Guild League and Siege. */
(function TitaniaPartyPool(){
  'use strict';
  if(!(/\/$|\/index\.html$/i.test(location.pathname)))return;

  let parties=[];
  let loaded=false;
  let loading=false;
  let activePool='members';
  let iconMap={};
  let iconMapPromise=null;

  function canUsePools(){
    return document.body.dataset.event==='guild_league'||document.body.dataset.event==='siege';
  }

  function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function hasPartyDrag(event){return Boolean(event.dataTransfer&&Array.from(event.dataTransfer.types||[]).includes('application/x-titania-party'));}

  function ensureStyle(){
    if(document.getElementById('titania-party-pool-style'))return;
    const style=document.createElement('style');
    style.id='titania-party-pool-style';
    style.textContent=`
      /* Keep legacy Add in DOM because core planner wires it during startup. */
      #addMemberBtn{display:none!important}
      .pool-tabs{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:10px;padding:3px;background:var(--panel-2);border:1px solid var(--line-soft);border-radius:9px}
      .pool-tab{border:0;background:transparent;color:var(--muted);border-radius:7px;padding:7px 8px;font:600 12px 'IBM Plex Sans',Arial,sans-serif;cursor:pointer}
      .pool-tab.active{background:var(--panel);color:var(--text)}
      .party-pool-tools{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:9px}
      .party-pool-title{font-size:11px;color:var(--muted-2);text-transform:uppercase;letter-spacing:.8px;font-weight:700}
      .party-manage-link{font-size:11.5px!important;padding:6px 8px!important;text-decoration:none}
      .party-pool-list{flex:1;overflow-y:auto;padding:10px 12px 100px}
      .party-pool-list::-webkit-scrollbar{width:8px}.party-pool-list::-webkit-scrollbar-thumb{background:#242c47;border-radius:8px}
      .party-pool-card{background:var(--panel);border:1px solid var(--line-soft);border-radius:10px;margin-bottom:8px;padding:10px;cursor:grab;transition:.12s ease}
      .party-pool-card:hover{border-color:var(--violet);transform:translateX(2px)}
      .party-pool-card.incomplete{cursor:default;opacity:.62}.party-pool-card.incomplete:hover{transform:none;border-color:var(--line-soft)}
      .party-pool-card.dragging{opacity:.35}
      .party-pool-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:7px}
      .party-pool-head b{font-size:13px}.party-pool-count{font:600 11px 'IBM Plex Mono',monospace;color:var(--muted)}
      .party-pool-members{display:grid;gap:5px}
      .party-pool-member{display:flex;align-items:center;gap:8px;min-width:0;font-size:12px;color:var(--text)}
      .party-pool-job-icon{width:20px;height:20px;object-fit:contain;flex:none;display:block}
      .party-pool-member-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .party-pool-empty{padding:24px 8px;text-align:center;color:var(--muted);font-size:12px;line-height:1.6}
      .party-drop-ready{outline:2px solid var(--teal)!important;outline-offset:2px}
      @media(max-width:720px){.pool-tabs{margin-top:2px}.party-pool-list{max-height:320px;padding-bottom:20px}}
    `;
    document.head.appendChild(style);
  }

  function memberFromId(id){
    try{return memberById&&memberById[id]?memberById[id]:null;}catch(_e){return null;}
  }

  function activeMember(member){
    if(!member)return false;
    try{return typeof isActiveMember==='function'?isActiveMember(member):member.status!=='inactive';}catch(_e){return member.status!=='inactive';}
  }

  function iconFor(member){
    const file=member&&iconMap[member.cls];
    return file?`./assets/images/job/${encodeURIComponent(file)}`:'';
  }

  function loadIcons(){
    if(iconMapPromise)return iconMapPromise;
    iconMapPromise=fetch('./assets/images/job/job-icons.json?v=20260905-2',{cache:'force-cache'})
      .then(response=>response.ok?response.json():{})
      .then(data=>{iconMap=data||{};})
      .catch(error=>console.warn('[Titania] Could not load Party Pool job icons:',error));
    return iconMapPromise;
  }

  async function loadParties(force){
    if(loading||(!force&&loaded))return;
    let client;
    try{client=supabaseClient;}catch(_e){return;}
    if(!client)return;
    loading=true;
    const [result]=await Promise.all([
      client.from('party_templates').select('party_no,member_ids,updated_at').order('party_no',{ascending:true}),
      loadIcons()
    ]);
    loading=false;
    if(result.error){console.warn('Party Pool load failed',result.error);return;}
    parties=result.data||[];
    loaded=true;
    renderPartyPool();
  }

  function renderPartyPool(){
    const list=document.getElementById('partyPoolList');
    if(!list)return;
    const saved=parties.filter(p=>(p.member_ids||[]).length);
    if(!saved.length){
      list.innerHTML='<div class="party-pool-empty">No saved parties yet.<br>Open <b>Manage Parties</b> to build your 30 reference parties.</div>';
      return;
    }

    list.innerHTML=saved.map(party=>{
      const members=(party.member_ids||[]).map(memberFromId).filter(Boolean);
      const full=party.member_ids.length===5&&members.length===5&&members.every(activeMember)&&new Set(party.member_ids).size===5;
      const rows=(party.member_ids||[]).map(id=>{
        const member=memberFromId(id);
        const src=iconFor(member);
        return `<div class="party-pool-member">${src?`<img class="party-pool-job-icon" src="${esc(src)}" alt="" title="${esc(member.cls||'')}">`:''}<span class="party-pool-member-name">${esc(member?member.name:'Member unavailable')}</span></div>`;
      }).join('');
      return `<article class="party-pool-card${full?'':' incomplete'}" data-party-no="${party.party_no}" draggable="${full?'true':'false'}" title="${full?'Drag this party onto a Guild League or Siege party card':'Party must contain 5 active members before it can be dragged'}"><div class="party-pool-head"><b>Party ${party.party_no}</b><span class="party-pool-count">${members.length}/5</span></div><div class="party-pool-members">${rows}</div></article>`;
    }).join('');

    list.querySelectorAll('.party-pool-card[draggable="true"]').forEach(card=>{
      card.addEventListener('dragstart',event=>{
        const party=parties.find(item=>String(item.party_no)===card.dataset.partyNo);
        if(!party||!event.dataTransfer)return;
        card.classList.add('dragging');
        event.dataTransfer.effectAllowed='copy';
        event.dataTransfer.setData('application/x-titania-party',JSON.stringify({partyNo:party.party_no,memberIds:party.member_ids}));
      });
      card.addEventListener('dragend',()=>card.classList.remove('dragging'));
    });
  }

  function ensureSidebar(){
    const sidebar=document.getElementById('sidebar');
    const head=sidebar&&sidebar.querySelector('.sidebar-head');
    const memberList=document.getElementById('memberList');
    if(!sidebar||!head||!memberList)return false;

    let tabs=head.querySelector('.pool-tabs');
    if(!tabs){
      tabs=document.createElement('div');
      tabs.className='pool-tabs';
      tabs.innerHTML='<button type="button" class="pool-tab active" data-pool="members"><i class="fa-solid fa-users mr-2" aria-hidden="true"></i>Member Pool</button><button type="button" class="pool-tab" data-pool="parties"><i class="fa-solid fa-people-group mr-2" aria-hidden="true"></i>Party Pool</button>';
      head.prepend(tabs);
      tabs.addEventListener('click',event=>{
        const button=event.target.closest('[data-pool]');
        if(!button)return;
        activePool=button.dataset.pool;
        applyPoolView();
      });
    }

    if(!document.getElementById('partyPoolList')){
      const list=document.createElement('div');
      list.id='partyPoolList';
      list.className='party-pool-list';
      list.hidden=true;
      memberList.insertAdjacentElement('afterend',list);
    }

    if(!head.querySelector('.party-pool-tools')){
      const tools=document.createElement('div');
      tools.className='party-pool-tools';
      tools.hidden=true;
      tools.innerHTML='<span class="party-pool-title">Saved reference parties</span><a class="btn small party-manage-link" href="./parties.html"><i class="fa-solid fa-pen-to-square mr-2" aria-hidden="true"></i>Manage Parties</a>';
      tabs.insertAdjacentElement('afterend',tools);
    }

    applyPoolView();
    return true;
  }

  function applyPoolView(){
    const sidebar=document.getElementById('sidebar');
    if(!sidebar)return;
    const head=sidebar.querySelector('.sidebar-head');
    const tabs=head&&head.querySelector('.pool-tabs');
    const memberList=document.getElementById('memberList');
    const partyList=document.getElementById('partyPoolList');
    const classBreakdown=document.getElementById('classBreakdown');
    const search=head&&head.querySelector('.search-box');
    const filters=head&&head.querySelector('#filterRow');
    const classSelect=head&&head.querySelector('.class-select');
    const sortRow=head&&head.querySelector('.sort-row');
    const tools=head&&head.querySelector('.party-pool-tools');
    const title=head&&head.querySelector('.sidebar-title-row h2');
    const enabled=canUsePools();

    if(!enabled)activePool='members';
    const partiesActive=enabled&&activePool==='parties';
    if(tabs)tabs.hidden=!enabled;
    if(memberList)memberList.hidden=partiesActive;
    if(partyList)partyList.hidden=!partiesActive;
    if(classBreakdown)classBreakdown.hidden=partiesActive;
    if(search)search.hidden=partiesActive;
    if(filters)filters.hidden=partiesActive;
    if(classSelect)classSelect.hidden=partiesActive;
    if(sortRow)sortRow.hidden=partiesActive;
    if(tools)tools.hidden=!partiesActive;
    if(title){
      const wanted=partiesActive?'Party Pool':'Member Pool';
      if(title.textContent!==wanted)title.textContent=wanted;
    }
    if(tabs)tabs.querySelectorAll('[data-pool]').forEach(button=>button.classList.toggle('active',button.dataset.pool===activePool));
    if(partiesActive)loadParties(false);
  }

  function fillTeamFromParty(team,payload){
    if(!payload||!Array.isArray(payload.memberIds)||payload.memberIds.length!==5)return;
    let members;
    try{members=payload.memberIds.map(id=>memberById[id]).filter(Boolean);}catch(_e){return;}
    if(members.length!==5||members.some(member=>!activeMember(member))||new Set(members.map(member=>member.id)).size!==5){
      try{showToast('Party unavailable','All 5 saved party members must still be active.','warn');}catch(_e){}
      return;
    }
    try{
      if(!TEAM_KEY_SET.has(team))return;
      const names=members.map(member=>member.name);
      names.forEach(name=>removeMemberFromKeys(name,scopeKeys(team)));
      state.assignments[team]=names.slice(0,5);
      if(typeof clearSelections==='function')clearSelections(false);
      commitMutation(`Party ${payload.partyNo} placed`);
      showToast('Party placed',`Party ${payload.partyNo} -> ${displayTeamLabel(team)}`);
    }catch(error){
      console.warn('Party drop failed',error);
      try{showToast('Party not placed','Could not place this party.','warn');}catch(_e){}
    }
  }

  document.addEventListener('dragover',event=>{
    if(!canUsePools()||!hasPartyDrag(event))return;
    const card=event.target.closest('.team-card[data-team-key]');
    if(!card)return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect='copy';
    document.querySelectorAll('.party-drop-ready').forEach(node=>node.classList.remove('party-drop-ready'));
    card.classList.add('party-drop-ready');
  },true);

  document.addEventListener('drop',event=>{
    if(!hasPartyDrag(event))return;
    const card=event.target.closest('.team-card[data-team-key]');
    document.querySelectorAll('.party-drop-ready').forEach(node=>node.classList.remove('party-drop-ready'));
    if(!card)return;
    let payload=null;
    try{payload=JSON.parse(event.dataTransfer.getData('application/x-titania-party'));}catch(_e){}
    if(!payload)return;
    event.preventDefault();
    event.stopPropagation();
    fillTeamFromParty(card.dataset.teamKey,payload);
  },true);

  document.addEventListener('dragend',()=>document.querySelectorAll('.party-drop-ready').forEach(node=>node.classList.remove('party-drop-ready')));

  function refreshForEvent(){
    ensureSidebar();
    applyPoolView();
  }

  function boot(){
    ensureStyle();
    loadIcons();
    ensureSidebar();

    // Safe observer: watch only the planner's active event attribute.
    new MutationObserver(refreshForEvent).observe(document.body,{attributes:true,attributeFilter:['data-event']});

    document.addEventListener('click',event=>{
      if(event.target.closest('.event-tab'))setTimeout(refreshForEvent,0);
    });
    window.addEventListener('focus',refreshForEvent);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
