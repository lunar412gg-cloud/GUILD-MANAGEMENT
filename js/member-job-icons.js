(function TitaniaMemberJobIcons(){
  'use strict';

  const MEMBER_PAGE_RE = /\/member\.html$/i;
  if (!MEMBER_PAGE_RE.test(window.location.pathname)) return;

  const ICON_BASE = './assets/images/job/';
  const MAP_URL = `${ICON_BASE}job-icons.json?v=20260905-1`;
  let iconMapPromise = null;

  function loadIconMap(){
    if (!iconMapPromise) {
      iconMapPromise = fetch(MAP_URL, {cache:'force-cache'})
        .then(response => {
          if (!response.ok) throw new Error(`Job icon map HTTP ${response.status}`);
          return response.json();
        })
        .catch(error => {
          console.warn('[Titania] Could not load job icon map:', error);
          return {};
        });
    }
    return iconMapPromise;
  }

  function ensureStyle(){
    if (document.getElementById('titania-member-job-icon-style')) return;
    const style = document.createElement('style');
    style.id = 'titania-member-job-icon-style';
    style.textContent = `
      .class-job-icon{
        width:56px;
        height:56px;
        flex:none;
        object-fit:contain;
        display:block;
        filter:drop-shadow(0 5px 10px rgba(0,0,0,.28));
      }
      @media(max-width:440px){
        .class-job-icon{width:50px;height:50px;}
      }
    `;
    document.head.appendChild(style);
  }

  async function applyJobIcon(){
    const classEl = document.getElementById('memberClass');
    const orb = document.getElementById('classOrb');
    const existing = document.getElementById('memberJobIcon');
    const className = String(classEl && classEl.textContent || '').trim();

    if (!classEl || !className) return false;

    const iconMap = await loadIconMap();
    const filename = iconMap[className];
    if (!filename) return false;

    ensureStyle();

    if (existing) {
      const expected = `${ICON_BASE}${filename}`;
      if (!existing.src.endsWith(expected.replace('./',''))) existing.src = expected;
      existing.alt = `${className} job icon`;
      existing.title = className;
      return true;
    }

    if (!orb) return false;

    const img = document.createElement('img');
    img.id = 'memberJobIcon';
    img.className = 'class-job-icon';
    img.src = `${ICON_BASE}${filename}`;
    img.alt = `${className} job icon`;
    img.title = className;
    img.decoding = 'async';
    img.addEventListener('error', () => {
      if (!img.isConnected) return;
      orb.style.display = '';
      img.replaceWith(orb);
    }, {once:true});

    orb.replaceWith(img);
    return true;
  }

  function start(){
    applyJobIcon();

    const profile = document.getElementById('profile') || document.body;
    const observer = new MutationObserver(() => { applyJobIcon(); });
    observer.observe(profile, {subtree:true, childList:true, characterData:true});

    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      applyJobIcon().then(done => {
        if (done || tries >= 40) clearInterval(timer);
      });
    }, 250);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, {once:true});
  } else {
    start();
  }
})();
