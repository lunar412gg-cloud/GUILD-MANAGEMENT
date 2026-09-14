/* Shared display icons. No planner state, member text, or database writes. */
(function TitaniaUiIcons(){
  'use strict';

  const icons={
    '\u{1f4ca}':['fa-solid fa-chart-pie','Dashboard'],
    '\u{1f6e0}':['fa-solid fa-users','Members'],
    '\u{1f6e1}':['fa-solid fa-shield-heart','Defend'],
    '\u{1f3f0}':['fa-brands fa-fort-awesome','Siege'],
    '\u26a1':['fa-solid fa-bolt','Auto-fill'],
    '\u{1f464}':['fa-solid fa-user','Account'],
    '\u2699':['fa-solid fa-gear','Settings'],
    '\u{1f5a8}':['fa-solid fa-print','Print'],
    '\u2b07':['fa-solid fa-download','Export'],
    '\u2b06':['fa-solid fa-upload','Import'],
    '\u2715':['fa-solid fa-xmark','Close'],
    '\u270e':['fa-solid fa-pen','Edit'],
    '\u23f8':['fa-solid fa-pause','Mark inactive'],
    '\u2605':['fa-solid fa-star','Star Dungeon'],
    '\u{1f5dd}':['fa-solid fa-key','Normal Dungeon'],
    '\u2705':['fa-solid fa-circle-check','Finished'],
    '\u21ba':['fa-solid fa-rotate-left','Reopen'],
    '\u{1f3c1}':['fa-solid fa-flag-checkered','Mark finished'],
    '\u2694':['fa-solid fa-khanda','Attack'],
    '\u25c8':['fa-solid fa-layer-group','Sub Battlefield'],
    '\u21bb':['fa-solid fa-rotate','Refresh'],
    '\u21b3':['fa-solid fa-share','Sent'],
    '\u26a0':['fa-solid fa-triangle-exclamation','Warning'],
    '\u{1f558}':['fa-solid fa-clock-rotate-left','Membership history'],
    '\u{1f5d1}':['fa-solid fa-trash-can','Delete'],
    '\u265b':['fa-solid fa-crown','Leader'],
    '\u2757':['fa-solid fa-circle-exclamation','Attention'],
    '\u2713':['fa-solid fa-check','Confirmed'],
    '\u263e':['fa-solid fa-moon','Dark theme'],
    '\u2600':['fa-solid fa-sun','Light theme'],
    '\u{1f512}':['fa-solid fa-lock','Private'],
    '\u{1f4dd}':['fa-solid fa-pen-to-square','Edit attendance note'],
    '\u{1f4cb}':['fa-solid fa-list-check','Attendance'],
    '\u25cf':['fa-solid fa-circle','Status'],
    '\u2190':['fa-solid fa-arrow-left','Back'],
    '\u2192':['fa-solid fa-arrow-right','To'],
    '\u2191':['fa-solid fa-arrow-up','Ascending'],
    '\u2193':['fa-solid fa-arrow-down','Descending'],
    '\u283f':['fa-solid fa-grip-vertical','Move party']
  };
  const pattern=new RegExp('['+Object.keys(icons).join('')+']\\ufe0f?','gu');

  // Only authored controls and icon containers, never whole rows or user text.
  const targets=[
    '.section-title','.pz-dungeon-group-title','.print-section-title',
    '.print-toolbar h3','.event-tab','.btn','.icon-btn','.tool-btn','.pill',
    '.viewerbar .nav a','.slot-remove','.raid-mode-toggle','.print-raid-mode','.mode',
    '.no-healer','.team-warn','.print-team-warn','.dungeon-finished-badge','.finished',
    '.team-sent-badge','.party-star-toggle','.party-star-public','.crown','.theme-icon',
    '.team-drag-handle','.unpublished-icon','.att-page-head > div:first-child > span',
    '.att-autosave','.att-btn-icon','.att-pre-pill > b','.att-actual-btn > span',
    '.att-note-btn','.run-status-icon','.toast > span:first-child',
    '.print-slot-row.p-empty > span:first-child','.class-arrow','.member-info-yes',
    '.guide-step > div:last-child','.hint-bar > div'
  ].join(',');
  const protectedText='input,textarea,select,option,[contenteditable],.slot-name,.member-name,.m-name,.dash-manage-name,.history-name,.toast-title,.toast-msg';
  const svgTargets='svg.leader-icon,svg.p-leader-icon,.search-box > svg,.hint-bar > svg';

  const buttonControls='button,[role="button"],a.btn,a.tool-btn,.viewerbar .nav a';

  // Space labelled controls, not icon-only buttons. Reuse the existing redraw scan.
  function spaceButtonIcon(element){
    const button=element.closest(buttonControls);
    if(!button)return;
    const icon=button.querySelector('.fa-solid,.fa-regular,.fa-brands');
    if(!icon)return;
    const target=icon.closest('.theme-icon,.att-btn-icon')||icon;
    target.classList.toggle('mr-2',Boolean(button.textContent.trim()));
  }

  function iconElement(classes){
    const icon=document.createElement('i');
    icon.className=classes+' titania-ui-icon';
    icon.setAttribute('aria-hidden','true');
    return icon;
  }

  function replaceText(node){
    const parent=node.parentElement;
    if(!parent||!parent.matches(targets)||parent.closest(protectedText))return;
    const text=node.nodeValue;
    const matches=[...text.matchAll(pattern)];
    if(!matches.length)return;
    const fragment=document.createDocumentFragment();
    let end=0;
    for(const match of matches){
      fragment.append(document.createTextNode(text.slice(end,match.index)));
      const glyph=match[0].replace(/\ufe0f/g,'');
      const classes=glyph==='\u2694'&&parent.matches('.section-title')?'fa-solid fa-shield-heart':icons[glyph][0];
      fragment.append(iconElement(classes));
      end=match.index+match[0].length;
    }
    fragment.append(document.createTextNode(text.slice(end)));
    node.replaceWith(fragment);
    if(parent.matches('button')&&!parent.textContent.trim()&&!parent.hasAttribute('aria-label')){
      const glyph=matches[0][0].replace(/\ufe0f/g,'');
      parent.setAttribute('aria-label',parent.title||icons[glyph][1]);
    }
  }

  function decorate(element){
    if(element.matches(svgTargets)){
      const classes=element.matches('.search-box > svg')?'fa-solid fa-magnifying-glass':element.matches('.hint-bar > svg')?'fa-solid fa-circle-info':'fa-solid fa-crown';
      const icon=iconElement(classes);
      const oldClasses=element.getAttribute('class');
      if(oldClasses)icon.className+=' '+oldClasses;
      element.replaceWith(icon);
      return;
    }
    // Native controls keep text labels; icon-only help/status controls get FA icons.
    if(element.matches('#helpBtn,.att-pre-pill > b,.att-actual-btn > span')){
      const statusIcons={'?':'fa-solid fa-circle-question','E':'fa-solid fa-calendar-check','\u2014':'fa-solid fa-minus'};
      const classes=statusIcons[element.textContent.trim()];
      if(classes)element.replaceChildren(iconElement(classes));
    }
    if(element.matches('#addMemberBtn,#dashAddMember')&&element.firstChild&&element.firstChild.nodeType===Node.TEXT_NODE){
      const text=element.firstChild;
      if(/^\+\s/.test(text.nodeValue)){
        text.nodeValue=text.nodeValue.replace(/^\+\s/,' ');
        element.prepend(iconElement('fa-solid fa-plus'));
      }
    }
    for(const node of [...element.childNodes])if(node.nodeType===Node.TEXT_NODE)replaceText(node);
  }

  function scan(root){
    if(root.nodeType===Node.TEXT_NODE){
      const parent=root.parentElement;
      if(parent&&parent.matches(targets))decorate(parent);
      if(parent)spaceButtonIcon(parent);
      return;
    }
    if(!(root instanceof Element))return;
    if(root.matches(targets+','+svgTargets))decorate(root);
    root.querySelectorAll(targets+','+svgTargets).forEach(decorate);
    spaceButtonIcon(root);
    root.querySelectorAll(buttonControls).forEach(spaceButtonIcon);
  }

  function boot(){
    scan(document.body);
    // Handle async loads, tab switches, refreshes, and later attendance renders.
    // Only added/changed nodes are visited, and existing FA icons are left alone.
    new MutationObserver(records=>{
      for(const record of records){
        if(record.target instanceof Element)spaceButtonIcon(record.target);
        if(record.type==='characterData')scan(record.target);
        else for(const node of record.addedNodes)scan(node);
      }
    }).observe(document.body,{childList:true,subtree:true,characterData:true});
    window.addEventListener('beforeprint',()=>scan(document.body));
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
