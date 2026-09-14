/* Open member names in a dedicated profile tab. */
(function(){
  'use strict';

  let decorateQueued=false;

  function memberIdByName(name){
    try{
      if(typeof state==='undefined'||!state||!Array.isArray(state.roster))return '';
      const found=state.roster.find(member=>String(member&&member.name||'')===name);
      return found?String(found.id||''):'';
    }catch(_e){
      return '';
    }
  }

  function decorateNode(node){
    if(!node||node.tagName==='A')return;
    const name=String(node.textContent||'').trim();
    const memberId=memberIdByName(name);
    if(!memberId)return;

    const link=document.createElement('a');
    link.className=node.className;
    if(node.closest('.att-member-main'))link.classList.add('att-member-profile');
    link.textContent=node.textContent;
    link.title=`View ${name} profile in a new tab`;
    link.href=`./member.html?id=${encodeURIComponent(memberId)}`;
    link.target='_blank';
    link.rel='noopener';
    node.replaceWith(link);
  }

  function decorate(){
    decorateQueued=false;

    document.querySelectorAll('#dashManageTable .dash-manage-name').forEach(decorateNode);
    document.querySelectorAll('.dash-gr-rank-grid .dash-bar-name').forEach(decorateNode);
    document.querySelectorAll('.att-member-main b').forEach(decorateNode);
  }

  function scheduleDecorate(){
    if(decorateQueued)return;
    decorateQueued=true;
    if(typeof requestAnimationFrame==='function')requestAnimationFrame(decorate);
    else setTimeout(decorate,0);
  }

  function boot(){
    const style=document.createElement('style');
    style.textContent=`
      a.dash-manage-name,
      .dash-gr-rank-grid a.dash-bar-name,
      .att-member-main a.att-member-profile{
        color:inherit;
        text-decoration:none;
        cursor:pointer;
        font-weight:700;
        transition:color .15s ease,text-decoration-color .15s ease;
      }
      a.dash-manage-name:hover,
      .dash-gr-rank-grid a.dash-bar-name:hover,
      .att-member-main a.att-member-profile:hover{
        color:var(--violet);
        text-decoration:underline;
        text-underline-offset:3px;
      }
    `;
    document.head.appendChild(style);

    const observer=new MutationObserver(scheduleDecorate);
    observer.observe(document.body,{subtree:true,childList:true});
    scheduleDecorate();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
