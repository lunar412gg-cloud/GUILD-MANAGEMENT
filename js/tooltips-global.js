(function TitaniaTooltips(){
  'use strict';

  let activeTarget=null;
  let tooltip=null;
  let hideTimer=null;

  function prepareElement(el){
    if(!(el instanceof Element))return;
    const title=el.getAttribute('title');
    if(title&&title.trim()){
      if(!el.dataset.titaniaTooltip)el.dataset.titaniaTooltip=title.trim();
      el.removeAttribute('title');
    }
    if(el.dataset.starTooltip&&!el.dataset.titaniaTooltip){
      el.dataset.titaniaTooltip=el.dataset.starTooltip;
    }
  }

  function prepareTree(root){
    if(!(root instanceof Element))return;
    prepareElement(root);
    root.querySelectorAll('[title],[data-star-tooltip]').forEach(prepareElement);
  }

  function ensureTooltip(){
    if(tooltip)return tooltip;
    tooltip=document.createElement('div');
    tooltip.className='titania-tooltip';
    tooltip.setAttribute('role','tooltip');
    tooltip.innerHTML='<div class="titania-tooltip-arrow"></div><div class="titania-tooltip-inner"></div>';
    document.body.appendChild(tooltip);
    return tooltip;
  }

  function positionTooltip(target){
    if(!tooltip||!target)return;
    const rect=target.getBoundingClientRect();
    const tipRect=tooltip.getBoundingClientRect();
    const gap=8;
    let placement='top';
    let top=rect.top-tipRect.height-gap;

    if(top<4){
      placement='bottom';
      top=rect.bottom+gap;
    }

    let left=rect.left+(rect.width-tipRect.width)/2;
    left=Math.max(4,Math.min(left,window.innerWidth-tipRect.width-4));

    tooltip.dataset.placement=placement;
    tooltip.style.left=`${Math.round(left)}px`;
    tooltip.style.top=`${Math.round(top)}px`;
  }

  function show(target){
    if(!(target instanceof Element))return;
    const text=String(target.dataset.titaniaTooltip||target.dataset.starTooltip||'').trim();
    if(!text)return;

    if(hideTimer){clearTimeout(hideTimer);hideTimer=null;}
    activeTarget=target;
    const tip=ensureTooltip();
    tip.querySelector('.titania-tooltip-inner').textContent=text;
    tip.classList.remove('show');
    positionTooltip(target);
    requestAnimationFrame(()=>{
      if(activeTarget===target){
        positionTooltip(target);
        tip.classList.add('show');
      }
    });
  }

  function hide(target){
    if(target&&activeTarget!==target)return;
    activeTarget=null;
    if(!tooltip)return;
    tooltip.classList.remove('show');
    hideTimer=setTimeout(()=>{
      if(tooltip&&!activeTarget){
        tooltip.remove();
        tooltip=null;
      }
      hideTimer=null;
    },160);
  }

  function tooltipTarget(node){
    return node instanceof Element?node.closest('[data-titania-tooltip],[data-star-tooltip]'):null;
  }

  function bind(){
    document.addEventListener('mouseover',event=>{
      const target=tooltipTarget(event.target);
      if(!target)return;
      if(event.relatedTarget&&target.contains(event.relatedTarget))return;
      show(target);
    },true);

    document.addEventListener('mouseout',event=>{
      const target=tooltipTarget(event.target);
      if(!target)return;
      if(event.relatedTarget&&target.contains(event.relatedTarget))return;
      hide(target);
    },true);

    document.addEventListener('focusin',event=>{
      const target=tooltipTarget(event.target);
      if(target)show(target);
    },true);

    document.addEventListener('focusout',event=>{
      const target=tooltipTarget(event.target);
      if(target)hide(target);
    },true);

    document.addEventListener('mousedown',()=>hide(),true);
    window.addEventListener('scroll',()=>hide(),true);
    window.addEventListener('resize',()=>hide());
  }

  function boot(){
    prepareTree(document.documentElement);

    const observer=new MutationObserver(records=>{
      for(const record of records){
        if(record.type==='attributes'){
          prepareElement(record.target);
          continue;
        }
        for(const node of record.addedNodes){
          if(node instanceof Element)prepareTree(node);
        }
      }
    });

    observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['title','data-star-tooltip']});
    bind();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
