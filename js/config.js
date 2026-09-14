/*
 * Titania website configuration.
 * Safe for browser use: this file contains ONLY the Supabase Project URL and Publishable key.
 * NEVER put a service_role key or secret key in this file.
 */
window.TITANIA_CONFIG = Object.freeze({
  supabaseUrl: 'https://dczcesmpbfurpllqpkml.supabase.co',
  supabasePublishableKey: 'sb_publishable_PZgwOpRXW5Acawq1ZEPBJQ_6xHYf3--',
  appName: 'Titania Guild Management Tool'
});

/*
 * Feature flags.
 * Polarity Zone is temporarily hidden, not deleted.
 * Change polarityZone to true to restore it everywhere.
 */
window.TITANIA_FEATURES = Object.freeze({
  polarityZone: false
});

/* One Font Awesome stylesheet and shared icons for every Titania page. */
(function loadTitaniaUiIcons(){
  if (!document.querySelector('link[href*="font-awesome/"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css';
    document.head.appendChild(link);
  }
  if (!document.querySelector('link[data-titania-ui-icons]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = './css/ui-icons.css?v=20260910-spacing-1';
    link.setAttribute('data-titania-ui-icons', '1');
    document.head.appendChild(link);
  }
  if (!document.querySelector('script[data-titania-ui-icons]')) {
    const script = document.createElement('script');
    script.src = './js/ui-icons.js?v=20260910-spacing-1';
    script.setAttribute('data-titania-ui-icons', '1');
    document.head.appendChild(script);
  }
})();

const TITANIA_IS_MANAGEMENT_PAGE = /\/$|\/index\.html$/i.test(window.location.pathname);
const TITANIA_IS_PUBLIC_EVENT_PAGE = /\/(guild-league|siege)\.html$/i.test(window.location.pathname);
const TITANIA_IS_MEMBER_PAGE = /\/member\.html$/i.test(window.location.pathname);

(function loadTitaniaMobileNav(){
  if (!TITANIA_IS_MANAGEMENT_PAGE) return;
  if (document.querySelector('link[data-titania-mobile-nav]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './css/mobile-nav.css?v=20260910-fa-1';
  link.setAttribute('data-titania-mobile-nav', '1');
  document.head.appendChild(link);
})();

(function loadTitaniaDashboardFixes(){
  if (!TITANIA_IS_MANAGEMENT_PAGE) return;
  if (document.querySelector('link[data-titania-dashboard-fixes]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './css/dashboard-fixes.css?v=20260911-aligned-1';
  link.setAttribute('data-titania-dashboard-fixes', '1');
  document.head.appendChild(link);

  const loadScript = () => {
    if (document.querySelector('script[data-titania-dashboard-attendance]')) return;
    const script = document.createElement('script');
    script.src = './js/dashboard-attendance.js?v=20260911-aligned-1';
    script.setAttribute('data-titania-dashboard-attendance', '1');
    document.body.appendChild(script);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadScript, {once:true});
  else loadScript();
})();

/* Guild League / Siege pre-attendance badge UI. */
(function loadTitaniaPreAttendance(){
  if (!TITANIA_IS_MANAGEMENT_PAGE) return;
  if (!document.querySelector('link[data-titania-pre-attendance]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = './css/attendance-pre.css?v=20260910-fa-1';
    link.setAttribute('data-titania-pre-attendance', '1');
    document.head.appendChild(link);
  }

  const loadScript = () => {
    if (document.querySelector('script[data-titania-pre-attendance]')) return;
    const script = document.createElement('script');
    script.src = './js/attendance-pre.js?v=20260905-1';
    script.setAttribute('data-titania-pre-attendance', '1');
    document.body.appendChild(script);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadScript, {once:true});
  else loadScript();
})();

/* Attendance history / actual attendance tab. */
(function loadTitaniaAttendancePage(){
  if (!TITANIA_IS_MANAGEMENT_PAGE) return;
  if (!document.querySelector('link[data-titania-attendance-page]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = './css/attendance-page.css?v=20260910-2';
    link.setAttribute('data-titania-attendance-page', '1');
    document.head.appendChild(link);
  }

  const loadScript = () => {
    if (document.querySelector('script[data-titania-attendance-page]')) return;
    const script = document.createElement('script');
    script.src = './js/attendance-page.js?v=20260910-1';
    script.setAttribute('data-titania-attendance-page', '1');
    document.body.appendChild(script);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadScript, {once:true});
  else loadScript();
})();

/* Member profile links inside Manage Members + Dashboard rankings + Attendance. */
(function loadTitaniaMemberLinks(){
  if (!TITANIA_IS_MANAGEMENT_PAGE) return;
  const loadScript = () => {
    if (document.querySelector('script[data-titania-member-links]')) return;
    const script = document.createElement('script');
    script.src = './js/member-links.js?v=20260908-1';
    script.setAttribute('data-titania-member-links', '1');
    document.body.appendChild(script);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadScript, {once:true});
  else loadScript();
})();

/* Job/class artwork on member profile pages. */
(function loadTitaniaMemberJobIcons(){
  if (!TITANIA_IS_MEMBER_PAGE) return;
  const loadScript = () => {
    if (document.querySelector('script[data-titania-member-job-icons]')) return;
    const script = document.createElement('script');
    script.src = './js/member-job-icons.js?v=20260905-1';
    script.setAttribute('data-titania-member-job-icons','1');
    document.body.appendChild(script);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadScript, {once:true});
  else loadScript();
})();

/* Read-only attendance icons on published Guild League / Siege pages. */
(function loadTitaniaPublicAttendance(){
  if (!TITANIA_IS_PUBLIC_EVENT_PAGE) return;
  if (!document.querySelector('link[data-titania-public-attendance]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = './css/public-attendance.css?v=20260910-fa-1';
    link.setAttribute('data-titania-public-attendance', '1');
    document.head.appendChild(link);
  }

  const loadScript = () => {
    if (document.querySelector('script[data-titania-public-attendance]')) return;
    const script = document.createElement('script');
    script.src = './js/public-attendance.js?v=20260905-1';
    script.setAttribute('data-titania-public-attendance', '1');
    document.body.appendChild(script);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadScript, {once:true});
  else loadScript();
})();

/* Open native date/time pickers when the input itself is clicked. */
document.addEventListener('click', event => {
  const input = event.target.closest('input[type="date"],input[type="time"]');
  if (!input || typeof input.showPicker !== 'function') return;
  try { input.showPicker(); } catch (_error) {}
});

/*
 * Reversible Polarity Zone hide switch.
 * This only hides UI/public access; saved Supabase Polarity data remains untouched.
 */
(function applyTitaniaFeatureFlags(){
  if (window.TITANIA_FEATURES && window.TITANIA_FEATURES.polarityZone === false) {
    if (!document.querySelector('link[data-titania-polarity-hidden]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = './css/polarity-hidden.css?v=20260907-2';
      link.setAttribute('data-titania-polarity-hidden', '1');
      document.head.appendChild(link);
    }

    try {
      const storedEvent = localStorage.getItem('roworld_sheets_event_v1');
      if (storedEvent === 'polarity_zone') {
        localStorage.setItem('roworld_sheets_event_v1', 'guild_league');
      }
    } catch (error) {
      /* localStorage may be unavailable; safe to ignore */
    }
  }
})();
