(function TitaniaUserManagementLink(){
  'use strict';

  if(!(/\/$|\/index\.html$/i.test(location.pathname)))return;

  function wire(){
    const button=document.getElementById('adminUsersBtn');
    if(!button||button.dataset.userManagementPage==='1')return;
    button.dataset.userManagementPage='1';
    button.addEventListener('click',event=>{
      event.preventDefault();
      event.stopImmediatePropagation();
      location.href='./users.html';
    },true);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',wire,{once:true});
  else wire();
})();
