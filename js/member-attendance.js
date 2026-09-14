/* A member's attendance history. Uses the approved page session; reads only. */
window.TitaniaMemberAttendance = function(client, memberId, viewerId){
  'use strict';
  const panel=document.getElementById('memberAttendance');
  if(!panel)return;
  const content=document.getElementById('memberAttendanceContent');
  const select=document.getElementById('memberAttendanceMode');
  const refresh=document.getElementById('memberAttendanceRefresh');
  const labels={guild_league_tuesday:'GL Tue',guild_league_thursday:'GL Thu',siege:'Siege'};
  const actual={present:['Present','fa-check'],absent:['Absent','fa-xmark'],excused:['Excused','fa-calendar-check'],not_checked:['Not checked','fa-question']};
  const pre={going:['Going','fa-check'],not_going:['Not going','fa-xmark'],no_response:['No response','fa-question']};
  const other={not_listed:['Not listed','fa-minus'],unknown:['No record','fa-minus']};
  let events=[];
  let loading=false;
  const esc=value=>String(value==null?'':value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date=value=>new Date(value+'T12:00:00').toLocaleDateString(undefined,{day:'numeric',month:'short'});

  function prepare(rows,records){
    const byEvent=new Map(records.map(row=>[String(row.event_id),row]));
    return rows.slice().reverse().map(event=>{
      const record=byEvent.get(String(event.id));
      const snapshot=event.lineup_snapshot||{};
      const hasRoster=Array.isArray(snapshot.roster);
      const listed=hasRoster&&snapshot.roster.some(member=>member&&String(member.memberId||member.id||member.name||'')===memberId);
      // A refreshed snapshot is authoritative; ignore records for removed members.
      const eligible=listed||Boolean(record&&(!hasRoster||!snapshot.membersRefreshed));
      const missing=hasRoster?'not_listed':'unknown';
      return {...event,
        actual:eligible?(record&&Object.hasOwn(actual,record.actual_status)?record.actual_status:'not_checked'):missing,
        pre:eligible?(record&&Object.hasOwn(pre,record.pre_status)?record.pre_status:'no_response'):missing,
        eligible
      };
    });
  }

  function render(){
    if(!events.length){
      content.innerHTML='<p class="muted" role="status">No Guild League or Siege events have been recorded yet.</p>';
      return;
    }
    const mode=select.value==='pre'?'pre':'actual';
    const meta=mode==='actual'?actual:pre;
    const counts=Object.fromEntries(Object.keys(meta).map(key=>[key,events.filter(event=>event[mode]===key).length]));
    const eligible=events.filter(event=>event.eligible).length;
    const positive=mode==='actual'?counts.present:counts.going;
    const pct=eligible?Math.round(positive/eligible*100)+'%':'N/A';
    const legend=Object.entries(meta).map(([key,[label]])=>`<span><i class="att-key ${key}" aria-hidden="true"></i>${label} <b>${counts[key]}</b></span>`).join('');
    const bars=events.map(event=>{
      const key=event[mode];
      const [status,icon]=meta[key]||other[key];
      const final=event.status==='closed'?'Closed':'Not final';
      const detail=`${labels[event.event_type]} ${event.event_date}: ${status}. ${final}.`;
      return `<div class="att-event" role="listitem" aria-label="${esc(detail)}">
        <div class="att-event-bar ${key}" aria-hidden="true"><i class="fa-solid ${icon}"></i></div>
        <b>${esc(date(event.event_date))}</b><span>${labels[event.event_type]}</span><strong>${status}</strong><small>${final}</small>
      </div>`;
    }).join('');
    content.innerHTML=`<div class="att-summary"><strong class="att-rate">${pct}</strong><span class="att-rate-label">${positive}/${eligible} eligible events ${mode==='actual'?'marked present':'marked going'}</span><div class="att-legend">${legend}</div></div>
      <div class="att-scroll" tabindex="0" role="region" aria-label="Member attendance timeline; scroll horizontally on small screens"><div class="att-event-chart" role="list">${bars}</div></div>
      <p class="att-note">Each bar is one event, with colour showing this member's status. ${mode==='actual'?'Not checked is not absent.':'No response is not Not going.'} Not listed / No record events are excluded from the percentage. Results for unfinished events are provisional.</p>`;
  }

  async function checkViewer(){
    const user=await client.auth.getUser();
    if(user.error||!user.data?.user||user.data.user.id!==viewerId)throw new Error('Sign in to Titania again to view attendance.');
  }

  async function load(){
    if(loading)return;
    loading=true;
    refresh.disabled=true;
    select.disabled=true;
    content.setAttribute('aria-busy','true');
    content.innerHTML='<p class="muted" role="status">Loading attendance...</p>';
    try{
      await checkViewer();
      const result=await client.from('attendance_events').select('id,event_type,event_date,status,lineup_snapshot')
        .in('event_type',Object.keys(labels)).order('event_date',{ascending:false}).order('id',{ascending:false}).limit(12);
      if(result.error)throw result.error;
      const rows=result.data||[];
      let records=[];
      if(rows.length){
        const response=await client.from('attendance_records').select('event_id,member_id,pre_status,actual_status')
          .eq('member_id',memberId).in('event_id',rows.map(event=>event.id));
        if(response.error)throw response.error;
        records=response.data||[];
      }
      // Do not show a delayed response after the signed-in user has changed.
      await checkViewer();
      events=prepare(rows,records);
      render();
    }catch(error){
      events=[];
      content.innerHTML='<p class="muted" role="alert">Could not load attendance. Check your sign-in and select Refresh to try again.</p>';
      console.warn('Member attendance load failed',error);
    }finally{
      loading=false;
      refresh.disabled=false;
      select.disabled=false;
      content.removeAttribute('aria-busy');
    }
  }
  select.addEventListener('change',render);
  refresh.addEventListener('click',load);
  load();
};
