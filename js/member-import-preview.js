/* Titania member CSV reconciliation + preview. */
(function TitaniaMemberImportPreview(){
  'use strict';
  if(!/\/member-import-preview\.html$/i.test(location.pathname))return;

  const STORAGE_KEY='titania_member_csv_import_v1';
  const REQUIRED=['Player','Class','Title','Gear Score','Weekly','Weekly Contribution','Total Contribution'];
  const cfg=window.TITANIA_CONFIG||{};
  const stateBox=document.getElementById('state');
  const rowsBody=document.getElementById('rowsBody');
  const tableWrap=document.getElementById('tableWrap');
  const summaryGrid=document.getElementById('summaryGrid');
  const toolbar=document.getElementById('toolbar');
  const footerBar=document.getElementById('footerBar');
  const applyBtn=document.getElementById('applyBtn');
  const footerMsg=document.getElementById('footerMsg');
  const fileMeta=document.getElementById('fileMeta');
  const inactivePreview=document.getElementById('inactivePreview');
  let client=null;
  let plannerState=null;
  let plannerRevision=0;
  let roster=[];
  let currentProfile=null;
  let savedCsvRows=[];
  let rows=[];
  let filter='all';

  function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function exactKey(value){return String(value==null?'':value).normalize('NFKC').trim().toLowerCase();}
  function looseKey(value){
    let s=String(value==null?'':value).normalize('NFKD').toLowerCase();
    s=s.replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
    s=s.replace(/\d+$/,'');
    return s;
  }
  function toInt(value){const n=Number(String(value==null?'':value).replace(/,/g,'').trim());return Number.isFinite(n)?Math.max(0,Math.round(n)):0;}
  function fmt(value){return Number(value||0).toLocaleString();}
  function localDate(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  function makeId(prefix){
    if(window.crypto&&typeof window.crypto.randomUUID==='function')return `${prefix}_${window.crypto.randomUUID().replace(/-/g,'').slice(0,16)}`;
    return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2,10)}`;
  }
  function makeMemberId(reserved){
    let id=makeId('member');
    while(reserved.has(id))id=makeId('member');
    reserved.add(id);
    return id;
  }

  function parseCsv(text){
    const out=[];let row=[],field='',quoted=false;
    for(let i=0;i<text.length;i++){
      const ch=text[i];
      if(quoted){
        if(ch==='"'&&text[i+1]==='"'){field+='"';i++;}
        else if(ch==='"')quoted=false;
        else field+=ch;
      }else if(ch==='"')quoted=true;
      else if(ch===','){row.push(field);field='';}
      else if(ch==='\n'){row.push(field);out.push(row);row=[];field='';}
      else if(ch!=='\r')field+=ch;
    }
    if(field!==''||row.length){row.push(field);out.push(row);}
    if(!out.length)return {headers:[],records:[]};
    const headers=out[0].map(v=>String(v||'').replace(/^\uFEFF/,'').trim());
    const records=out.slice(1).filter(cols=>cols.some(v=>String(v||'').trim()!=='')).map(cols=>{
      const obj={};headers.forEach((h,i)=>obj[h]=cols[i]==null?'':cols[i]);return obj;
    });
    return {headers,records};
  }

  function distance(a,b){
    if(a===b)return 0;if(!a)return b.length;if(!b)return a.length;
    const prev=Array.from({length:b.length+1},(_,i)=>i);
    for(let i=1;i<=a.length;i++){
      let left=i,diag=i-1;
      for(let j=1;j<=b.length;j++){
        const up=prev[j];
        const next=a[i-1]===b[j-1]?diag:Math.min(diag,up,left)+1;
        diag=up;prev[j]=next;left=next;
      }
      prev[0]=i;
    }
    return prev[b.length];
  }

  function suggestionFor(csvName,usedIds){
    const key=looseKey(csvName);if(!key)return null;
    let best=null,bestScore=-1;
    for(const member of roster){
      const id=String(member.id||'');
      if(usedIds.has(id))continue;
      const mKey=looseKey(member.name||'');if(!mKey)continue;
      let score=0;
      if(key===mKey)score=100;
      else if(Math.min(key.length,mKey.length)>=4&&(key.startsWith(mKey)||mKey.startsWith(key)))score=82;
      else if(Math.min(key.length,mKey.length)>=4&&(key.includes(mKey)||mKey.includes(key)))score=74;
      else {
        const d=distance(key,mKey);
        const max=Math.max(key.length,mKey.length);
        if(d<=2)score=70-(d*8);
        else if(max&&1-d/max>=.72)score=Math.round((1-d/max)*60);
      }
      if(score>bestScore){bestScore=score;best=member;}
    }
    return bestScore>=44?best:null;
  }

  function validateHeaders(headers){
    const missing=REQUIRED.filter(h=>!headers.includes(h));
    if(missing.length)throw new Error(`Missing CSV column${missing.length===1?'':'s'}: ${missing.join(', ')}`);
  }

  function buildRows(records){
    const aliasByCsv=new Map(savedCsvRows.map(item=>[exactKey(item.csv_player_name),String(item.member_id)]));
    const exactByName=new Map(roster.map(member=>[exactKey(member.name),member]));
    const used=new Set();
    const reservedIds=new Set(roster.map(member=>String(member.id||'')).filter(Boolean));
    rows=records.map((record,index)=>{
      const csvName=String(record.Player||'').trim();
      let member=null,matchType='unmatched',needsReview=true,newMember=false;
      const savedId=aliasByCsv.get(exactKey(csvName));
      if(savedId){member=roster.find(m=>String(m.id)===savedId)||null;if(member&&!used.has(String(member.id))){matchType='saved';needsReview=false;}else member=null;}
      if(!member){
        const exact=exactByName.get(exactKey(csvName));
        if(exact&&!used.has(String(exact.id))){member=exact;matchType='exact';needsReview=false;}
      }
      if(!member){
        const suggested=suggestionFor(csvName,used);
        if(suggested){member=suggested;matchType='suggested';needsReview=true;}
      }
      if(!member){newMember=true;matchType='new';needsReview=false;}
      if(member)used.add(String(member.id));
      const existingData=member?savedCsvRows.find(item=>String(item.member_id)===String(member.id)):null;
      return {
        index,
        csvName,
        memberId:member?String(member.id):'',
        newMember,
        newMemberId:newMember?makeMemberId(reservedIds):'',
        originalMemberId:member?String(member.id):'',
        matchType,
        needsReview,
        ignored:false,
        cls:String(record.Class||'').trim(),
        gr:toInt(record['Gear Score']),
        title:String(record.Title||'').trim(),
        weekly:toInt(record.Weekly),
        weeklyContribution:toInt(record['Weekly Contribution']),
        totalContribution:toInt(record['Total Contribution']),
        previousCsvName:existingData?String(existingData.csv_player_name||''):''
      };
    });
  }

  function memberOptions(row){
    const selected=row.newMember?'__new__':String(row.memberId||'');
    const sorted=[...roster].sort((a,b)=>{
      const ai=a.status==='inactive'?1:0,bi=b.status==='inactive'?1:0;
      return ai-bi||String(a.name||'').localeCompare(String(b.name||''),undefined,{sensitivity:'base'});
    });
    return `<option value=""></option><option value="__new__"${selected==='__new__'?' selected':''}>+ Create new member · ${esc(row.csvName)}</option>${sorted.map(m=>`<option value="${esc(m.id)}"${String(m.id)===selected?' selected':''}>${esc(m.name)}${m.status==='inactive'?' · Inactive':''}</option>`).join('')}`;
  }

  function currentMember(row){return roster.find(m=>String(m.id)===String(row.memberId))||null;}
  function isReactivation(row){const m=currentMember(row);return Boolean(!row.ignored&&!row.newMember&&m&&m.status==='inactive');}
  function classChanged(row){const m=currentMember(row);return Boolean(m&&!row.ignored&&!row.newMember&&String(m.cls||'')!==String(row.cls||''));}
  function grChanged(row){const m=currentMember(row);return Boolean(m&&!row.ignored&&!row.newMember&&Number(m.gr||0)!==Number(row.gr||0));}
  function nameMapping(row){const m=currentMember(row);return Boolean(m&&!row.ignored&&!row.newMember&&exactKey(m.name)!==exactKey(row.csvName));}

  function statusLabel(row){
    if(row.ignored)return ['ignored','Ignored'];
    if(row.newMember)return ['new','New Member'];
    if(!row.memberId)return ['unmatched','Unmatched'];
    if(row.needsReview)return ['suggested','Review'];
    if(isReactivation(row))return ['reactivate','Reactivate'];
    if(row.matchType==='saved')return ['saved','Saved Match'];
    if(row.matchType==='manual')return ['manual','Confirmed'];
    return ['exact','Exact'];
  }

  function presentExistingIds(){
    return new Set(rows.filter(row=>row.memberId).map(row=>String(row.memberId)));
  }

  function inactiveCandidates(){
    const present=presentExistingIds();
    return roster.filter(member=>member.status!=='inactive'&&member.id&&!present.has(String(member.id)));
  }

  function rowVisible(row){
    if(filter==='all')return true;
    if(filter==='review')return !row.ignored&&!row.newMember&&(row.needsReview||!row.memberId);
    if(filter==='new')return !row.ignored&&row.newMember;
    if(filter==='mapping')return nameMapping(row);
    if(filter==='class')return classChanged(row);
    if(filter==='gr')return grChanged(row);
    return true;
  }

  function renderRows(){
    const visible=rows.filter(rowVisible);
    rowsBody.innerHTML=visible.map(row=>{
      const [statusClass,statusText]=statusLabel(row);
      const rowClass=row.ignored?'ignored':row.newMember?'new-member':!row.memberId?'unresolved':row.needsReview?'needs-review':isReactivation(row)?'reactivate-member':'';
      return `<tr data-index="${row.index}" class="${rowClass}">
        <td><div class="csv-name" title="${esc(row.csvName)}">${esc(row.csvName)}</div></td>
        <td class="match-cell"><select class="match-select" data-field="memberId">${memberOptions(row)}</select></td>
        <td><span class="status-pill ${statusClass}">${statusText}</span></td>
        <td><input class="edit${classChanged(row)?' change':''}" data-field="cls" value="${esc(row.cls)}"></td>
        <td><input class="edit number${grChanged(row)?' change':''}" data-field="gr" type="number" min="0" step="1" value="${row.gr}"></td>
        <td><input class="edit title" data-field="title" value="${esc(row.title)}"></td>
        <td><input class="edit number" data-field="weekly" type="number" min="0" step="1" value="${row.weekly}"></td>
        <td><input class="edit number" data-field="weeklyContribution" type="number" min="0" step="1" value="${row.weeklyContribution}"></td>
        <td><input class="edit number" data-field="totalContribution" type="number" min="0" step="1" value="${row.totalContribution}"></td>
        <td><div class="row-actions">${row.needsReview&&row.memberId&&!row.ignored?'<button type="button" class="confirm-suggestion" data-confirm><i class="fa-solid fa-check mr-2" aria-hidden="true"></i>Confirm</button>':''}<button type="button" class="ignore-btn" data-ignore>${row.ignored?'Restore':'Ignore'}</button></div></td>
      </tr>`;
    }).join('');
    initSelect2();
    refreshSummary();
  }

  function initSelect2(){
    if(!(window.jQuery&&jQuery.fn&&jQuery.fn.select2))return;
    jQuery(rowsBody).find('.match-select').each(function(){
      jQuery(this).select2({placeholder:'Select Titania member',allowClear:true,width:'100%'});
    });
  }

  function duplicateIds(){
    const counts=new Map();
    rows.forEach(row=>{if(!row.ignored&&!row.newMember&&row.memberId)counts.set(row.memberId,(counts.get(row.memberId)||0)+1);});
    return new Set([...counts].filter(([,count])=>count>1).map(([id])=>id));
  }

  function duplicateCsvNames(){
    const counts=new Map();
    rows.forEach(row=>{if(!row.ignored){const key=exactKey(row.csvName);if(key)counts.set(key,(counts.get(key)||0)+1);}});
    return new Set([...counts].filter(([,count])=>count>1).map(([key])=>key));
  }

  function renderInactivePreview(members){
    if(!inactivePreview)return;
    if(!members.length){inactivePreview.hidden=true;inactivePreview.innerHTML='';return;}
    inactivePreview.hidden=false;
    inactivePreview.innerHTML=`<div class="inactive-preview-head"><strong><i class="fa-solid fa-user-slash mr-2" aria-hidden="true"></i>${members.length} current member${members.length===1?'':'s'} missing from CSV</strong><span>These members will be marked inactive when you apply.</span></div><div class="inactive-preview-names">${members.map(member=>`<span>${esc(member.name)}</span>`).join('')}</div>`;
  }

  function refreshSummary(){
    const activeRows=rows.filter(r=>!r.ignored);
    const matched=activeRows.filter(r=>!r.newMember&&r.memberId&&!r.needsReview).length;
    const newCount=activeRows.filter(r=>r.newMember).length;
    const review=activeRows.filter(r=>!r.newMember&&(!r.memberId||r.needsReview)).length;
    const cls=activeRows.filter(classChanged).length;
    const gr=activeRows.filter(grChanged).length;
    const goingInactive=inactiveCandidates();
    document.getElementById('sumRows').textContent=rows.length;
    document.getElementById('sumMatched').textContent=matched;
    document.getElementById('sumNew').textContent=newCount;
    document.getElementById('sumReview').textContent=review;
    document.getElementById('sumInactive').textContent=goingInactive.length;
    document.getElementById('sumClass').textContent=cls;
    document.getElementById('sumGr').textContent=gr;
    renderInactivePreview(goingInactive);

    const duplicates=duplicateIds();
    const csvDuplicates=duplicateCsvNames();
    rowsBody.querySelectorAll('tr[data-index]').forEach(tr=>{
      const row=rows[Number(tr.dataset.index)];
      tr.classList.toggle('duplicate',Boolean(row&&!row.newMember&&row.memberId&&duplicates.has(row.memberId))||Boolean(row&&csvDuplicates.has(exactKey(row.csvName))));
    });
    const unresolved=activeRows.filter(r=>!r.newMember&&(!r.memberId||r.needsReview)).length;
    const valid=activeRows.length>0&&!unresolved&&!duplicates.size&&!csvDuplicates.size;
    applyBtn.disabled=!valid;
    if(duplicates.size)footerMsg.textContent=`${duplicates.size} Titania member match${duplicates.size===1?' is':'es are'} used more than once.`;
    else if(csvDuplicates.size)footerMsg.textContent=`${csvDuplicates.size} duplicate CSV player name${csvDuplicates.size===1?' needs':'s need'} to be resolved.`;
    else if(unresolved)footerMsg.textContent=`Resolve ${unresolved} row${unresolved===1?'':'s'} before applying.`;
    else footerMsg.textContent=`Ready: ${matched} matched · ${newCount} new · ${goingInactive.length} going inactive.`;
    document.getElementById('toolbarNote').textContent=`${rows.filter(rowVisible).length} row${rows.filter(rowVisible).length===1?'':'s'} shown`;
  }

  function rowFromTarget(target){const tr=target.closest('tr[data-index]');return tr?rows[Number(tr.dataset.index)]:null;}

  function wireTable(){
    jQuery(rowsBody).on('change','.match-select',function(){
      const row=rowFromTarget(this);if(!row)return;
      const value=String(this.value||'');
      if(value==='__new__'){
        row.newMember=true;
        row.memberId='';
        row.newMemberId=row.newMemberId||makeId('member');
        row.needsReview=false;
        row.matchType='new';
      }else if(value){
        row.newMember=false;
        row.memberId=value;
        row.needsReview=false;
        row.matchType='manual';
      }else{
        row.newMember=false;
        row.memberId='';
        row.needsReview=true;
        row.matchType='unmatched';
      }
      row.ignored=false;
      renderRows();
    });
    rowsBody.addEventListener('input',event=>{
      const input=event.target.closest('[data-field]');if(!input||input.matches('.match-select'))return;
      const row=rowFromTarget(input);if(!row)return;
      const field=input.dataset.field;
      row[field]=['gr','weekly','weeklyContribution','totalContribution'].includes(field)?toInt(input.value):input.value;
      refreshSummary();
      if(field==='cls'||field==='gr')input.classList.toggle('change',field==='cls'?classChanged(row):grChanged(row));
    });
    rowsBody.addEventListener('click',event=>{
      const row=rowFromTarget(event.target);if(!row)return;
      if(event.target.closest('[data-confirm]')){
        row.needsReview=false;row.matchType='manual';renderRows();return;
      }
      if(event.target.closest('[data-ignore]')){
        row.ignored=!row.ignored;
        if(row.ignored)row.needsReview=false;
        else if(!row.newMember)row.needsReview=!row.memberId;
        renderRows();
      }
    });
  }

  function wireFilters(){
    document.getElementById('filters').addEventListener('click',event=>{
      const button=event.target.closest('[data-filter]');if(!button)return;
      filter=button.dataset.filter;
      document.querySelectorAll('.filter-btn').forEach(btn=>btn.classList.toggle('active',btn===button));
      renderRows();
    });
  }

  function clone(value){return JSON.parse(JSON.stringify(value));}

  function appendMembershipHistory(next,member,action,effectiveDate,reason,changedAt){
    if(!Array.isArray(next.membershipHistory))next.membershipHistory=[];
    next.membershipHistory.push({
      id:makeId('history'),
      memberId:member.id,
      memberName:member.name,
      action,
      effectiveDate,
      reason,
      changedAt
    });
    if(next.membershipHistory.length>20000)next.membershipHistory=next.membershipHistory.slice(-20000);
  }

  function removeInactiveFromLineups(next,memberName){
    if(next.assignments&&typeof next.assignments==='object'){
      Object.keys(next.assignments).forEach(key=>{
        if(Array.isArray(next.assignments[key]))next.assignments[key]=next.assignments[key].map(value=>value===memberName?null:value);
      });
    }
    if(next.raidLeaders&&typeof next.raidLeaders==='object'){
      Object.keys(next.raidLeaders).forEach(key=>{if(next.raidLeaders[key]===memberName)next.raidLeaders[key]='';});
    }
  }

  function applyToState(){
    const next=clone(plannerState);
    if(!Array.isArray(next.roster))next.roster=[];
    const byId=new Map(next.roster.map(member=>[String(member.id||''),member]));
    const editor=(currentProfile&&String(currentProfile.display_name||currentProfile.email||'').trim())||'CSV Import';
    const now=new Date().toISOString();
    const date=localDate();
    const present=presentExistingIds();

    next.roster.forEach(member=>{
      const id=String(member.id||'');
      if(!id||member.status==='inactive'||present.has(id))return;
      removeInactiveFromLineups(next,member.name);
      member.status='inactive';
      member.inactiveSince=date;
      member.inactiveReason='Missing from member CSV';
      member.updatedAt=now;
      member.updatedBy=editor;
      appendMembershipHistory(next,member,'inactive',date,'Missing from member CSV',now);
    });

    for(const row of rows){
      if(row.ignored)continue;
      if(row.newMember){
        const id=row.newMemberId||makeId('member');
        row.newMemberId=id;
        const member={
          id,
          name:String(row.csvName||'').trim().slice(0,120),
          cls:String(row.cls||'').trim()||'Unknown',
          gr:toInt(row.gr),
          status:'active',
          inactiveSince:'',
          lastReturned:'',
          inactiveReason:'',
          notes:'',
          updatedAt:now,
          updatedBy:editor
        };
        next.roster.push(member);
        byId.set(id,member);
        continue;
      }

      if(!row.memberId)continue;
      const member=byId.get(String(row.memberId));if(!member)continue;
      let changed=false;
      if(member.status==='inactive'){
        member.status='active';
        member.lastReturned=date;
        member.inactiveSince='';
        member.inactiveReason='';
        appendMembershipHistory(next,member,'reactivated',date,'Present in member CSV',now);
        changed=true;
      }
      const newClass=String(row.cls||'').trim()||member.cls||'Unknown';
      const newGr=toInt(row.gr);
      if(String(member.cls||'')!==newClass){member.cls=newClass;changed=true;}
      if(Number(member.gr||0)!==newGr){member.gr=newGr;changed=true;}
      if(changed){member.updatedAt=now;member.updatedBy=editor;}
    }
    return next;
  }

  function importPayload(){
    return rows.filter(row=>!row.ignored&&(row.newMember||row.memberId)).map(row=>({
      member_id:row.newMember?row.newMemberId:row.memberId,
      csv_player_name:row.csvName,
      title:String(row.title||'').trim(),
      weekly:toInt(row.weekly),
      weekly_contribution:toInt(row.weeklyContribution),
      total_contribution:toInt(row.totalContribution)
    }));
  }

  async function applyUpdates(){
    refreshSummary();if(applyBtn.disabled)return;
    const active=rows.filter(r=>!r.ignored);
    const matched=active.filter(r=>!r.newMember&&r.memberId&&!r.needsReview);
    const newMembers=active.filter(r=>r.newMember);
    const inactive=inactiveCandidates();
    const reactivated=active.filter(isReactivation);
    const classCount=active.filter(classChanged).length;
    const grCount=active.filter(grChanged).length;
    const aliasCount=active.filter(nameMapping).length;
    const result=await Swal.fire({
      icon:'question',title:'Update Titania members?',
      html:`<div style="text-align:left;line-height:1.75"><b>${matched.length}</b> existing members matched<br><b>${newMembers.length}</b> new members to add<br><b>${inactive.length}</b> current members to mark inactive<br><b>${reactivated.length}</b> inactive members to reactivate<br><b>${aliasCount}</b> CSV name mappings<br><b>${classCount}</b> class changes<br><b>${grCount}</b> Gear Score changes<br><b>${active.length}</b> activity/contribution updates</div>`,
      showCancelButton:true,confirmButtonText:'Apply Updates',cancelButtonText:'Cancel',reverseButtons:true
    });
    if(!result.isConfirmed)return;

    applyBtn.disabled=true;
    applyBtn.innerHTML='<i class="fa-solid fa-spinner fa-spin mr-2" aria-hidden="true"></i>Applying';
    try{
      const nextState=applyToState();
      const rpc=await client.rpc('apply_member_csv_import',{p_state:nextState,p_base_revision:plannerRevision,p_rows:importPayload()});
      if(rpc.error)throw rpc.error;
      sessionStorage.removeItem(STORAGE_KEY);
      const pieces=[`${matched.length} updated`];
      if(newMembers.length)pieces.push(`${newMembers.length} added`);
      if(inactive.length)pieces.push(`${inactive.length} marked inactive`);
      if(reactivated.length)pieces.push(`${reactivated.length} reactivated`);
      await Swal.fire({icon:'success',title:'Member sync complete',text:pieces.join(' · '),confirmButtonText:'Back to Members'});
      location.href='./index.html#members';
    }catch(error){
      const msg=String(error&&error.message||error||'Member update failed.');
      const conflict=msg.includes('REVISION_CONFLICT');
      await Swal.fire({icon:'error',title:conflict?'Roster changed while you were reviewing':'Update failed',text:conflict?'Another Titania edit was saved. Reload this preview so your CSV is compared with the newest roster before applying.':msg});
      applyBtn.innerHTML='<i class="fa-solid fa-cloud-arrow-up mr-2" aria-hidden="true"></i>Apply Updates';
      applyBtn.disabled=false;refreshSummary();
    }
  }

  async function loadPreview(rawFile){
    const parsed=parseCsv(rawFile.raw||'');validateHeaders(parsed.headers);
    if(!parsed.records.length)throw new Error('This CSV has no member rows.');
    fileMeta.textContent=`${rawFile.name||'Member CSV'} · ${parsed.records.length} rows`;

    const userRes=await client.auth.getUser();
    const user=userRes.data&&userRes.data.user;
    if(userRes.error||!user)throw new Error('Sign in to Titania first.');

    const [profileRes,plannerRes,csvRes]=await Promise.all([
      client.from('profiles').select('approved,role,display_name,email').eq('id',user.id).single(),
      client.from('planner_state').select('state,revision').eq('id',1).single(),
      client.from('member_csv_data').select('member_id,csv_player_name,title,weekly,weekly_contribution,total_contribution')
    ]);
    if(profileRes.error||!profileRes.data||!profileRes.data.approved)throw new Error('Approved Titania access is required.');
    if(!['party_organizer','admin'].includes(profileRes.data.role))throw new Error('Party Organizer or Admin access is required to update members.');
    if(plannerRes.error)throw new Error(plannerRes.error.message||'Could not load Titania roster.');
    if(csvRes.error)throw new Error(csvRes.error.message||'Could not load saved CSV name mappings.');

    currentProfile=profileRes.data;
    plannerState=plannerRes.data.state||{};
    plannerRevision=Number(plannerRes.data.revision||0);
    roster=Array.isArray(plannerState.roster)?plannerState.roster:[];
    savedCsvRows=csvRes.data||[];
    buildRows(parsed.records);
    stateBox.hidden=true;summaryGrid.hidden=false;toolbar.hidden=false;tableWrap.hidden=false;footerBar.hidden=false;
    renderRows();
  }

  async function replaceFile(file){
    if(!file)return;
    if(!/\.csv$/i.test(file.name))throw new Error('Choose a .csv member export.');
    const raw=await file.text();
    const payload={name:file.name,raw,loadedAt:new Date().toISOString()};
    sessionStorage.setItem(STORAGE_KEY,JSON.stringify(payload));
    location.reload();
  }

  async function boot(){
    if(!window.supabase||!cfg.supabaseUrl||!cfg.supabasePublishableKey){stateBox.className='state error';stateBox.textContent='Supabase configuration is missing.';return;}
    let rawFile=null;
    try{rawFile=JSON.parse(sessionStorage.getItem(STORAGE_KEY)||'null');}catch(_e){}
    if(!rawFile||!rawFile.raw){stateBox.className='state error';stateBox.innerHTML='No CSV is loaded. Return to <a href="./index.html#members" style="color:var(--teal)">Members</a> and choose <b>Upload Member CSV</b>.';return;}
    client=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
    wireTable();wireFilters();applyBtn.addEventListener('click',applyUpdates);
    document.getElementById('replaceFileBtn').addEventListener('click',()=>{const input=document.getElementById('replaceFileInput');input.value='';input.click();});
    document.getElementById('replaceFileInput').addEventListener('change',event=>replaceFile(event.target.files&&event.target.files[0]).catch(async error=>Swal.fire({icon:'error',title:'Could not read CSV',text:String(error.message||error)})));
    try{await loadPreview(rawFile);}catch(error){stateBox.className='state error';stateBox.textContent=String(error&&error.message||error||'Could not build CSV preview.');}
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
