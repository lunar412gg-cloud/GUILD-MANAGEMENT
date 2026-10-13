/* Public Siege page label override. */
(function TitaniaSiegePolarityLabel(){
  'use strict';
  if(!/\/siege\.html$/i.test(location.pathname))return;

  function apply(){
    document.title='Titania · Siege/Polarity';

    const navLink=document.querySelector('.nav a[href$="siege.html"]');
    if(navLink&&navLink.textContent.trim()!=='🏰 Siege/Polarity'){
      navLink.textContent='🏰 Siege/Polarity';
    }

    const heading=document.querySelector('.sheet-brand');
    if(heading&&heading.textContent.trim()!=='Siege/Polarity'){
      heading.textContent='Siege/Polarity';
    }
  }

  function boot(){
    apply();
    const content=document.getElementById('content');
    if(content){
      new MutationObserver(apply).observe(content,{childList:true,subtree:true});
    }
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
