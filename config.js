/* Compatibility bootstrap. Real configuration lives in ./js/config.js. */
document.write('<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"><\/script>');
document.write('<script src="./js/config.js?v=20260911-att-layout-2"><\/script>');
document.write('<script src="./js/job-icons-global.js?v=20260908-2"><\/script>');
document.write('<link rel="stylesheet" href="./css/crowns.css?v=20260906-2">');
document.write('<link rel="stylesheet" href="./css/tooltips.css?v=20260906-1">');
document.write('<script src="./js/tooltips-global.js?v=20260906-2"><\/script>');
document.write('<link rel="stylesheet" href="./css/party-stars.css?v=20260906-8">');
document.write('<link rel="stylesheet" href="./css/ui-polish.css?v=20260911-2">');
document.write('<script src="./js/member-profile-enhancements.js?v=20260914-profile-metrics-1"><\/script>');
document.write('<script src="./js/member-csv-import-link.js?v=20260912-1"><\/script>');
document.write('<script src="./js/user-management-link.js?v=20260906-1"><\/script>');
document.write('<script src="./js/guild-runs-link.js?v=20260910-fa-1"><\/script>');
document.write('<script src="./js/organizer-role.js?v=20260907-1"><\/script>');
document.write('<link rel="stylesheet" href="./css/attendance-page.css?v=20260911-layout-1">');
document.write('<script src="./js/attendance-delete.js?v=20260911-2"><\/script>');
document.write('<script src="./js/attendance-layout.js?v=20260911-2"><\/script>');
document.write('<script src="./js/party-pool.js?v=20260911-4"><\/script>');
document.write('<script src="./js/siege-polarity-label.js?v=20260913-1"><\/script>');
document.write('<script src="./js/dashboard-weekly-ranking.js?v=20260914-1"><\/script>');

document.addEventListener('DOMContentLoaded',()=>{
  if(document.querySelector('script[data-titania-party-stars]'))return;
  const script=document.createElement('script');
  script.src='./js/party-stars.js?v=20260906-4';
  script.setAttribute('data-titania-party-stars','1');
  document.body.appendChild(script);
},{once:true});
