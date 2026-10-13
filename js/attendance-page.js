/* Titania Attendance Records page - actual attendance + event history. */
(function(){
  'use strict';

  const EVENT_META={
    guild_league_tuesday:{label:'Guild League (Tuesday)',short:'GL Tue',day:2,icon:'🛡️',planner:'guild_league'},
    guild_league_thursday:{label:'Guild League (Thursday)',short:'GL Thu',day:4,icon:'🛡️',planner:'guild_league'},
    siege:{label:'Siege',short:'Siege',day:0,icon:'🏰',planner:'siege'}
  };
  const EVENT_ORDER=['guild_league_tuesday','guild_league_thursday','siege'];
  const PRE_META={
    going:{label:'GOING',symbol:'✓',className:'going'},
    not_going:{label:'NOT GOING',symbol:'✕',className:'not-going'},
    no_response:{label:'NO RESPONSE',symbol:'?',className:'no-response'}
  };
  const ACTUAL_META={
    not_checked:{label:'Not Checked',symbol:'—',className:'not-checked'},
    present:{label:'Present',symbol:'✓',className:'present'},
    absent:{label:'Absent',symbol:'✕',className:'absent'},
    excused:{label:'Excused',symbol:'E',className:'excused'}
  };

  let attendanceActive=false;
  let events=[];
  let selectedEvent=null;
  let records=new Map();
  let loading=false;
  let filters={search:'',pre:'all',actual:'all'};

  function appReady(){return typeof supabaseClient!=='undefined'&&supabaseClient&&typeof state!=='undefined'&&state&&Array.isArray(state.roster)&&document.getElementById('eventTabs')&&document.getElementById('teamsWrap');}
  function canEdit(){try{return typeof userCanEdit==='function'?userCanEdit():true;}catch(_e){return true;}}
  function toast(title,message,type){try{if(typeof showToast==='function')showToast(title,message,type||'');}catch(_e){}}
  function esc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}
  function dateInputValue(date){const d=date instanceof Date?date:new Date(date);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  function parseLocalDate(value){const p=String(value||'').split('-').map(Number);return p.length===3?new Date(p[0],p[1]-1,p[2]):new Date();}
  function formatEventDate(value){return parseLocalDate(value).toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short',year:'numeric'});}
  function latestScheduledDate(type){const meta=EVENT_META[type];const d=new Date();d.setHours(0,0,0,0);const delta=(d.getDay()-meta.day+7)%7;d.setDate(d.getDate()-delta);return dateInputValue(d);}
  function eventTitle(event){return event?(EVENT_META[event.event_type]||{}).label||event.title||event.event_type:'Attendance';}
  function normalizePre(v){return PRE_META[v]?v:'no_response';}
  function normalizeActual(v){return ACTUAL_META[v]?v:'not_checked';}
  function isGuildLeagueType(type){return type==='guild_league_tuesday'||type==='guild_league_thursday';}

  function activeRosterSnapshot(sourceState){
    const source=sourceState||state;
    return (source.roster||[])
      .filter(m=>String(m&&m.status||'active').toLowerCase()!=='inactive')
      .map(m=>({memberId:String(m.id||m.name||''),name:String(m.name||''),cls:String(m.cls||'Unknown'),gr:Number(m.gr)||0}));
  }
  function partyLabel(key){try{if(typeof displayTeamLabel==='function')return String(displayTeamLabel(key));}catch(_e){}const m=String(key).match(/(\d+)$/);return `Party ${m?m[1]:'?'}`;}
  function raidForKey(key){try{if(typeof raidForTeam==='function')return raidForTeam(key);}catch(_e){}return null;}
  function lineupSnapshot(eventType,sourceState){
    const source=sourceState||state;
    const roster=activeRosterSnapshot(source);
    const planner=isGuildLeagueType(eventType)?'guild_league':eventType;
    if(planner!=='guild_league'&&planner!=='siege')return {version:2,capturedAt:new Date().toISOString(),eventType,roster,lineup:[]};
    const memberMap=new Map(roster.map(m=>[m.name.toLowerCase(),m]));
    const lineup=[];
    const assignments=source.assignments&&typeof source.assignments==='object'?source.assignments:{};
    const keys=Object.keys(assignments).filter(key=>planner==='guild_league'?/^(main_|sub_)/.test(key):/^siege_(main_|sub_)/.test(key));
    keys.forEach(key=>{
      const raid=raidForKey(key);
      const groupLabel=planner==='guild_league'?(key.startsWith('main_')?'Main Battlefield':'Sub Battlefield'):'';
      const raidLabel=raid&&raid.label?String(raid.label):'Raid ?';
      const party=partyLabel(key);
      const partyOrder=Number((party.match(/\d+/)||[])[0]||999);
      const raidOrder=Number((raidLabel.match(/\d+/)||[])[0]||999);
      (Array.isArray(assignments[key])?assignments[key]:[]).forEach((name,slot)=>{
        if(!name)return;
        const member=memberMap.get(String(name).toLowerCase());
        lineup.push({memberId:member?member.memberId:String(name).toLowerCase(),memberName:String(name),teamKey:key,partyLabel:party,raidId:raid&&raid.id?String(raid.id):'',raidLabel,groupLabel,raidOrder,partyOrder,slot:Number(slot)||0});
      });
    });
    return {version:2,capturedAt:new Date().toISOString(),eventType,roster,lineup};
  }

  async function fetchEvents(){const r=await supabaseClient.from('attendance_events').select('id,event_type,event_date,title,status,created_at,updated_at,lineup_snapshot,closed_at').order('event_date',{ascending:false}).order('created_at',{ascending:false}).limit(100);if(r.error)throw r.error;events=r.data||[];}
  async function fetchRecords(eventId){const r=await supabaseClient.from('attendance_records').select('id,event_id,member_id,member_name,pre_status,actual_status,note,pre_updated_at,actual_updated_at,updated_at').eq('event_id',eventId);if(r.error)throw r.error;records=new Map();(r.data||[]).forEach(row=>records.set(String(row.member_id),{...row,pre_status:normalizePre(row.pre_status),actual_status:normalizeActual(row.actual_status)}));}
  async function ensureSnapshot(event){if(!event||event.lineup_snapshot||!canEdit())return;const snap=lineupSnapshot(event.event_type);const r=await supabaseClient.from('attendance_events').update({lineup_snapshot:snap}).eq('id',event.id).select('lineup_snapshot').single();if(!r.error)event.lineup_snapshot=r.data.lineup_snapshot;}
  async function loadEvent(id){const event=events.find(e=>String(e.id)===String(id));if(!event)return;selectedEvent=event;loading=true;renderShell();try{await fetchRecords(event.id);await ensureSnapshot(event);}catch(e){toast('Attendance load failed',String(e.message||e),'err');}finally{loading=false;renderShell();}}
  async function openOrCreateEvent(type,date){if(!EVENT_META[type]||!date)return;loading=true;renderShell();try{let r=await supabaseClient.from('attendance_events').select('id,event_type,event_date,title,status,created_at,updated_at,lineup_snapshot,closed_at').eq('event_type',type).eq('event_date',date).maybeSingle();if(r.error)throw r.error;let event=r.data;if(!event){if(!canEdit())throw new Error('Only Leader/Admin accounts can create an attendance event.');const payload={event_type:type,event_date:date,title:EVENT_META[type].label,status:'open',lineup_snapshot:lineupSnapshot(type)};r=await supabaseClient.from('attendance_events').insert(payload).select('id,event_type,event_date,title,status,created_at,updated_at,lineup_snapshot,closed_at').single();if(r.error)throw r.error;event=r.data;}await fetchEvents();selectedEvent=events.find(e=>String(e.id)===String(event.id))||event;await fetchRecords(selectedEvent.id);await ensureSnapshot(selectedEvent);}catch(e){toast('Attendance event failed',String(e.message||e),'err');}finally{loading=false;renderShell();}}

  function membersForEvent(){
    if(!selectedEvent)return [];
    const snapshot=selectedEvent.lineup_snapshot||lineupSnapshot(selectedEvent.event_type);
    const roster=Array.isArray(snapshot.roster)&&snapshot.roster.length?snapshot.roster:activeRosterSnapshot();
    const lineup=Array.isArray(snapshot.lineup)?snapshot.lineup:[];
    const byId=new Map();
    lineup.forEach(a=>{if(a&&a.memberId)byId.set(String(a.memberId),a);});
    const out=[],seen=new Set();
    roster.forEach(m=>{
      const id=String(m.memberId||m.id||m.name||'');
      if(!id||seen.has(id))return;
      seen.add(id);
      const r=records.get(id);
      out.push({memberId:id,name:String(m.name||r&&r.member_name||'Unknown'),cls:String(m.cls||'Unknown'),pre_status:normalizePre(r&&r.pre_status),actual_status:normalizeActual(r&&r.actual_status),note:String(r&&r.note||''),assignment:byId.get(id)||null});
    });
    if(!snapshot.membersRefreshed){
      records.forEach((r,id)=>{if(!seen.has(id))out.push({memberId:id,name:String(r.member_name||'Unknown'),cls:'Unknown',pre_status:normalizePre(r.pre_status),actual_status:normalizeActual(r.actual_status),note:String(r.note||''),assignment:byId.get(id)||null});});
    }
    return out;
  }
  function counts(rows){const c={going:0,not_going:0,no_response:0,present:0,absent:0,excused:0,not_checked:0};rows.forEach(r=>{c[r.pre_status]++;c[r.actual_status]++;});return c;}
  function filteredRows(rows){const q=filters.search.trim().toLowerCase();return rows.filter(r=>(filters.pre==='all'||r.pre_status===filters.pre)&&(filters.actual==='all'||r.actual_status===filters.actual)&&(!q||`${r.name} ${r.cls} ${r.assignment&&r.assignment.partyLabel||''} ${r.assignment&&r.assignment.raidLabel||''}`.toLowerCase().includes(q)));}
  function groupRows(rows){const groups=new Map();rows.forEach(r=>{const a=r.assignment;let key='unassigned',label='Unassigned / Reserve',order=9999;if(a){const g=String(a.groupLabel||'');label=g?`${g} · ${a.raidLabel||'Raid ?'}`:(a.raidLabel||'Raid ?');key=`${g}|${a.raidId||a.raidLabel}`;order=(g==='Sub Battlefield'?100:0)+(Number(a.raidOrder)||999);}if(!groups.has(key))groups.set(key,{label,order,rows:[]});groups.get(key).rows.push(r);});const out=[...groups.values()].sort((a,b)=>a.order-b.order||a.label.localeCompare(b.label));out.forEach(g=>g.rows.sort((a,b)=>(Number(a.assignment&&a.assignment.partyOrder)||999)-(Number(b.assignment&&b.assignment.partyOrder)||999)||(Number(a.assignment&&a.assignment.slot)||0)-(Number(b.assignment&&b.assignment.slot)||0)||a.name.localeCompare(b.name)));return out;}
  function chip(v,l,c){return `<div class="att-summary-chip ${c}"><b>${v}</b><span>${esc(l)}</span></div>`;}
  function prePill(s){const m=PRE_META[s];return `<span class="att-pre-pill ${m.className}"><b>${m.symbol}</b>${esc(m.label)}</span>`;}
  function actualControls(r){const disabled=!canEdit()||selectedEvent.status==='closed';return `<div class="att-actual-buttons">${['present','absent','excused','not_checked'].map(s=>{const m=ACTUAL_META[s];return `<button type="button" class="att-actual-btn ${m.className}${r.actual_status===s?' active':''}" data-att-actual="${s}" data-member-id="${esc(r.memberId)}" ${disabled?'disabled':''}><span>${m.symbol}</span><em>${esc(m.label)}</em></button>`;}).join('')}</div>`;}

  function renderMemberGroups(){const box=document.getElementById('attendanceMemberGroups');if(!box||!selectedEvent)return;const rows=filteredRows(membersForEvent());if(!rows.length){box.innerHTML='<div class="att-empty">No members match the current filters.</div>';return;}box.innerHTML=groupRows(rows).map(g=>`<section class="att-group"><div class="att-group-head"><div><b>${esc(g.label)}</b><span>${g.rows.length} members</span></div><strong>${g.rows.filter(r=>r.actual_status==='present').length}/${g.rows.length} Present</strong></div><div class="att-member-list">${g.rows.map(r=>`<div class="att-member-row ${r.actual_status}"><div class="att-member-main"><span class="class-dot" style="background:${typeof classColor==='function'?classColor(r.cls):'#8b93b0'}"></span><div><b>${esc(r.name)}</b><span>${esc(r.cls)}</span></div></div><div class="att-party">${r.assignment?`<b>${esc(r.assignment.partyLabel||'')}</b><span>${esc(r.assignment.raidLabel||'')}</span>`:'<span>Reserve / Unassigned</span>'}</div><div class="att-pre-cell">${prePill(r.pre_status)}</div><div class="att-actual-cell">${actualControls(r)}</div><button type="button" class="att-note-btn ${r.note?'has-note':''}" data-att-note="${esc(r.memberId)}">📝</button></div>`).join('')}</div></section>`).join('');}
  function renderEventPanel(){
    const panel=document.getElementById('attendanceEventPanel');
    if(!panel)return;
    if(loading){panel.innerHTML='<div class="att-loading"><span></span>Loading attendance…</div>';return;}
    if(!selectedEvent){panel.innerHTML='<div class="att-empty"><b>No attendance event selected.</b><span>Choose or create an event above.</span></div>';return;}
    const rows=membersForEvent(),c=counts(rows),rate=(c.present+c.absent)?Math.round(c.present/(c.present+c.absent)*100):0,closed=selectedEvent.status==='closed';
    const refreshMembersButton=canEdit()&&!closed?'<button class="btn small att-event-action-btn" id="attRefreshMembersBtn"><span class="att-btn-icon">↻</span><span>Refresh Members</span></button>':'';
    const finishButton=canEdit()?(closed?'<button class="btn small att-event-action-btn" id="attReopenBtn"><span class="att-btn-icon">↺</span><span>Reopen</span></button>':'<button class="btn small primary att-event-action-btn" id="attFinishBtn"><span class="att-btn-icon">✓</span><span>Finish Attendance</span></button>'):'';
    panel.innerHTML=`<div class="att-event-head"><div><span class="att-event-kicker">${EVENT_META[selectedEvent.event_type].icon} ${esc(eventTitle(selectedEvent))}</span><h2>${esc(formatEventDate(selectedEvent.event_date))}</h2><p>${closed?'Attendance finalized':'Mark actual attendance. Changes save immediately.'}</p></div><div class="att-event-actions">${refreshMembersButton}${finishButton}</div></div><div class="att-summary-grid">${chip(c.going,'Pre Going','going')}${chip(c.not_going,'Pre Not Going','not-going')}${chip(c.no_response,'No Response','no-response')}${chip(c.present,'Present','present')}${chip(c.absent,'Absent','absent')}${chip(c.excused,'Excused','excused')}${chip(c.not_checked,'Not Checked','not-checked')}${chip(`${rate}%`,'Attendance Rate','rate')}</div><div class="att-filterbar"><input id="attSearch" type="search" placeholder="Search member, class, party…" value="${esc(filters.search)}"><select id="attPreFilter"><option value="all">All Pre</option><option value="going">Going</option><option value="not_going">Not Going</option><option value="no_response">No Response</option></select><select id="attActualFilter"><option value="all">All Actual</option><option value="not_checked">Not Checked</option><option value="present">Present</option><option value="absent">Absent</option><option value="excused">Excused</option></select></div><div class="att-column-head"><span>Member</span><span>Party</span><span>Pre</span><span>Actual</span><span></span></div><div id="attendanceMemberGroups"></div>`;
    document.getElementById('attPreFilter').value=filters.pre;
    document.getElementById('attActualFilter').value=filters.actual;
    renderMemberGroups();
    wireEventPanel();
  }
  function renderShell(){if(!attendanceActive)return;const wrap=document.getElementById('teamsWrap');if(!wrap)return;wrap.innerHTML=`<div class="attendance-page" id="attendancePage"><div class="att-page-head"><div><span>📋</span><div><h1>ATTENDANCE</h1><p>Pre-attendance vs actual event attendance history.</p></div></div><span class="att-autosave">● Supabase records</span></div><div class="att-picker-card"><div class="att-picker-row"><label class="att-grow"><span>Attendance History</span><select id="attEventSelect"><option value="">Select event…</option>${events.map(e=>`<option value="${esc(e.id)}" ${selectedEvent&&String(e.id)===String(selectedEvent.id)?'selected':''}>${esc(formatEventDate(e.event_date))} · ${esc(eventTitle(e))}${e.status==='closed'?' · CLOSED':''}</option>`).join('')}</select></label><div class="att-quick">${EVENT_ORDER.map(t=>`<button class="btn small" data-att-quick="${t}" data-att-date="${latestScheduledDate(t)}">${EVENT_META[t].icon} ${EVENT_META[t].short}</button>`).join('')}</div></div><div class="att-create-row"><label><span>Event Type</span><select id="attCreateType">${EVENT_ORDER.map(t=>`<option value="${t}">${esc(EVENT_META[t].label)}</option>`).join('')}</select></label><label><span>Date</span><input id="attCreateDate" type="date" value="${latestScheduledDate('guild_league_tuesday')}"></label><button class="btn primary" id="attOpenCreateBtn">Open / Create</button></div></div><div id="attendanceEventPanel"></div></div>`;wirePicker();renderEventPanel();updateHeader();}

  function wirePicker(){const select=document.getElementById('attEventSelect');select.addEventListener('change',()=>{if(select.value)loadEvent(select.value);});document.querySelectorAll('[data-att-quick]').forEach(b=>b.addEventListener('click',()=>openOrCreateEvent(b.dataset.attQuick,b.dataset.attDate)));const type=document.getElementById('attCreateType'),date=document.getElementById('attCreateDate');type.addEventListener('change',()=>date.value=latestScheduledDate(type.value));document.getElementById('attOpenCreateBtn').addEventListener('click',()=>openOrCreateEvent(type.value,date.value));}
  function wireEventPanel(){const s=document.getElementById('attSearch');if(s)s.addEventListener('input',()=>{filters.search=s.value;renderMemberGroups();});const p=document.getElementById('attPreFilter');if(p)p.addEventListener('change',()=>{filters.pre=p.value;renderMemberGroups();});const a=document.getElementById('attActualFilter');if(a)a.addEventListener('change',()=>{filters.actual=a.value;renderMemberGroups();});const r=document.getElementById('attRefreshMembersBtn');if(r)r.addEventListener('click',refreshMembers);const f=document.getElementById('attFinishBtn');if(f)f.addEventListener('click',finishAttendance);const o=document.getElementById('attReopenBtn');if(o)o.addEventListener('click',reopenAttendance);}
  async function saveActual(id,status){if(!selectedEvent||!canEdit()||selectedEvent.status==='closed')return;const member=membersForEvent().find(r=>r.memberId===id);if(!member)return;const payload={event_id:selectedEvent.id,member_id:id,member_name:member.name,pre_status:member.pre_status,actual_status:status,note:member.note||''};const r=await supabaseClient.from('attendance_records').upsert(payload,{onConflict:'event_id,member_id'}).select('*').single();if(r.error){toast('Attendance save failed',r.error.message,'err');return;}records.set(id,{...r.data,pre_status:normalizePre(r.data.pre_status),actual_status:normalizeActual(r.data.actual_status)});renderEventPanel();}
  async function saveNote(id){if(!selectedEvent||!canEdit())return;const m=membersForEvent().find(r=>r.memberId===id);if(!m)return;const next=window.prompt(`Attendance note for ${m.name}`,m.note||'');if(next===null)return;const r=await supabaseClient.from('attendance_records').upsert({event_id:selectedEvent.id,member_id:id,member_name:m.name,pre_status:m.pre_status,actual_status:m.actual_status,note:String(next).trim().slice(0,500)},{onConflict:'event_id,member_id'}).select('*').single();if(r.error){toast('Note save failed',r.error.message,'err');return;}records.set(id,{...r.data,pre_status:normalizePre(r.data.pre_status),actual_status:normalizeActual(r.data.actual_status)});renderEventPanel();}
  async function refreshMembers(){
    if(!selectedEvent||!canEdit()||selectedEvent.status==='closed')return;
    const button=document.getElementById('attRefreshMembersBtn');
    if(button)button.disabled=true;
    try{
      const latest=await supabaseClient.from('planner_state').select('state').eq('id',1).single();
      if(latest.error)throw latest.error;
      const latestState=latest.data&&latest.data.state?latest.data.state:state;
      const snap={...lineupSnapshot(selectedEvent.event_type,latestState),membersRefreshed:true};
      const updated=await supabaseClient.from('attendance_events').update({lineup_snapshot:snap}).eq('id',selectedEvent.id).select('lineup_snapshot').single();
      if(updated.error)throw updated.error;
      selectedEvent.lineup_snapshot=updated.data.lineup_snapshot;
      const cached=events.find(e=>String(e.id)===String(selectedEvent.id));
      if(cached)cached.lineup_snapshot=selectedEvent.lineup_snapshot;
      await fetchRecords(selectedEvent.id);
      toast('Members refreshed','Attendance now uses the latest active roster and party list.');
    }catch(e){
      toast('Refresh members failed',String(e.message||e),'err');
    }finally{
      renderShell();
    }
  }
  async function finishAttendance(){if(!selectedEvent||!canEdit())return;const toAbsent=membersForEvent().filter(r=>r.pre_status==='going'&&r.actual_status==='not_checked');if(!window.confirm(toAbsent.length?`Finish attendance? ${toAbsent.length} GOING member(s) still Not Checked will be marked ABSENT.`:'Finish and close this attendance record?'))return;if(toAbsent.length){const r=await supabaseClient.from('attendance_records').upsert(toAbsent.map(m=>({event_id:selectedEvent.id,member_id:m.memberId,member_name:m.name,pre_status:m.pre_status,actual_status:'absent',note:m.note||''})),{onConflict:'event_id,member_id'});if(r.error){toast('Finish attendance failed',r.error.message,'err');return;}}const close=await supabaseClient.from('attendance_events').update({status:'closed',closed_at:new Date().toISOString()}).eq('id',selectedEvent.id);if(close.error){toast('Finish attendance failed',close.error.message,'err');return;}selectedEvent.status='closed';await fetchRecords(selectedEvent.id);await fetchEvents();renderShell();}
  async function reopenAttendance(){if(!selectedEvent||!canEdit()||!window.confirm('Reopen this attendance record?'))return;const r=await supabaseClient.from('attendance_events').update({status:'open',closed_at:null}).eq('id',selectedEvent.id);if(r.error){toast('Reopen failed',r.error.message,'err');return;}selectedEvent.status='open';renderShell();}
  function updateHeader(){const stats=document.getElementById('statsRow');if(!stats)return;const rows=selectedEvent?membersForEvent():[],c=counts(rows);stats.innerHTML=`<div class="stat-chip"><b>${rows.length}</b><span>Members</span></div><div class="stat-chip"><b>${c.going}</b><span>Pre Going</span></div><div class="stat-chip"><b>${c.present}</b><span>Present</span></div><div class="stat-chip ${c.absent?'warn':''}"><b>${c.absent}</b><span>Absent</span></div>`;}
  function showAttendance(){attendanceActive=true;document.body.classList.add('attendance-view');document.body.dataset.event='attendance';const body=document.getElementById('bodyWrap');if(body){body.classList.add('dashboard-mode');body.dataset.event='attendance';}const hint=document.getElementById('hintBar');if(hint)hint.hidden=true;const action=document.getElementById('eventActionRow');if(action)action.hidden=true;const auto=document.getElementById('autoFillBtn');if(auto)auto.hidden=true;document.querySelectorAll('.event-tab').forEach(t=>t.classList.toggle('active',t.dataset.event==='attendance'));renderShell();if(!events.length&&!loading){loading=true;fetchEvents().then(()=>{const today=dateInputValue(new Date());selectedEvent=events.find(e=>e.event_date<=today)||events[0]||null;return selectedEvent?fetchRecords(selectedEvent.id):null;}).catch(e=>toast('Attendance load failed',String(e.message||e),'err')).finally(()=>{loading=false;renderShell();});}}
  function leaveAttendance(){if(!attendanceActive)return;attendanceActive=false;document.body.classList.remove('attendance-view');const hint=document.getElementById('hintBar');if(hint)hint.hidden=false;const body=document.getElementById('bodyWrap');if(body)body.classList.remove('dashboard-mode');}
  function injectTab(){const tabs=document.getElementById('eventTabs');if(!tabs||tabs.querySelector('[data-event="attendance"]'))return;const b=document.createElement('button');b.className='event-tab att-tab';b.dataset.event='attendance';b.type='button';b.innerHTML='📋 Attendance';const p=tabs.querySelector('[data-event="polarity_zone"]');p?tabs.insertBefore(b,p):tabs.appendChild(b);}
  function wireGlobal(){document.addEventListener('click',e=>{const tab=e.target.closest('.event-tab');if(tab&&tab.dataset.event==='attendance'){e.preventDefault();e.stopImmediatePropagation();showAttendance();return;}if(tab&&attendanceActive&&tab.dataset.event!=='attendance')leaveAttendance();},true);document.addEventListener('click',e=>{if(!attendanceActive)return;const a=e.target.closest('[data-att-actual]');if(a){e.preventDefault();saveActual(String(a.dataset.memberId),String(a.dataset.attActual));return;}const n=e.target.closest('[data-att-note]');if(n){e.preventDefault();saveNote(String(n.dataset.attNote));}});}
  function boot(){let tries=0;const timer=setInterval(()=>{tries++;if(appReady()){clearInterval(timer);injectTab();wireGlobal();}else if(tries>120)clearInterval(timer);},100);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
