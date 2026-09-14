/* Manage the 30 reusable party templates. */
(function TitaniaPartyManager(){
  'use strict';

  const cfg=window.TITANIA_CONFIG||{};
  const grid=document.getElementById('partyGrid');
  const stateBox=document.getElementById('state');
  const summary=document.getElementById('summary');
  let client=null;
  let roster=[];
  let parties=[];
  let canEdit=false;
  let iconMap={};

  function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function active(member){return member&&member.status!=='inactive';}
  function memberById(id){return roster.find(member=>String(member.id)===String(id));}
  function iconFor(member){const file=iconMap[member&&member.cls];return file?`./assets/images/job/${encodeURIComponent(file)}`:'';}

  async function boot(){
    if(!window.supabase||!cfg.supabaseUrl||!cfg.supabasePublishableKey){fail('Supabase configuration is missing.');return;}
    client=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});

    const userResult=await client.auth.getUser();
    const user=userResult.data&&userResult.data.user;
    if(userResult.error||!user){fail('Sign in to Titania first.');return;}

    const profileResult=await client.from('profiles').select('role,approved').eq('id',user.id).single();
    const profile=profileResult.data;
    if(profileResult.error||!profile||!profile.approved){fail('Approved Titania access is required.');return;}
    canEdit=['party_organizer','admin'].includes(profile.role);

    const [plannerResult,partyResult,iconsResult]=await Promise.all([
      client.from('planner_state').select('state').eq('id',1).single(),
      client.from('party_templates').select('party_no,member_ids,updated_at').order('party_no',{ascending:true}),
      fetch('./assets/images/job/job-icons.json').then(response=>response.ok?response.json():{}).catch(()=>({}))
    ]);
    if(plannerResult.error){fail(plannerResult.error.message||'Could not load roster.');return;}
    if(partyResult.error){fail(partyResult.error.message||'Could not load parties.');return;}

    roster=((plannerResult.data&&plannerResult.data.state&&plannerResult.data.state.roster)||[]).filter(active).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),undefined,{sensitivity:'base'}));
    parties=partyResult.data||[];
    iconMap=iconsResult||{};
    render();
  }

  function fail(message){
    stateBox.hidden=false;
    stateBox.className='state error';
    stateBox.textContent=message;
    grid.hidden=true;
    summary.textContent='Unavailable';
  }

  function options(selectedId,partyNo,slotNo){
    let html='<option value=""></option>';
    for(const member of roster){
      const id=String(member.id||'');
      html+=`<option value="${esc(id)}"${id===selectedId?' selected':''}>${esc(member.name||'Unnamed')} · ${esc(member.cls||'Unknown')}</option>`;
    }
    return `<select class="party-member-select" data-party="${partyNo}" data-slot="${slotNo}" ${canEdit?'':'disabled'}>${html}</select>`;
  }

  function select2Template(option){
    if(!option.id)return 'Empty slot';
    const member=memberById(option.id);
    if(!member)return option.text;
    const row=document.createElement('span');
    row.className='select2-member';
    const src=iconFor(member);
    if(src){
      const img=document.createElement('img');
      img.src=src;
      img.alt='';
      row.appendChild(img);
    }
    const main=document.createElement('span');
    main.className='select2-member-main';
    const name=document.createElement('span');
    name.className='select2-member-name';
    name.textContent=member.name||'Unnamed';
    const cls=document.createElement('span');
    cls.className='select2-member-class';
    cls.textContent=member.cls||'Unknown';
    main.append(name,cls);
    row.appendChild(main);
    return row;
  }

  function initSelect2(){
    if(!(window.jQuery&&jQuery.fn&&jQuery.fn.select2))return;
    grid.querySelectorAll('.party-member-select').forEach(select=>{
      jQuery(select).select2({
        placeholder:'Empty slot',
        allowClear:true,
        width:'100%',
        templateResult:select2Template,
        templateSelection:select2Template,
        matcher(params,data){
          const term=String(params.term||'').trim().toLowerCase();
          if(!term||!data.id)return data;
          return String(data.text||'').toLowerCase().includes(term)?data:null;
        }
      });
    });
  }

  function render(){
    const byNo=new Map(parties.map(p=>[Number(p.party_no),p]));
    const cards=[];
    for(let n=1;n<=30;n++){
      const party=byNo.get(n)||{party_no:n,member_ids:[]};
      const ids=Array.isArray(party.member_ids)?party.member_ids.slice(0,5):[];
      while(ids.length<5)ids.push('');
      const count=ids.filter(Boolean).length;
      cards.push(`<article class="party-card" data-party-card="${n}">
        <div class="party-head"><h3>Party ${n}</h3><span class="party-count">${count}/5</span></div>
        <div class="party-slots">${ids.map((id,i)=>`<label class="party-slot"><span>${i+1}</span>${options(String(id||''),n,i)}</label>`).join('')}</div>
        <div class="party-actions"><button class="btn primary" type="button" data-save="${n}" ${canEdit?'':'disabled'}><i class="fa-solid fa-floppy-disk mr-2" aria-hidden="true"></i>${canEdit?'Save Party':'Read Only'}</button></div>
      </article>`);
    }
    grid.innerHTML=cards.join('');
    stateBox.hidden=true;
    grid.hidden=false;
    initSelect2();
    updateSummary();

    jQuery(grid).on('change','.party-member-select',function(){
      validateDuplicates();
      updateCount(Number(this.dataset.party));
    });
    grid.addEventListener('click',event=>{
      const button=event.target.closest('[data-save]');
      if(button)saveParty(Number(button.dataset.save),button);
    });
    validateDuplicates();
  }

  function updateCount(partyNo){
    const card=grid.querySelector(`[data-party-card="${partyNo}"]`);
    if(!card)return;
    const count=[...card.querySelectorAll('select')].filter(select=>select.value).length;
    card.querySelector('.party-count').textContent=`${count}/5`;
    updateSummary();
  }

  function selectedIds(){
    return [...grid.querySelectorAll('select')].map(select=>select.value).filter(Boolean);
  }

  function validateDuplicates(){
    const counts=new Map();
    selectedIds().forEach(id=>counts.set(id,(counts.get(id)||0)+1));
    grid.querySelectorAll('.party-slot').forEach(slot=>{
      const select=slot.querySelector('select');
      slot.classList.toggle('duplicate',Boolean(select&&select.value&&counts.get(select.value)>1));
    });
    return [...counts.values()].every(count=>count===1);
  }

  function updateSummary(){
    if(!grid||grid.hidden)return;
    const used=new Set(selectedIds());
    const complete=[...grid.querySelectorAll('.party-card')].filter(card=>[...card.querySelectorAll('select')].every(select=>select.value)).length;
    summary.textContent=`${complete}/30 complete · ${used.size}/${roster.length} active members assigned`;
  }

  async function saveParty(partyNo,button){
    if(!canEdit)return;
    if(!validateDuplicates()){
      alert('A member can only belong to one saved party. Remove the duplicate first.');
      return;
    }
    const card=grid.querySelector(`[data-party-card="${partyNo}"]`);
    if(!card)return;
    const memberIds=[...card.querySelectorAll('select')].map(select=>select.value).filter(Boolean);
    button.disabled=true;
    button.innerHTML='<i class="fa-solid fa-spinner fa-spin mr-2" aria-hidden="true"></i>Saving';
    const result=await client.from('party_templates').upsert({party_no:partyNo,member_ids:memberIds,updated_at:new Date().toISOString()},{onConflict:'party_no'});
    if(result.error){
      button.disabled=false;
      button.innerHTML='<i class="fa-solid fa-floppy-disk mr-2" aria-hidden="true"></i>Save Party';
      alert(result.error.message||'Could not save party.');
      return;
    }
    button.classList.add('saved');
    button.innerHTML='<i class="fa-solid fa-check mr-2" aria-hidden="true"></i>Saved';
    setTimeout(()=>{
      button.classList.remove('saved');
      button.innerHTML='<i class="fa-solid fa-floppy-disk mr-2" aria-hidden="true"></i>Save Party';
      button.disabled=false;
    },900);
  }

  boot();
})();
