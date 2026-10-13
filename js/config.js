/*
 * TingADingADing website configuration.
 * Safe for browser use: this file contains ONLY the Supabase Project URL and Publishable key.
 * NEVER put a service_role key or secret key in this file.
 */
window.TingADingADing_CONFIG = Object.freeze({
  supabaseUrl: 'https://tpicyhzhmaagkqscocqa.supabase.co',
  supabasePublishableKey: 'sb_publishable_qJeAYVckDb2GkMS3RTSDLg_WYUz6TkP',
  appName: 'TingADingADing Guild Management Tool'
});

/*
 * Feature flags.
 * Polarity Zone is temporarily hidden, not deleted.
 * Change polarityZone to true to restore it everywhere.
 */
window.TingADingADing_FEATURES = Object.freeze({
  polarityZone: false
});

/* One Font Awesome stylesheet and shared icons for every TingADingADing page. */
(function loadTingADingADingUiIcons() {
  if (!document.querySelector('link[href*="font-awesome/"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css';
    document.head.appendChild(link);
  }
  if (!document.querySelector('link[data-TingADingADing-ui-icons]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = './css/ui-icons.css?v=20260910-spacing-1';
    link.setAttribute('data-TingADingADing-ui-icons', '1');
    document.head.appendChild(link);
  }
  if (!document.querySelector('script[data-TingADingADing-ui-icons]')) {
    const script = document.createElement('script');
    script.src = './js/ui-icons.js?v=20260910-spacing-1';
    script.setAttribute('data-TingADingADing-ui-icons', '1');
    document.head.appendChild(script);
  }
})();

const TingADingADing_IS_MANAGEMENT_PAGE = /\/$|\/index\.html$/i.test(window.location.pathname);
const TingADingADing_IS_PUBLIC_EVENT_PAGE = /\/(guild-league|siege)\.html$/i.test(window.location.pathname);
const TingADingADing_IS_MEMBER_PAGE = /\/member\.html$/i.test(window.location.pathname);

(function loadTingADingADingMobileNav() {
  if (!TingADingADing_IS_MANAGEMENT_PAGE) return;
  if (document.querySelector('link[data-TingADingADing-mobile-nav]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './css/mobile-nav.css?v=20260910-fa-1';
  link.setAttribute('data-TingADingADing-mobile-nav', '1');
  document.head.appendChild(link);
})();

(function loadTingADingADingDashboardFixes() {
  if (!TingADingADing_IS_MANAGEMENT_PAGE) return;
  if (document.querySelector('link[data-TingADingADing-dashboard-fixes]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './css/dashboard-fixes.css?v=20260911-aligned-1';
  link.setAttribute('data-TingADingADing-dashboard-fixes', '1');
  document.head.appendChild(link);

  const loadScript = () => {
    if (document.querySelector('script[data-TingADingADing-dashboard-attendance]')) return;
    const script = document.createElement('script');
    script.src = './js/dashboard-attendance.js?v=20260911-aligned-1';
    script.setAttribute('data-TingADingADing-dashboard-attendance', '1');
    document.body.appendChild(script);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadScript, { once: true });
  else loadScript();
})();

/* Guild League / Siege pre-attendance badge UI. */
(function loadTingADingADingPreAttendance() {
  if (!TingADingADing_IS_MANAGEMENT_PAGE) return;
  if (!document.querySelector('link[data-TingADingADing-pre-attendance]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = './css/attendance-pre.css?v=20260910-fa-1';
    link.setAttribute('data-TingADingADing-pre-attendance', '1');
    document.head.appendChild(link);
  }

  const loadScript = () => {
    if (document.querySelector('script[data-TingADingADing-pre-attendance]')) return;
    const script = document.createElement('script');
    script.src = './js/attendance-pre.js?v=20260905-1';
    script.setAttribute('data-TingADingADing-pre-attendance', '1');
    document.body.appendChild(script);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadScript, { once: true });
  else loadScript();
})();

/* Attendance history / actual attendance tab. */
(function loadTingADingADingAttendancePage() {
  if (!TingADingADing_IS_MANAGEMENT_PAGE) return;
  if (!document.querySelector('link[data-TingADingADing-attendance-page]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = './css/attendance-page.css?v=20260910-2';
    link.setAttribute('data-TingADingADing-attendance-page', '1');
    document.head.appendChild(link);
  }

  const loadScript = () => {
    if (document.querySelector('script[data-TingADingADing-attendance-page]')) return;
    const script = document.createElement('script');
    script.src = './js/attendance-page.js?v=20260910-1';
    script.setAttribute('data-TingADingADing-attendance-page', '1');
    document.body.appendChild(script);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadScript, { once: true });
  else loadScript();
})();

/* Member profile links inside Manage Members + Dashboard rankings + Attendance. */
(function loadTingADingADingMemberLinks() {
  if (!TingADingADing_IS_MANAGEMENT_PAGE) return;
  const loadScript = () => {
    if (document.querySelector('script[data-TingADingADing-member-links]')) return;
    const script = document.createElement('script');
    script.src = './js/member-links.js?v=20260908-1';
    script.setAttribute('data-TingADingADing-member-links', '1');
    document.body.appendChild(script);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadScript, { once: true });
  else loadScript();
})();

/* Job/class artwork on member profile pages. */
(function loadTingADingADingMemberJobIcons() {
  if (!TingADingADing_IS_MEMBER_PAGE) return;
  const loadScript = () => {
    if (document.querySelector('script[data-TingADingADing-member-job-icons]')) return;
    const script = document.createElement('script');
    script.src = './js/member-job-icons.js?v=20260905-1';
    script.setAttribute('data-TingADingADing-member-job-icons', '1');
    document.body.appendChild(script);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadScript, { once: true });
  else loadScript();
})();

/* Read-only attendance icons on published Guild League / Siege pages. */
(function loadTingADingADingPublicAttendance() {
  if (!TingADingADing_IS_PUBLIC_EVENT_PAGE) return;
  if (!document.querySelector('link[data-TingADingADing-public-attendance]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = './css/public-attendance.css?v=20260910-fa-1';
    link.setAttribute('data-TingADingADing-public-attendance', '1');
    document.head.appendChild(link);
  }

  const loadScript = () => {
    if (document.querySelector('script[data-TingADingADing-public-attendance]')) return;
    const script = document.createElement('script');
    script.src = './js/public-attendance.js?v=20260905-1';
    script.setAttribute('data-TingADingADing-public-attendance', '1');
    document.body.appendChild(script);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadScript, { once: true });
  else loadScript();
})();

/* Open native date/time pickers when the input itself is clicked. */
document.addEventListener('click', event => {
  const input = event.target.closest('input[type="date"],input[type="time"]');
  if (!input || typeof input.showPicker !== 'function') return;
  try { input.showPicker(); } catch (_error) { }
});

/*
 * Reversible Polarity Zone hide switch.
 * This only hides UI/public access; saved Supabase Polarity data remains untouched.
 */
(function applyTingADingADingFeatureFlags() {
  if (window.TingADingADing_FEATURES && window.TingADingADing_FEATURES.polarityZone === true) {
    if (!document.querySelector('link[data-TingADingADing-polarity-hidden]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = './css/polarity-hidden.css?v=20260907-2';
      link.setAttribute('data-TingADingADing-polarity-hidden', '1');
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
