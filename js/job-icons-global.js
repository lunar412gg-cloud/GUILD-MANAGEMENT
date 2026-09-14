(function TitaniaGlobalJobIcons(){
  'use strict';

  const ICON_BASE='./assets/images/job/';
  const MAP_URL=`${ICON_BASE}job-icons.json?v=20260905-2`;
  let iconMap={};
  let ready=false;
  let queued=false;

  function text(node){return String(node&&node.textContent||'').trim();}

  function classFromDot(dot){
    const card=dot.closest('.member-card');
    if(card){
      const first=card.querySelector('.m-sub span');
      if(first&&iconMap[text(first)])return text(first);
    }

    const slot=dot.closest('.slot');
    if(slot){
      const cls=slot.querySelector('.slot-class,.job-class');
      if(cls&&iconMap[text(cls)])return text(cls);
    }

    const attendance=dot.closest('.att-member-main');
    if(attendance){
      const info=attendance.querySelector(':scope > div');
      const cls=info&&info.querySelector('span');
      const value=text(cls);
      if(iconMap[value])return value;
    }

    const cb=dot.closest('.cb-row');
    if(cb){
      const cls=cb.querySelector('.cb-name');
      if(cls&&iconMap[text(cls)])return text(cls);
    }

    const manage=dot.closest('.dash-manage-row');
    if(manage){
      const select=manage.querySelector('.dash-row-class');
      const value=String(select&&select.value||'').trim();
      if(iconMap[value])return value;
    }

    const bar=dot.closest('.dash-bar-row');
    if(bar){
      const avg=text(bar.querySelector('.dash-bar-avg'));
      if(iconMap[avg])return avg;
      const name=text(bar.querySelector('.dash-bar-name'));
      if(iconMap[name])return name;
    }

    const parent=dot.parentElement;
    if(parent){
      const candidates=parent.querySelectorAll('.job-class,.slot-class,.cb-name,.dash-bar-avg,.dash-bar-name');
      for(const node of candidates){
        const value=text(node);
        if(iconMap[value])return value;
      }
    }
    return '';
  }

  function decorateDot(dot){
    if(!(dot instanceof HTMLElement))return;
    if(dot.closest('.save-flag'))return;
    const cls=classFromDot(dot);
    if(!cls)return;
    const file=iconMap[cls];
    if(!file)return;
    const url=`${ICON_BASE}${file}`;
    dot.dataset.jobIcon=url;
    dot.dataset.jobClass=cls;
    dot.title=cls;
    dot.setAttribute('aria-label',`${cls} job icon`);
    dot.style.backgroundColor='transparent';
    dot.style.backgroundImage=`url("${url}")`;
    dot.style.backgroundRepeat='no-repeat';
    dot.style.backgroundPosition='center';
    dot.style.backgroundSize='contain';
    dot.style.borderRadius='0';
    dot.style.boxShadow='none';
    dot.style.width=dot.closest('.slot')?'26px':'28px';
    dot.style.height=dot.closest('.slot')?'26px':'28px';
    dot.style.minWidth=dot.style.width;
  }

  function decorate(){
    queued=false;
    if(!ready)return;
    document.querySelectorAll('.class-dot,.slot .dot,.member .dot').forEach(decorateDot);
  }

  function schedule(){
    if(queued)return;
    queued=true;
    if(typeof requestAnimationFrame==='function')requestAnimationFrame(decorate);
    else setTimeout(decorate,0);
  }

  async function boot(){
    try{
      const response=await fetch(MAP_URL,{cache:'force-cache'});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      iconMap=await response.json();
      ready=true;
    }catch(error){
      console.warn('[Titania] Could not load global job icons:',error);
      return;
    }

    const style=document.createElement('style');
    style.textContent=`
      .class-dot[data-job-icon],.slot .dot[data-job-icon],.member .dot[data-job-icon]{
        display:inline-block!important;
        flex:none!important;
        vertical-align:middle;
        image-rendering:auto;
      }
    `;
    document.head.appendChild(style);

    const observer=new MutationObserver(schedule);
    observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['value']});
    document.addEventListener('change',schedule,true);
    schedule();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
