(function TitaniaPartyStars(){
  'use strict';

  const MAX_STARS=10;
  const TABLE='party_star_selections';
  const EVENT_KEY='siege';
  let client=null;
  let selected=new Set();
  let loading=false;
  let queued=false;

  function isManagement(){return /\/$|\/index\.html$/i.test(location.pathname);}
  function isPublicSiege(){return /\/siege\.html$/i.test(location.pathname);}
  function isSiegeManagement(){
    if(!isManagement())return false;
    try{return typeof currentEvent!=='undefined'&&currentEvent==='siege';}catch(_e){return false;}
  }

  function getClient(){
    if(client)return client;
    try{if(typeof supabaseClient!=='undefined'&&supabaseClient)return client=supabaseClient;}catch(_e){}
    const cfg=window.TITANIA_CONFIG||{};
    if(window.supabase&&cfg.supabaseUrl&&cfg.supabasePublishableKey){
      client=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
    }
    return client;
  }

  function canEdit(){
    if(!isSiegeManagement())return false;
    try{return typeof userCanEdit==='function'&&userCanEdit();}catch(_e){return false;}
  }

  function ensureStyle(){
    if(document.getElementById('party-star-style'))return;
    const el=document.createElement('style');
    el.id='party-star-style';
    el.textContent=`
      .party-star-toggle{appearance:none;border:1px solid #7f879f;background:#1a2032;color:#8d95aa;width:25px;height:25px;padding:0;border-radius:7px;display:inline-flex;align-items:center;justify-content:center;font-size:17px;line-height:1;cursor:pointer;transition:.15s;flex:none}
      .party-star-toggle:hover{border-color:#f0b429;color:#f0b429;transform:translateY(-1px)}
      .party-star-toggle.on{background:#3a2b09;border-color:#f0b429;color:#ffd34d;box-shadow:0 0 10px #f0b42944}
      .party-star-toggle:disabled{cursor:default;opacity:.75;transform:none}
      .party-star-public{display:inline-flex;align-items:center;justify-content:center;color:#ffd34d;font-size:18px;line-height:1;filter:drop-shadow(0 0 5px #f0b42988);margin-left:6px;vertical-align:middle}
      .party-star-counter{font:700 11px/1 'IBM Plex Mono',monospace;color:#d9ad33;border:1px solid #6d5720;background:#241d0d;border-radius:999px;padding:5px 8px;white-space:nowrap}
      .team-card.party-starred{border-color:#9a7625!important;box-shadow:0 0 0 1px #f0b42944,0 0 18px #f0b42912}
      .team-name.party-star-name{gap:7px!important}
    `;
    document.head.appendChild(el);
  }

  function clearManagementDecorations(){
    document.querySelectorAll('.party-star-toggle').forEach(node=>node.remove());
    document.querySelectorAll('.team-card.party-starred').forEach(card=>card.classList.remove('party-starred'));
    document.querySelectorAll('.team-name.party-star-name').forEach(name=>name.classList.remove('party-star-name'));
    const counter=document.getElementById('partyStarCounter');
    if(counter)counter.remove();
  }

  function managementCards(){return [...document.querySelectorAll('.team-card[data-team-key]')];}

  function siegePublicPairs(){
    let keys=[];
    try{
      if(typeof currentSiegeRaids==='function')keys=currentSiegeRaids().flatMap(raid=>raid.keys||[]);
    }catch(_e){}
    if(!keys.length){
      keys=[...Array.from({length:12},(_,i)=>`siege_main_${i+1}`),...Array.from({length:8},(_,i)=>`siege_sub_${i+1}`)];
    }
    const cards=[...document.querySelectorAll('.team-card')];
    return cards.map((card,index)=>({card,key:keys[index]||''})).filter(item=>item.key);
  }

  function updateCounter(){
    if(!isSiegeManagement())return;
    const main=document.querySelector('.main');
    if(!main)return;
    let counter=document.getElementById('partyStarCounter');
    if(!counter){
      counter=document.createElement('span');
      counter.id='partyStarCounter';
      counter.className='party-star-counter';
      const hint=document.querySelector('.hint-bar');
      if(hint)hint.appendChild(counter);else main.prepend(counter);
    }
    counter.textContent=`${selected.size}/${MAX_STARS} Star parties`;
    counter.title=`Maximum ${MAX_STARS} Siege parties can be marked for Star`;
  }

  function decorateManagement(){
    if(!isSiegeManagement()){
      clearManagementDecorations();
      return;
    }
    managementCards().forEach(card=>{
      const key=card.dataset.teamKey||'';
      if(!/^siege_(main|sub)_\d+$/.test(key))return;
      const name=card.querySelector('.team-name');
      if(!name)return;
      name.classList.add('party-star-name');
      let button=name.querySelector('.party-star-toggle');
      if(!button){
        button=document.createElement('button');
        button.type='button';
        button.className='party-star-toggle';
        button.textContent='★';
        button.dataset.partyStarKey=key;
        button.dataset.starTooltip='Star Dungeon';
        button.setAttribute('aria-label','Star Dungeon');
        name.appendChild(button);
      }
      const on=selected.has(key);
      button.classList.toggle('on',on);
      button.setAttribute('aria-pressed',on?'true':'false');
      button.removeAttribute('title');
      button.dataset.starTooltip='Star Dungeon';
      button.disabled=!canEdit();
      card.classList.toggle('party-starred',on);
    });
    updateCounter();
  }

  function decoratePublic(){
    if(!isPublicSiege())return;
    siegePublicPairs().forEach(({card,key})=>{
      const name=card.querySelector('.team-name');
      if(!name)return;
      const on=selected.has(key);
      card.classList.toggle('party-starred',on);
      let star=name.querySelector('.party-star-public');
      if(on&&!star){
        star=document.createElement('span');
        star.className='party-star-public';
        star.textContent='★';
        star.dataset.starTooltip='Star Dungeon';
        star.setAttribute('aria-label','Star Dungeon');
        name.appendChild(star);
      }else if(on&&star){
        star.removeAttribute('title');
        star.dataset.starTooltip='Star Dungeon';
        star.setAttribute('aria-label','Star Dungeon');
      }else if(!on&&star){
        star.remove();
      }
    });
  }

  function decorate(){
    queued=false;
    if(isManagement())decorateManagement();
    if(isPublicSiege())decoratePublic();
  }

  function schedule(){
    if(queued)return;
    queued=true;
    if(window.requestAnimationFrame)requestAnimationFrame(decorate);else setTimeout(decorate,0);
  }

  async function loadSelections(){
    if(!(isSiegeManagement()||isPublicSiege())){
      if(isManagement())clearManagementDecorations();
      return;
    }
    if(loading)return;
    const c=getClient();
    if(!c)return;
    loading=true;
    try{
      const {data,error}=await c.from(TABLE).select('team_key').eq('event_key',EVENT_KEY);
      if(error)throw error;
      selected=new Set((data||[]).map(row=>String(row.team_key||'')).filter(Boolean));
      schedule();
    }catch(error){
      console.warn('[Titania] Could not load Siege Star parties:',error);
    }finally{loading=false;}
  }

  async function toggle(key){
    if(!canEdit()||!/^siege_(main|sub)_\d+$/.test(key))return;
    const c=getClient();if(!c)return;
    const on=selected.has(key);
    if(!on&&selected.size>=MAX_STARS){
      try{if(typeof showToast==='function')showToast('Star Party limit',`You can only mark ${MAX_STARS} Siege parties for Star.`,'warn');else alert(`Maximum ${MAX_STARS} Star parties.`);}catch(_e){}
      return;
    }
    const before=new Set(selected);
    if(on)selected.delete(key);else selected.add(key);
    schedule();
    try{
      const result=on
        ?await c.from(TABLE).delete().eq('event_key',EVENT_KEY).eq('team_key',key)
        :await c.from(TABLE).insert({event_key:EVENT_KEY,team_key:key});
      if(result.error)throw result.error;
      try{if(typeof touchEventUpdate==='function')touchEventUpdate('siege');}catch(_e){}
      try{if(typeof queueSave==='function')queueSave();}catch(_e){}
      try{if(typeof showToast==='function')showToast(on?'Star removed':'Star Party selected',on?'Party is no longer marked for Star.':`${selected.size}/${MAX_STARS} Siege parties selected for Star.`);}catch(_e){}
    }catch(error){
      selected=before;schedule();
      const msg=String(error&&error.message||error||'Save failed');
      try{if(typeof showToast==='function')showToast('Star Party save failed',msg.includes('PARTY_STAR_LIMIT')?`Maximum ${MAX_STARS} parties can be selected.`:msg,'err');}catch(_e){}
    }
  }

  function bind(){
    document.addEventListener('click',event=>{
      const button=event.target.closest('.party-star-toggle');
      if(!button)return;
      event.preventDefault();event.stopPropagation();
      toggle(button.dataset.partyStarKey||'');
    },true);

    let lastManagementMode=isSiegeManagement();
    const observer=new MutationObserver(()=>{
      const now=isSiegeManagement();
      if(now!==lastManagementMode){
        lastManagementMode=now;
        if(now)loadSelections();else clearManagementDecorations();
      }
      schedule();
    });
    observer.observe(document.body,{subtree:true,childList:true});

    window.addEventListener('focus',loadSelections);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)loadSelections();});
  }

  function boot(){
    if(!(isManagement()||isPublicSiege()))return;
    ensureStyle();bind();loadSelections();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
