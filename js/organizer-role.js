(function TitaniaAccessRoles(){
  'use strict';

  if(!(/\/$|\/index\.html$/i.test(location.pathname)))return;

  let attendanceAction=false;

  function profileHas(roles){
    try{
      return Boolean(
        typeof currentProfile!=='undefined' &&
        currentProfile &&
        currentProfile.approved &&
        roles.includes(currentProfile.role)
      );
    }catch(_e){return false;}
  }

  function canEditPlanner(){
    return profileHas(['party_organizer','admin']);
  }

  function canManageAttendance(){
    return profileHas(['party_organizer','attendance_auditor','admin']);
  }

  function attendanceContext(){
    return Boolean(document.getElementById('attendancePage')||attendanceAction);
  }

  function canEditCurrentContext(){
    if(canEditPlanner())return true;
    return profileHas(['attendance_auditor'])&&attendanceContext();
  }

  function canPublish(){
    return profileHas(['admin']);
  }

  function isAdmin(){
    return profileHas(['admin']);
  }

  function protectControls(){
    const publish=document.getElementById('publicToggleBtn');
    if(publish){
      const shouldDisable=!canPublish();
      if(publish.disabled!==shouldDisable)publish.disabled=shouldDisable;
      if(shouldDisable&&publish.getAttribute('title')!=='Admin access required to publish or hide public lineups'){
        publish.title='Admin access required to publish or hide public lineups';
      }
    }

    const preReset=document.getElementById('preResetAllBtn');
    if(preReset&&canManageAttendance()&&preReset.disabled)preReset.disabled=false;
  }

  function markAttendanceAction(event){
    const target=event.target instanceof Element?event.target:null;
    if(!target)return;
    if(!target.closest('.pre-attendance-badge,#preResetAllBtn,[data-att-actual],[data-att-note],#attFinishBtn,#attReopenBtn'))return;
    attendanceAction=true;
    setTimeout(()=>{attendanceAction=false;},0);
  }

  function install(){
    try{window.userCanEdit=canEditCurrentContext;}catch(_e){}
    try{window.userCanManageAttendance=canManageAttendance;}catch(_e){}
    try{window.userCanPublish=canPublish;}catch(_e){}
    try{window.userIsAdmin=isAdmin;}catch(_e){}
    protectControls();
  }

  document.addEventListener('pointerdown',markAttendanceAction,true);
  document.addEventListener('click',markAttendanceAction,true);
  install();
  document.addEventListener('DOMContentLoaded',install,{once:true});
  window.addEventListener('focus',install);

  new MutationObserver(protectControls).observe(document.documentElement,{subtree:true,childList:true});
})();
