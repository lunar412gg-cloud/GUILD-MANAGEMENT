(function TitaniaGuildRuns(){
  'use strict';

  const cfg=window.TITANIA_CONFIG||{};
  const page=document.body.dataset.guildRunsPage||'';
  const loading=document.getElementById('loading');
  const errorBox=document.getElementById('pageError');
  let client=null;
  let profile=null;
  let roster=[];
  let iconMap={};
  const saveTimers=new Map();

  function esc(v){return String(v==null?'':v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
  function isOrganizer(){return Boolean(profile&&profile.approved&&['party_organizer','admin'].includes(profile.role));}
  function runLabel(type){return type==='mirage'?'Mirage':'Time Echo';}
  function typeLabel(type){return type==='carrier'?'Can Carry':'Need Carry';}
  function iconFor(member){const file=iconMap[member&&member.cls];return file?`./assets/images/job/${encodeURIComponent(file)}`:'';}
  function memberById(id){return roster.find(m=>String(m.id)===String(id));}
  function memberHtml(member){
    if(!member)return '<span>Unknown member</span>';
    const src=iconFor(member);
    return `<span class="player-cell">${src?`<img class="job-icon" src="${esc(src)}" alt="">`:''}<span>${esc(member.name)}</span></span>`;
  }
  function pickerIcon(type){
    if(type==='date')return '<span class="run-picker-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M16 3v4M8 3v4M3 11h18"></path></svg></span>';
    return '<span class="run-picker-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg></span>';
  }
  function showError(message){if(loading)loading.hidden=true;if(errorBox){errorBox.hidden=false;errorBox.textContent=message;}}
  function clearError(){if(errorBox)errorBox.hidden=true;}

  async function loadBase(){
    if(!window.supabase||!cfg.supabaseUrl||!cfg.supabasePublishableKey)throw new Error('Supabase configuration is missing.');
    client=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
    const userResult=await client.auth.getUser();
    const user=userResult.data&&userResult.data.user;
    if(userResult.error||!user)throw new Error('Sign in to Titania first.');

    const profileResult=await client.from('profiles').select('role,approved').eq('id',user.id).single();
    if(profileResult.error||!profileResult.data||!profileResult.data.approved)throw new Error('Approved Titania access is required.');
    profile=profileResult.data;

    const [plannerResult,iconsResult]=await Promise.all([
      client.from('planner_state').select('state').eq('id',1).single(),
      fetch('./assets/images/job/job-icons.json').then(r=>r.ok?r.json():{}).catch(()=>({}))
    ]);
    if(plannerResult.error)throw plannerResult.error;
    roster=Array.isArray(plannerResult.data&&plannerResult.data.state&&plannerResult.data.state.roster)?plannerResult.data.state.roster:[];
    roster=roster.filter(m=>m&&m.id&&m.name&&m.status!=='inactive').sort((a,b)=>String(a.name).localeCompare(String(b.name),undefined,{sensitivity:'base'}));
    iconMap=iconsResult||{};
  }

  function carryStatusControl(reg){
    if(reg.registration_type!=='need_carry')return '—';
    const value=reg.carry_status||'';
    return `<div class="carry-switch" data-reg-id="${esc(reg.id)}">
      <button type="button" data-carry-status="done" class="${value==='done'?'active done':''}">Done</button>
      <button type="button" data-carry-status="cancel" class="${value==='cancel'?'active cancel':''}">Cancel</button>
      <button type="button" data-carry-status="mia" class="${value==='mia'?'active mia':''}">MIA</button>
    </div>`;
  }

  async function loadRuns(){
    const runsPanel=document.getElementById('runsPanel');
    const createPanel=document.getElementById('createPanel');
    const runsList=document.getElementById('runsList');
    const runCount=document.getElementById('runCount');
    if(isOrganizer())createPanel.hidden=false;

    const [runsResult,regsResult]=await Promise.all([
      client.from('guild_runs').select('id,run_type,run_date,run_time,note,status,created_at').order('run_date',{ascending:false}).order('run_time',{ascending:false}),
      client.from('guild_run_registrations').select('id,run_id,member_id,registration_type,carry_status,created_at').order('created_at',{ascending:true})
    ]);
    if(runsResult.error)throw runsResult.error;
    if(regsResult.error)throw regsResult.error;

    const runs=runsResult.data||[];
    const regs=regsResult.data||[];
    runCount.textContent=`${runs.length} run${runs.length===1?'':'s'}`;
    runsList.innerHTML=runs.length?runs.map(run=>{
      const runRegs=regs.filter(r=>r.run_id===run.id);
      const sortedRunRegs=[...runRegs].sort((a,b)=>{
        const aOrder=a.registration_type==='carrier'?0:1;
        const bOrder=b.registration_type==='carrier'?0:1;
        if(aOrder!==bOrder)return aOrder-bOrder;
        const aMember=memberById(a.member_id);
        const bMember=memberById(b.member_id);
        return String(aMember&&aMember.name||'').localeCompare(String(bMember&&bMember.name||''),undefined,{sensitivity:'base'});
      });
      const need=runRegs.filter(r=>r.registration_type==='need_carry').length;
      const carry=runRegs.filter(r=>r.registration_type==='carrier').length;
      const statusText=run.status==='open'?'Open':run.status==='closed'?'Closed':'Ended';
      const statusClass=run.status==='ended'?'ended':run.status;
      const actionControls=run.status==='ended'
        ? ''
        : `<button type="button" class="btn" data-run-toggle="${esc(run.id)}" data-next-status="${run.status==='open'?'closed':'open'}">${run.status==='open'?'Close Registration':'Open Registration'}</button><button type="button" class="btn danger" data-run-end="${esc(run.id)}">End Run</button>`;
      const table=runRegs.length?`<div class="table-wrap"><table><thead><tr><th>Player</th><th>Class</th><th>GR</th><th>Type</th><th>Status</th></tr></thead><tbody>${sortedRunRegs.map(reg=>{const member=memberById(reg.member_id);return `<tr><td>${memberHtml(member)}</td><td>${esc(member&&member.cls||'—')}</td><td>${esc(member&&member.gr!=null?Number(member.gr).toLocaleString():'—')}</td><td>${esc(typeLabel(reg.registration_type))}</td><td>${carryStatusControl(reg)}</td></tr>`;}).join('')}</tbody></table></div>`:'<div class="empty">No registrations yet.</div>';
      const detail=isOrganizer()?`<div class="run-summary"><div class="summary-counts"><span>Need Carry: <b>${need}</b></span><span>Can Carry: <b>${carry}</b></span></div>${table}</div>`:'';
      return `<article class="run-card">
        <div class="run-card-top">
          <div class="run-identity">
            <h3 class="run-type-heading ${run.run_type==='mirage'?'mirage':'time-echo'}">${esc(runLabel(run.run_type))}</h3>
            <span class="status ${esc(statusClass)}">${esc(statusText)}</span>
            <a class="run-public-link" href="./titaniaruns.html" target="_blank" rel="noopener">Open Public Registration</a>
          </div>
          <div class="run-actions">${actionControls}<button type="button" class="btn danger-solid" data-run-delete="${esc(run.id)}" data-run-title="${esc(run.note||runLabel(run.run_type))}">Delete Run</button></div>
        </div>
        <div class="run-edit-row">
          <input class="run-title-input" type="text" maxlength="200" value="${esc(run.note||'')}" placeholder="Untitled Run" data-run-edit="note" data-run-id="${esc(run.id)}">
          <span class="run-picker-wrap"><input class="run-date-input" type="date" value="${esc(run.run_date||'')}" data-run-edit="run_date" data-run-id="${esc(run.id)}">${pickerIcon('date')}</span>
          <span class="run-edit-separator">·</span>
          <span class="run-picker-wrap"><input class="run-time-input" type="time" value="${esc(run.run_time?String(run.run_time).slice(0,5):'')}" data-run-edit="run_time" data-run-id="${esc(run.id)}">${pickerIcon('time')}</span>
          <span class="autosave-state" data-autosave-state="${esc(run.id)}"></span>
        </div>
        ${detail}
      </article>`;
    }).join(''):'<div class="empty">No Guild Runs created yet.</div>';

    runsPanel.hidden=false;
    loading.hidden=true;
    wireRunControls();
  }

  async function saveRunField(input){
    const runId=input.dataset.runId;
    const field=input.dataset.runEdit;
    if(!runId||!field)return;
    const state=document.querySelector(`[data-autosave-state="${runId}"]`);
    const value=field==='run_time'?(input.value||null):field==='note'?input.value.trim():input.value;
    if(state)state.textContent='Saving…';
    const {error}=await client.from('guild_runs').update({[field]:value}).eq('id',runId);
    if(error){if(state)state.textContent='Save failed';showError(error.message||'Could not save run details.');return;}
    if(state)state.textContent='Saved';
    setTimeout(()=>{if(state&&state.textContent==='Saved')state.textContent='';},1200);
  }

  function queueRunSave(input){
    const key=`${input.dataset.runId}:${input.dataset.runEdit}`;
    clearTimeout(saveTimers.get(key));
    saveTimers.set(key,setTimeout(()=>saveRunField(input),450));
  }

  function wireRunControls(){
    document.querySelectorAll('[data-run-toggle]').forEach(button=>button.addEventListener('click',async()=>{
      button.disabled=true;
      const {error}=await client.from('guild_runs').update({status:button.dataset.nextStatus}).eq('id',button.dataset.runToggle);
      if(error){button.disabled=false;showError(error.message||'Could not update registration status.');return;}
      await loadRuns();
    }));

    document.querySelectorAll('[data-run-end]').forEach(button=>button.addEventListener('click',async()=>{
      if(!confirm('End this run? It will no longer appear on the public registration page.'))return;
      button.disabled=true;
      const {error}=await client.from('guild_runs').update({status:'ended'}).eq('id',button.dataset.runEnd);
      if(error){button.disabled=false;showError(error.message||'Could not end run.');return;}
      await loadRuns();
    }));

    document.querySelectorAll('[data-run-delete]').forEach(button=>button.addEventListener('click',async()=>{
      const title=button.dataset.runTitle||'this run';
      let confirmed=false;
      if(window.Swal){
        const result=await Swal.fire({
          title:'Delete this run?',
          text:`${title} and all of its registrations will be permanently deleted.`,
          icon:'warning',
          showCancelButton:true,
          confirmButtonText:'Delete Run',
          cancelButtonText:'Cancel',
          confirmButtonColor:'#ef5a6f',
          cancelButtonColor:'#2a3350',
          background:'#141a2b',
          color:'#e9ecf7'
        });
        confirmed=result.isConfirmed;
      }else{
        confirmed=confirm(`Delete ${title}? This will also delete all registrations for this run.`);
      }
      if(!confirmed)return;

      button.disabled=true;
      const {error}=await client.from('guild_runs').delete().eq('id',button.dataset.runDelete);
      if(error){button.disabled=false;showError(error.message||'Could not delete run.');return;}

      if(window.Swal){
        await Swal.fire({
          title:'Run deleted',
          icon:'success',
          timer:1200,
          showConfirmButton:false,
          background:'#141a2b',
          color:'#e9ecf7'
        });
      }
      await loadRuns();
    }));

    document.querySelectorAll('[data-run-edit]').forEach(input=>{
      input.addEventListener(input.type==='text'?'input':'change',()=>queueRunSave(input));
    });

    document.querySelectorAll('.carry-switch [data-carry-status]').forEach(button=>button.addEventListener('click',async()=>{
      const wrap=button.closest('.carry-switch');
      if(!wrap)return;
      wrap.querySelectorAll('button').forEach(b=>b.disabled=true);
      const {error}=await client.from('guild_run_registrations').update({carry_status:button.dataset.carryStatus}).eq('id',wrap.dataset.regId);
      if(error){wrap.querySelectorAll('button').forEach(b=>b.disabled=false);showError(error.message||'Could not update status.');return;}
      await loadRuns();
    }));
  }

  async function createRun(event){
    event.preventDefault();
    clearError();
    const button=event.currentTarget.querySelector('button[type="submit"]');
    const runType=document.getElementById('runType').value;
    const runDate=document.getElementById('runDate').value;
    const runTime=document.getElementById('runTime').value||null;
    const note=document.getElementById('runNote').value.trim();
    if(!runDate)return;
    button.disabled=true;button.textContent='Creating…';
    const {error}=await client.from('guild_runs').insert({run_type:runType,run_date:runDate,run_time:runTime,note,status:'open'});
    button.disabled=false;button.textContent='Create Run';
    if(error){showError(error.message||'Could not create run.');return;}
    document.getElementById('runNote').value='';
    await loadRuns();
  }

  async function boot(){
    try{
      await loadBase();
      if(page==='organizer'){
        const dateInput=document.getElementById('runDate');
        if(dateInput&&!dateInput.value)dateInput.value=new Date().toISOString().slice(0,10);
        const form=document.getElementById('createRunForm');if(form)form.addEventListener('submit',createRun);
        await loadRuns();
      }
    }catch(error){showError(error&&error.message?error.message:'Could not load Guild Runs.');}
  }

  boot();
})();
