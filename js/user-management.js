(function TitaniaUserManagement(){
  'use strict';

  const cfg=window.TITANIA_CONFIG||{};
  const loading=document.getElementById('loading');
  const errorBox=document.getElementById('error');
  const list=document.getElementById('usersList');
  const count=document.getElementById('userCount');
  const refreshBtn=document.getElementById('refreshBtn');
  let client=null;
  let currentUserId='';

  const ROLE_OPTIONS=[
    ['pending','Pending'],
    ['viewer','Viewer'],
    ['attendance_auditor','Attendance Auditor'],
    ['party_organizer','Party Organizer'],
    ['admin','Admin']
  ];

  function esc(v){return String(v==null?'':v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}

  function maskEmail(email){
    const value=String(email||'').trim();
    const at=value.indexOf('@');
    if(at<=0)return value||'—';
    const local=value.slice(0,at);
    const domain=value.slice(at+1);
    const visible=local.slice(0,Math.min(3,local.length));
    return `${visible}${'*'.repeat(Math.max(4,local.length-visible.length))}@${domain}`;
  }

  function showError(message){
    loading.hidden=true;
    list.hidden=true;
    errorBox.hidden=false;
    errorBox.textContent=message;
  }

  function roleOptions(selected){
    return ROLE_OPTIONS.map(([value,label])=>`<option value="${value}" ${value===selected?'selected':''}>${label}</option>`).join('');
  }

  function renderUsers(rows){
    const sorted=[...rows].sort((a,b)=>{
      const ap=a.role==='pending'?0:1;
      const bp=b.role==='pending'?0:1;
      if(ap!==bp)return ap-bp;
      return String(a.display_name||a.email||'').localeCompare(String(b.display_name||b.email||''),undefined,{sensitivity:'base'});
    });

    list.innerHTML=sorted.map(profile=>{
      const self=profile.id===currentUserId;
      const pending=profile.role==='pending';
      return `<div class="user-row${self?' self':''}" data-user-id="${esc(profile.id)}" data-user-name="${esc(profile.display_name||'Unnamed user')}">
        <div class="user-ident">
          <div class="user-name">${esc(profile.display_name||'Unnamed user')}${self?' <span class="you">· You</span>':''}${pending?' <span class="pending-badge">Pending</span>':''}</div>
          <div class="user-email">${esc(maskEmail(profile.email||''))}</div>
        </div>
        <select class="role-select" data-role ${self?'disabled':''}>${roleOptions(profile.role||'pending')}</select>
        <label class="approved"><input type="checkbox" data-approved ${profile.approved?'checked':''} ${self?'disabled':''}> Approved</label>
        <div class="user-actions">
          <button class="save-btn" data-save type="button" ${self?'disabled':''}><i class="fa-solid fa-floppy-disk mr-2" aria-hidden="true"></i>Save</button>
          <button class="delete-btn" data-delete type="button" ${self?'disabled title="You cannot delete your own account."':''}><i class="fa-solid fa-trash-can mr-2" aria-hidden="true"></i>Delete</button>
        </div>
      </div>`;
    }).join('');

    count.textContent=`${sorted.length} user${sorted.length===1?'':'s'}`;
    loading.hidden=true;
    errorBox.hidden=true;
    list.hidden=false;
  }

  async function loadUsers(){
    if(!client)return;
    loading.hidden=false;
    loading.textContent='Loading users…';
    errorBox.hidden=true;
    list.hidden=true;
    refreshBtn.disabled=true;

    const {data,error}=await client.from('profiles').select('id,email,display_name,role,approved,created_at').order('created_at',{ascending:true});
    refreshBtn.disabled=false;
    if(error){showError(error.message||'Could not load users.');return;}
    renderUsers(data||[]);
  }

  async function saveUser(row,button){
    const userId=row.dataset.userId||'';
    if(!userId||userId===currentUserId)return;
    const role=row.querySelector('[data-role]').value;
    const approved=row.querySelector('[data-approved]').checked;
    button.disabled=true;
    button.innerHTML='<i class="fa-solid fa-spinner fa-spin mr-2" aria-hidden="true"></i>Saving';

    const {error}=await client.from('profiles').update({role,approved}).eq('id',userId);
    if(error){
      button.disabled=false;
      button.innerHTML='<i class="fa-solid fa-floppy-disk mr-2" aria-hidden="true"></i>Save';
      alert(error.message||'Could not save user access.');
      return;
    }

    button.innerHTML='<i class="fa-solid fa-check mr-2" aria-hidden="true"></i>Saved';
    button.classList.add('saved');
    setTimeout(()=>{
      button.classList.remove('saved');
      button.innerHTML='<i class="fa-solid fa-floppy-disk mr-2" aria-hidden="true"></i>Save';
      button.disabled=false;
    },1000);
  }

  async function deleteUser(row,button){
    const userId=row.dataset.userId||'';
    if(!userId||userId===currentUserId)return;
    const name=row.dataset.userName||'this user';
    if(!window.Swal){
      alert('SweetAlert2 did not load. User was not deleted. Refresh the page and try again.');
      return;
    }

    const result=await Swal.fire({
      title:'Delete this user?',
      html:`<b>${esc(name)}</b><br><br>This permanently removes the Titania login and profile.`,
      icon:'warning',
      showCancelButton:true,
      confirmButtonText:'Delete User',
      cancelButtonText:'Cancel',
      reverseButtons:true,
      focusCancel:true,
      confirmButtonColor:'#ef5a6f',
      cancelButtonColor:'#2a3350',
      background:'#141a2b',
      color:'#e9ecf7'
    });
    if(!result.isConfirmed)return;

    const controls=row.querySelectorAll('button,select,input');
    controls.forEach(control=>control.disabled=true);
    button.innerHTML='<i class="fa-solid fa-spinner fa-spin mr-2" aria-hidden="true"></i>Deleting';

    const {error}=await client.rpc('admin_delete_titania_user',{p_user_id:userId});
    if(error){
      controls.forEach(control=>control.disabled=false);
      button.innerHTML='<i class="fa-solid fa-trash-can mr-2" aria-hidden="true"></i>Delete';
      await Swal.fire({title:'Delete failed',text:error.message||'Could not delete user.',icon:'error',background:'#141a2b',color:'#e9ecf7'});
      return;
    }

    row.remove();
    const remaining=list.querySelectorAll('.user-row').length;
    count.textContent=`${remaining} user${remaining===1?'':'s'}`;
    await Swal.fire({title:'User deleted',icon:'success',timer:1100,showConfirmButton:false,background:'#141a2b',color:'#e9ecf7'});
  }

  async function boot(){
    if(!window.supabase||!cfg.supabaseUrl||!cfg.supabasePublishableKey){showError('Supabase configuration is missing.');return;}
    client=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});

    const userResult=await client.auth.getUser();
    const user=userResult.data&&userResult.data.user;
    if(userResult.error||!user){showError('Sign in to Titania first.');return;}
    currentUserId=user.id;

    const profileResult=await client.from('profiles').select('role,approved').eq('id',currentUserId).single();
    if(profileResult.error||!profileResult.data||!profileResult.data.approved||profileResult.data.role!=='admin'){
      showError('Admin access is required to manage users.');
      return;
    }

    await loadUsers();
  }

  refreshBtn.addEventListener('click',loadUsers);
  list.addEventListener('click',event=>{
    const saveButton=event.target.closest('[data-save]');
    const deleteButton=event.target.closest('[data-delete]');
    const button=saveButton||deleteButton;
    if(!button)return;
    const row=button.closest('.user-row');
    if(!row)return;
    if(saveButton)saveUser(row,saveButton);
    else deleteUser(row,deleteButton);
  });

  boot();
})();
