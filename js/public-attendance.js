/* Read-only pre-attendance for published Guild League / Siege pages. */
(function(){
  'use strict';

  const STATUS={
    no_response:{label:'?',className:'pre-no-response'},
    going:{label:'✓',className:'pre-going'},
    not_going:{label:'✕',className:'pre-not-going'}
  };

  let cachedSignature='';
  let statusByName=new Map();
  let loading=false;
  let queued=false;

  function isSupported(){
    const view=document.body&&document.body.dataset?document.body.dataset.view:'';
    return view==='guild'||view==='siege';
  }

  function cfgClient(){
    if(typeof client!=='undefined'&&client)return client;
    const cfg=window.TITANIA_CONFIG||{};
    const url=cfg.supabaseUrl||cfg.SUPABASE_URL;
    const key=cfg.supabasePublishableKey||cfg.SUPABASE_PUBLISHABLE_KEY;
    if(!url||!key||!window.supabase)return null;
    return window.supabase.createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  }

  async function load(force){
    if(!isSupported()||loading)return;
    loading=true;
    try{
      const c=cfgClient();if(!c)return;
      const view=document.body.dataset.view;
      const {data,error}=await c.rpc('get_public_lineup',{p_view:view});
      if(error)throw error;
      if(!data||data.published!==true){statusByName=new Map();cachedSignature='';scheduleDecorate();return;}
      const signature=`${data.attendanceEventType||''}:${data.attendanceEventDate||''}:${JSON.stringify(data.preAttendance||{})}`;
      if(!force&&signature===cachedSignature){scheduleDecorate();return;}
      cachedSignature=signature;
      statusByName=new Map();
      const rows=data.preAttendance&&typeof data.preAttendance==='object'?data.preAttendance:{};
      Object.entries(rows).forEach(([name,status])=>statusByName.set(String(name),STATUS[status]?status:'no_response'));
      scheduleDecorate();
    }catch(error){
      console.warn('Public pre-attendance unavailable',error);
    }finally{
      loading=false;
    }
  }

  function scheduleDecorate(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;decorate();});
  }

  function decorate(){
    if(!isSupported())return;
    document.querySelectorAll('.slot .member-name').forEach(nameEl=>{
      const name=nameEl.textContent.trim();
      if(!name)return;
      const member=nameEl.closest('.member')||nameEl.parentElement;
      if(!member)return;

      /* The public page already renders one badge. Reuse it instead of creating a duplicate. */
      let badge=member.querySelector(':scope > .public-pre-attendance');

      /* Clean up badges created by older versions of this script. */
      const oldRow=nameEl.closest('.member-name-row');
      if(oldRow){
        oldRow.querySelectorAll('.public-pre-attendance').forEach(oldBadge=>oldBadge.remove());
        if(oldRow.parentNode){
          oldRow.parentNode.insertBefore(nameEl,oldRow);
          oldRow.remove();
        }
      }

      if(!badge){
        badge=document.createElement('span');
        badge.className='public-pre-attendance pre-no-response';
        nameEl.insertAdjacentElement('afterend',badge);
      }

      const status=statusByName.get(name)||'no_response';
      const meta=STATUS[status];
      badge.className=`public-pre-attendance ${meta.className}`;
      badge.textContent=meta.label;
      badge.title=`Pre-attendance: ${status==='going'?'Going':status==='not_going'?'Not Going':'No Response'}`;
      badge.setAttribute('aria-label',badge.title);
    });
  }

  function boot(){
    if(!isSupported())return;
    const content=document.getElementById('content')||document.body;
    const observer=new MutationObserver(()=>scheduleDecorate());
    observer.observe(content,{childList:true,subtree:true});
    load(true);
    setInterval(()=>load(false),60000);
    const refresh=document.getElementById('refreshBtn');
    if(refresh)refresh.addEventListener('click',()=>setTimeout(()=>load(true),400));
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
