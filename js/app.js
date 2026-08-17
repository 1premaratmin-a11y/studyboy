/* ============================================================
   StudyBoy — App controller (wires shell, routing, theme)
   ============================================================ */
(function (global) {
  'use strict';
  const { Store, Router, Views } = global;

  const TITLES = { dashboard:'Dashboard', focus:'Focus Timer', flashcards:'Flashcards', notes:'Notes', analytics:'Analytics' };

  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    const s = Store.get(); if (s.settings.theme !== t) Store.setTheme(t);
    const streak = document.getElementById('streakValue');
    if (streak) streak.textContent = s.profile.streak;
  }

  function setActiveNav(route) {
    document.querySelectorAll('.nav__item').forEach(b => b.classList.toggle('is-active', b.dataset.route === route));
    const title = document.getElementById('viewTitle');
    if (title) title.textContent = TITLES[route] || 'StudyBoy';
  }

  function render() {
    const route = Router.current();
    setActiveNav(route);
    const view = document.getElementById('view');
    view.scrollTop = 0;
    const node = Views[route] ? Views[route]() : Views.dashboard();
    view.innerHTML = '';
    view.appendChild(node);
  }

  function init() {
    // Theme
    applyTheme(Store.get().settings.theme || 'dark');

    // Nav clicks
    document.querySelectorAll('.nav__item').forEach(b => {
      b.addEventListener('click', () => Router.go(b.dataset.route));
    });

    // Theme toggle
    document.getElementById('themeToggle').addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme');
      applyTheme(cur === 'dark' ? 'light' : 'dark');
    });

    // Mobile menu
    const sidebar = document.getElementById('sidebar');
    const menuBtn = document.getElementById('menuToggle');
    let backdrop = document.querySelector('.backdrop');
    if (!backdrop) { backdrop = document.createElement('div'); backdrop.className = 'backdrop'; document.body.appendChild(backdrop); }
    function openMenu() { sidebar.classList.add('is-open'); backdrop.classList.add('is-open'); }
    function closeMenu() { sidebar.classList.remove('is-open'); backdrop.classList.remove('is-open'); }
    menuBtn.addEventListener('click', openMenu);
    backdrop.addEventListener('click', closeMenu);
    document.querySelectorAll('.nav__item').forEach(b => b.addEventListener('click', closeMenu));

    // Notifications (demo)
    document.getElementById('notifBtn').addEventListener('click', () => {
      global.Toast('No new notifications — you\'re all caught up ✨', 'success');
      const dot = document.querySelector('#notifBtn .dot'); if (dot) dot.style.display = 'none';
    });

    // Global search (⌘K focus)
    const search = document.getElementById('globalSearch');
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); search.focus(); }
      if (e.key === 'Escape') search.blur();
    });
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const q = search.value.trim().toLowerCase();
        if (!q) return;
        // route by keyword
        if (/(timer|focus|pomodoro)/.test(q)) Router.go('focus');
        else if (/(card|deck|flash|quiz)/.test(q)) Router.go('flashcards');
        else if (/(note|write|essay)/.test(q)) Router.go('notes');
        else if (/(analytic|stat|chart|progress)/.test(q)) Router.go('analytics');
        else Router.go('dashboard');
        global.Toast('Searching "'+q+'"…', 'success');
        search.value = '';
      }
    });

    // Avatar (demo profile)
    document.querySelector('.avatar').addEventListener('click', () => {
      global.Toast('Profile settings coming soon ✨');
    });

    // Routing
    Router.onChange(render);
    render();
  }

  const App = { render, init };
  global.App = App;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);