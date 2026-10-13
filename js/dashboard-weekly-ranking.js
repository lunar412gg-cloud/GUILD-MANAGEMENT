/* Dashboard: Top 5 Active Members (Weekly) uses imported Weekly Contribution. */
(function TitaniaDashboardWeeklyRanking(){
  'use strict';
  if(!(/\/$|\/index\.html$/i.test(location.pathname)))return;

  let pending=null;
  let cachedRows=[];
  let cachedUser='';
  let renderQueued=false;

  function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function fmt(value){const n=Number(value||0);return Number.isFinite(n)?Math.round(n).toLocaleString():'0';}
  function currentUserId(){
    try{return currentAuthUser&&currentAuthUser.id?String(currentAuthUser.id):'';}catch(_e){return '';}
  }
  function activeMembers(){
    try{return state&&Array.isArray(state.roster)?state.roster.filter(member=>member&&member.id&&member.status!=='inactive'):[];}catch(_e){return [];}
  }
  function colorFor(cls){
    try{return typeof classColor==='function'?classColor(cls):'var(--muted)';}catch(_e){return 'var(--muted)';}
  }

  async function fetchWeeklyRows(){
    let client;
    try{client=supabaseClient;}catch(_e){client=null;}
    const user=currentUserId();
    if(!client||!user)return [];
    if(cachedUser===user&&cachedRows.length)return cachedRows;
    if(pending)return pending;

    pending=client.from('member_csv_data')
      .select('member_id,weekly_contribution')
      .then(result=>{
        if(result.error)throw result.error;
        cachedUser=user;
        cachedRows=result.data||[];
        return cachedRows;
      })
      .catch(error=>{
        console.warn('[Titania] Weekly Contribution ranking could not load:',error);
        return [];
      })
      .finally(()=>{pending=null;});
    return pending;
  }

  function updateHeaders(wrap){
    const topPanel=wrap.querySelector('.dash-gr-rank-col:first-child .dash-panel');
    const lowPanel=wrap.querySelector('.dash-gr-rank-col:last-child .dash-panel');

    if(topPanel){
      const title=topPanel.querySelector('.dash-card-head h2');
      const subtitle=topPanel.querySelector('.dash-card-head p');
      if(title)title.innerHTML='<i class="fa-solid fa-trophy mr-2" aria-hidden="true"></i>Top 5 Active Members(Weekly)';
      if(subtitle)subtitle.textContent='Ranked by Weekly Contribution - highest first';
    }

    if(lowPanel){
      const title=lowPanel.querySelector('.dash-card-head h2');
      const subtitle=lowPanel.querySelector('.dash-card-head p');
      if(title)title.innerHTML='<i class="fa-solid fa-arrow-trend-down mr-2" aria-hidden="true"></i>Lowest GR Member';
      if(subtitle)subtitle.textContent='Ranked by Gear Rating - lowest first';
    }

    return topPanel;
  }

  function renderTopFive(panel,data){
    if(!panel)return;
    const contributionById=new Map(data.map(row=>[String(row.member_id||''),Number(row.weekly_contribution||0)]));
    const ranked=activeMembers()
      .map(member=>({member,value:contributionById.get(String(member.id))||0}))
      .sort((a,b)=>b.value-a.value||Number(b.member.gr||0)-Number(a.member.gr||0)||String(a.member.name||'').localeCompare(String(b.member.name||''),undefined,{sensitivity:'base'}))
      .slice(0,5);

    panel.querySelectorAll(':scope > .dash-bar-row').forEach(row=>row.remove());

    if(!ranked.length){
      const empty=document.createElement('div');
      empty.className='empty-note';
      empty.style.padding='18px 10px';
      empty.textContent='No Weekly Contribution data yet. Upload a member CSV to populate this ranking.';
      panel.appendChild(empty);
      return;
    }

    ranked.forEach(({member,value},index)=>{
      const row=document.createElement('div');
      row.className='dash-bar-row';
      const color=colorFor(member.cls);
      row.innerHTML=`<span class="dash-rank">#${index+1}</span><span class="class-dot" style="background:${esc(color)};color:${esc(color)}"></span><span class="dash-bar-name" style="flex:1">${esc(member.name)}</span><span class="dash-bar-avg">${esc(member.cls)}</span><span class="dash-bar-count" style="width:80px">${fmt(value)}</span>`;
      panel.appendChild(row);
    });
  }

  async function refresh(){
    if(document.body.dataset.event!=='dashboard')return;
    const wrap=document.getElementById('teamsWrap');
    if(!wrap)return;
    const topPanel=updateHeaders(wrap);
    if(!topPanel)return;
    const data=await fetchWeeklyRows();
    if(document.body.dataset.event!=='dashboard'||!topPanel.isConnected)return;
    renderTopFive(topPanel,data);
  }

  function schedule(){
    if(renderQueued)return;
    renderQueued=true;
    requestAnimationFrame(()=>{
      renderQueued=false;
      refresh();
    });
  }

  function boot(){
    const wrap=document.getElementById('teamsWrap');
    if(!wrap)return;
    new MutationObserver(schedule).observe(wrap,{childList:true,subtree:true});
    new MutationObserver(schedule).observe(document.body,{attributes:true,attributeFilter:['data-event']});
    schedule();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
