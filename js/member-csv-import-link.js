/* Members page: choose a Titania roster CSV, then review it on a dedicated page. */
(function TitaniaMemberCsvImportLink(){
  'use strict';
  if(!(/\/$|\/index\.html$/i.test(location.pathname)))return;

  const STORAGE_KEY='titania_member_csv_import_v1';

  function canImport(){
    try{return Boolean(typeof userCanEdit==='function'&&userCanEdit());}catch(_e){return false;}
  }

  function onMembersPage(){
    return document.body.dataset.event==='manage_members';
  }

  function ensureStyle(){
    if(document.getElementById('member-csv-import-link-style'))return;
    const style=document.createElement('style');
    style.id='member-csv-import-link-style';
    style.textContent=`
      .member-csv-import-action{margin-left:auto;display:flex;align-items:center;gap:8px}
      @media(max-width:720px){.member-csv-import-action{width:100%;margin-left:0}.member-csv-import-action .btn{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function ensureFileInput(){
    let input=document.getElementById('memberCsvImportInput');
    if(input)return input;
    input=document.createElement('input');
    input.type='file';
    input.id='memberCsvImportInput';
    input.accept='.csv,text/csv';
    input.hidden=true;
    document.body.appendChild(input);
    input.addEventListener('change',handleFile);
    return input;
  }

  function findHeader(){
    const wrap=document.getElementById('teamsWrap');
    if(!wrap)return null;
    return [...wrap.querySelectorAll('.section-head')].find(head=>/manage members/i.test(head.textContent||''))||null;
  }

  function ensureButton(){
    if(!onMembersPage()||!canImport())return;
    const head=findHeader();
    if(!head||head.querySelector('[data-member-csv-import]'))return;
    const action=document.createElement('div');
    action.className='member-csv-import-action';
    action.innerHTML='<button type="button" class="btn small" data-member-csv-import><i class="fa-solid fa-file-csv mr-2" aria-hidden="true"></i>Upload Member CSV</button>';
    action.querySelector('button').addEventListener('click',()=>{
      const input=ensureFileInput();
      input.value='';
      input.click();
    });
    head.appendChild(action);
  }

  function openMembersFromHash(){
    if(location.hash!=='#members')return;
    const tab=document.querySelector('.event-tab[data-event="manage_members"]');
    if(tab&&document.body.dataset.event!=='manage_members')tab.click();
  }

  async function handleFile(event){
    const file=event.target.files&&event.target.files[0];
    if(!file)return;
    if(!/\.csv$/i.test(file.name)){
      if(window.Swal)await Swal.fire({icon:'error',title:'CSV file required',text:'Choose a .csv member export.'});
      else alert('Choose a .csv member export.');
      return;
    }
    try{
      const raw=await file.text();
      if(!raw.trim())throw new Error('The CSV file is empty.');
      sessionStorage.setItem(STORAGE_KEY,JSON.stringify({name:file.name,raw,loadedAt:new Date().toISOString()}));
      location.href='./member-import-preview.html';
    }catch(error){
      const message=String(error&&error.message||error||'Could not read this CSV file.');
      if(window.Swal)await Swal.fire({icon:'error',title:'Could not read CSV',text:message});
      else alert(message);
    }
  }

  function boot(){
    ensureStyle();
    ensureFileInput();
    const wrap=document.getElementById('teamsWrap');
    if(wrap)new MutationObserver(ensureButton).observe(wrap,{childList:true});
    new MutationObserver(ensureButton).observe(document.body,{attributes:true,attributeFilter:['data-event']});
    document.addEventListener('click',event=>{
      if(event.target.closest('.event-tab'))setTimeout(ensureButton,0);
    });
    setTimeout(()=>{openMembersFromHash();ensureButton();},0);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
