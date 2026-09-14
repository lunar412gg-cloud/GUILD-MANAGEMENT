/*
 * Titania pre-attendance controls for Guild League / Siege party slots.
 * Depends on the main index.html script having created supabaseClient/state/currentEvent.
 */
(function(){
  'use strict';

  const STATUS_META={
    no_response:{label:'PRE ?',className:'pre-no-response',next:'going'},
    going:{label:'PRE ✓',className:'pre-going',next:'not_going'},
    not_going:{label:'PRE ✕',className:'pre-not-going',next:'no_response'}
  };
  const EVENT_LABELS={
    guild_league_tuesday:'Guild League (Tuesday)',
    guild_league_thursday:'Guild League (Thursday)',
    siege:'Siege'
  };

  let cachedEventKey='';
  let cachedEventId='';
  let statusByMemberId=new Map();
  let loadingKey='';
  let observer=null;
  let decorateQueued=false;

  function canUseAttendance(){
    return typeof supabaseClient!=='undefined'&&supabaseClient&&typeof state!=='undefined'&&state&&Array.isArray(state.roster);
  }

  function daysUntil(targetDay){
    const today=new Date().getDay();
    return (targetDay-today+7)%7;
  }

  function nextGuildLeagueType(){
    return daysUntil(2)<=daysUntil(4)?'guild_league_tuesday':'guild_league_thursday';
  }

  function plannerEventType(){
    if(typeof currentEvent==='undefined')return '';
    if(currentEvent==='guild_league')return nextGuildLeagueType();
    if(currentEvent==='siege')return 'siege';
    return '';
  }

  function nextEventDate(eventType){
    const targetDay=eventType==='guild_league_tuesday'?2:eventType==='guild_league_thursday'?4:eventType==='siege'?0:null;
    if(targetDay===null)return '';
    const now=new Date();
    const date=new Date(now.getFullYear(),now.getMonth(),now.getDate());
    const delta=(targetDay-date.getDay()+7)%7;
    date.setDate(date.getDate()+delta);
    const y=date.getFullYear();
    const m=String(date.getMonth()+1).padStart(2,'0');
    const d=String(date.getDate()).padStart(2,'0');
    return `${y}-${m}-${d}`;
  }

  function currentKey(){
    const type=plannerEventType();
    if(!type)return '';
    return `${type}:${nextEventDate(type)}`;
  }

  function rosterMaps(){
    const byName=new Map();
    const byId=new Map();
    (state.roster||[]).forEach(member=>{
      if(!member)return;
      const name=String(member.name||'').trim();
      const id=String(member.id||member.name||'').trim();
      if(name)byName.set(name.toLowerCase(),id||name.toLowerCase());
      if(id)byId.set(id,name);
    });
    return {byName,byId};
  }

  function memberIdForName(name,maps){
    const lower=String(name||'').trim().toLowerCase();
    return maps.byName.get(lower)||lower;
  }

  function memberNameForId(memberId){
    const maps=rosterMaps();
    return maps.byId.get(String(memberId))||'';
  }

  function toast(title,message,type){
    try{
      if(typeof showToast==='function')showToast(title,message,type||'');
    }catch(_e){}
  }

  function canEdit(){
    try{return typeof userCanEdit==='function'?userCanEdit():true;}catch(_e){return true;}
  }

  async function ensureEventRow(eventType,eventDate){
    const key=`${eventType}:${eventDate}`;
    if(cachedEventId&&cachedEventKey===key)return cachedEventId;

    let query=await supabaseClient.from('attendance_events').select('id').eq('event_type',eventType).eq('event_date',eventDate).maybeSingle();
    if(query.error)throw query.error;
    if(query.data&&query.data.id){
      cachedEventKey=key;
      cachedEventId=query.data.id;
      return cachedEventId;
    }

    const title=EVENT_LABELS[eventType]||'Attendance';
    const insert=await supabaseClient.from('attendance_events').insert({event_type:eventType,event_date:eventDate,title,status:'upcoming'}).select('id').single();
    if(insert.error){
      if(String(insert.error.code||'')==='23505'){
        query=await supabaseClient.from('attendance_events').select('id').eq('event_type',eventType).eq('event_date',eventDate).single();
        if(query.error)throw query.error;
        cachedEventKey=key;
        cachedEventId=query.data.id;
        return cachedEventId;
      }
      throw insert.error;
    }
    cachedEventKey=key;
    cachedEventId=insert.data.id;
    return cachedEventId;
  }

  async function loadStatuses(force){
    if(!canUseAttendance())return;
    const key=currentKey();
    if(!key){
      cachedEventKey='';
      cachedEventId='';
      statusByMemberId=new Map();
      ensureResetButton();
      scheduleDecorate();
      return;
    }
    if(!force&&key===cachedEventKey&&loadingKey!==key){
      ensureResetButton();
      scheduleDecorate();
      return;
    }
    if(loadingKey===key)return;

    loadingKey=key;
    cachedEventKey=key;
    cachedEventId='';
    statusByMemberId=new Map();
    const [eventType,eventDate]=key.split(':');

    try{
      const eventRes=await supabaseClient.from('attendance_events').select('id').eq('event_type',eventType).eq('event_date',eventDate).maybeSingle();
      if(eventRes.error)throw eventRes.error;
      if(eventRes.data&&eventRes.data.id){
        cachedEventId=eventRes.data.id;
        const recordRes=await supabaseClient.from('attendance_records').select('member_id,pre_status').eq('event_id',cachedEventId);
        if(recordRes.error)throw recordRes.error;
        (recordRes.data||[]).forEach(row=>{
          statusByMemberId.set(String(row.member_id),STATUS_META[row.pre_status]?row.pre_status:'no_response');
        });
      }
    }catch(error){
      if(String(error&&error.code||'')==='42P01'){
        toast('Attendance setup required','Run attendance_setup.sql in Supabase first.','warn');
      }else{
        console.warn('Attendance load failed',error);
      }
    }finally{
      loadingKey='';
      ensureResetButton();
      scheduleDecorate();
    }
  }

  function badgeHtml(status,memberId,name){
    const meta=STATUS_META[status]||STATUS_META.no_response;
    return `<button type="button" class="pre-attendance-badge ${meta.className}" data-pre-member-id="${escapeHtmlAttr(memberId)}" data-pre-member-name="${escapeHtmlAttr(name)}" data-pre-status="${status}" title="Pre-attendance: ${status==='going'?'Going':status==='not_going'?'Not Going':'No Response'}. Click to change.">${meta.label}</button>`;
  }

  function escapeHtmlAttr(value){
    return String(value==null?'':value).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function setIfChanged(element,property,value){
    if(element[property]!==value)element[property]=value;
  }

  function setDatasetIfChanged(element,key,value){
    if(element.dataset[key]!==value)element.dataset[key]=value;
  }

  function cleanupOldNameWrapper(slot){
    const row=slot.querySelector('.slot-name-row');
    if(!row)return;
    const nameEl=row.querySelector('.slot-name');
    if(nameEl)row.parentNode.insertBefore(nameEl,row);
    row.remove();
  }

  function decorateSlots(){
    decorateQueued=false;
    const type=plannerEventType();
    const teamsWrap=document.getElementById('teamsWrap');
    if(!teamsWrap)return;

    if(!type){
      teamsWrap.querySelectorAll('.pre-attendance-badge').forEach(el=>el.remove());
      return;
    }

    const maps=rosterMaps();
    teamsWrap.querySelectorAll('.slot.filled').forEach(slot=>{
      cleanupOldNameWrapper(slot);
      const nameEl=slot.querySelector('.slot-name');
      const infoEl=slot.querySelector('.slot-info');
      if(!nameEl||!infoEl)return;
      const name=nameEl.textContent.trim();
      const memberId=memberIdForName(name,maps);
      if(!memberId)return;

      const status=statusByMemberId.get(memberId)||'no_response';
      const meta=STATUS_META[status]||STATUS_META.no_response;
      let badge=slot.querySelector(':scope > .pre-attendance-badge');

      if(!badge){
        infoEl.insertAdjacentHTML('afterend',badgeHtml(status,memberId,name));
        return;
      }

      if(badge.previousElementSibling!==infoEl){
        infoEl.insertAdjacentElement('afterend',badge);
      }

      const desiredClass=`pre-attendance-badge ${meta.className}`;
      setIfChanged(badge,'className',desiredClass);
      setDatasetIfChanged(badge,'preMemberId',memberId);
      setDatasetIfChanged(badge,'preMemberName',name);
      setDatasetIfChanged(badge,'preStatus',status);
      setIfChanged(badge,'textContent',meta.label);

      const desiredTitle=`Pre-attendance: ${status==='going'?'Going':status==='not_going'?'Not Going':'No Response'}. Click to change.`;
      setIfChanged(badge,'title',desiredTitle);
    });
  }

  function scheduleDecorate(){
    if(decorateQueued)return;
    decorateQueued=true;
    const run=()=>{
      const key=currentKey();
      if(key&&key!==cachedEventKey){
        decorateQueued=false;
        loadStatuses(true);
        return;
      }
      decorateSlots();
    };
    if(typeof requestAnimationFrame==='function')requestAnimationFrame(run);
    else setTimeout(run,0);
  }

  async function handleBadgeClick(badge){
    if(!canEdit()){
      toast('Read-only access','Your account cannot change pre-attendance.','warn');
      return;
    }
    const key=currentKey();
    if(!key)return;
    const [eventType,eventDate]=key.split(':');
    const memberId=String(badge.dataset.preMemberId||'');
    const memberName=String(badge.dataset.preMemberName||memberNameForId(memberId)||'');
    const current=STATUS_META[badge.dataset.preStatus]?badge.dataset.preStatus:'no_response';
    const next=STATUS_META[current].next;

    badge.classList.add('pre-saving');
    badge.disabled=true;
    try{
      const eventId=await ensureEventRow(eventType,eventDate);
      const result=await supabaseClient.from('attendance_records').upsert({
        event_id:eventId,
        member_id:memberId,
        member_name:memberName,
        pre_status:next
      },{onConflict:'event_id,member_id'}).select('pre_status').single();
      if(result.error)throw result.error;
      statusByMemberId.set(memberId,result.data&&STATUS_META[result.data.pre_status]?result.data.pre_status:next);
      scheduleDecorate();
    }catch(error){
      if(String(error&&error.code||'')==='42P01')toast('Attendance setup required','Run attendance_setup.sql in Supabase first.','warn');
      else toast('Attendance save failed',String(error&&error.message||error),'err');
    }finally{
      badge.disabled=false;
      badge.classList.remove('pre-saving');
    }
  }

  async function resetAllPreAttendance(){
    if(!canEdit()){
      toast('Read-only access','Your account cannot reset pre-attendance.','warn');
      return;
    }
    const key=currentKey();
    if(!key)return;
    const [eventType,eventDate]=key.split(':');
    const label=EVENT_LABELS[eventType]||eventType;
    if(!window.confirm(`Reset ALL pre-attendance for ${label} on ${eventDate} back to PRE ?\n\nThis will not change the party lineup or actual attendance.`))return;

    const btn=document.getElementById('preResetAllBtn');
    if(btn){btn.disabled=true;btn.textContent='Resetting…';}
    try{
      const eventRes=await supabaseClient.from('attendance_events').select('id').eq('event_type',eventType).eq('event_date',eventDate).maybeSingle();
      if(eventRes.error)throw eventRes.error;
      if(!eventRes.data||!eventRes.data.id){
        statusByMemberId=new Map();
        scheduleDecorate();
        toast('PRE attendance reset','Everyone is already PRE ?.');
        return;
      }
      const result=await supabaseClient.from('attendance_records').update({pre_status:'no_response'}).eq('event_id',eventRes.data.id);
      if(result.error)throw result.error;
      statusByMemberId=new Map();
      cachedEventId=eventRes.data.id;
      scheduleDecorate();
      toast('PRE attendance reset',`${label} has been reset to PRE ? for all members.`);
    }catch(error){
      toast('Reset failed',String(error&&error.message||error),'err');
    }finally{
      if(btn){btn.disabled=false;btn.textContent='↺ Reset Pre-Attendance';}
    }
  }

  function ensureResetButton(){
    const clearBtn=document.getElementById('clearBtn');
    if(!clearBtn||!clearBtn.parentNode)return;
    let btn=document.getElementById('preResetAllBtn');
    if(!btn){
      btn=document.createElement('button');
      btn.type='button';
      btn.id='preResetAllBtn';
      btn.className='btn pre-reset-all-btn';
      btn.textContent='↺ Reset Pre-Attendance';
      btn.title='Reset all pre-attendance for the upcoming event back to No Response';
      btn.addEventListener('click',resetAllPreAttendance);
      clearBtn.parentNode.insertBefore(btn,clearBtn);
    }
    const visible=!!plannerEventType();
    btn.style.display=visible?'':'none';
    btn.disabled=visible&&!canEdit();
  }

  function wireClicks(){
    document.addEventListener('pointerdown',event=>{
      if(event.target.closest('.pre-attendance-badge'))event.stopPropagation();
    },true);
    document.addEventListener('click',event=>{
      const badge=event.target.closest('.pre-attendance-badge');
      if(!badge)return;
      event.preventDefault();
      event.stopPropagation();
      handleBadgeClick(badge);
    },true);
  }

  function startObserver(){
    const teamsWrap=document.getElementById('teamsWrap');
    if(!teamsWrap)return;

    observer=new MutationObserver(()=>scheduleDecorate());
    observer.observe(teamsWrap,{subtree:true,childList:true});

    const bodyObserver=new MutationObserver(()=>{
      ensureResetButton();
      const key=currentKey();
      if(key&&key!==cachedEventKey)loadStatuses(true);
      else scheduleDecorate();
    });
    bodyObserver.observe(document.body,{attributes:true,attributeFilter:['data-event']});
  }

  function boot(){
    let attempts=0;
    const wait=setInterval(()=>{
      attempts++;
      if(canUseAttendance()&&document.getElementById('teamsWrap')){
        clearInterval(wait);
        wireClicks();
        ensureResetButton();
        startObserver();
        loadStatuses(true);
      }else if(attempts>120){
        clearInterval(wait);
      }
    },250);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
