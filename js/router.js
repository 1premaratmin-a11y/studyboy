/* ============================================================
   StudyBoy — Router (hash-based)
   ============================================================ */
(function (global) {
  'use strict';

  const routes = ['dashboard','focus','flashcards','notes','analytics'];
  const listeners = [];

  function current() {
    const h = (location.hash || '').replace('#/', '').replace('#','');
    return routes.includes(h) ? h : 'dashboard';
  }
  function go(route) {
    if (!routes.includes(route)) route = 'dashboard';
    if (location.hash !== '#/' + route) location.hash = '#/' + route;
  }
  function onChange(fn) { listeners.push(fn); }
  function emit() { listeners.forEach(fn => fn(current())); }

  window.addEventListener('hashchange', emit);

  global.Router = { current, go, onChange, routes };
})(window);