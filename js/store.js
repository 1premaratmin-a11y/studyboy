/* ============================================================
   StudyBoy — Store (state + localStorage persistence + seed)
   ============================================================ */
(function (global) {
  'use strict';

  const KEY = 'studyboy.v1';
  const SUBJECTS = ['math','science','history','language','art','cs'];
  const SUBJECT_LABELS = { math:'Math', science:'Science', history:'History', language:'Language', art:'Art', cs:'CS' };

  function todayISO() { return new Date().toISOString().slice(0,10); }
  function daysAgoISO(n) { const d = new Date(); d.setDate(d.getDate()-n); return d.toISOString().slice(0,10); }
  function uid() { return Math.random().toString(36).slice(2, 9); }

  function seed() {
    const tasks = [
      { id: uid(), title: 'Calculus problem set 4', subject:'math', minutes: 45, done: true, due: todayISO() },
      { id: uid(), title: 'Read Biology chapter 7', subject:'science', minutes: 30, done: true, due: todayISO() },
      { id: uid(), title: 'Essay outline — WWI causes', subject:'history', minutes: 60, done: false, due: todayISO() },
      { id: uid(), title: 'Spanish vocab review', subject:'language', minutes: 20, done: false, due: todayISO() },
      { id: uid(), title: 'Binary trees practice', subject:'cs', minutes: 40, done: false, due: daysAgoISO(1) },
    ];

    const decks = [
      { id: uid(), name: 'Organic Chemistry', subject:'science', cards: [
        { id: uid(), q:'What is the formula of ethanol?', a:'C₂H₅OH (or CH₃CH₂OH)' },
        { id: uid(), q:'Define a functional group.', a:'An atom or group of atoms responsible for the characteristic reactions of a compound.' },
        { id: uid(), q:'What is a chiral center?', a:'A carbon atom bonded to four different groups.' },
        { id: uid(), q:'IUPAC name of CH₃COOH?', a:'Ethanoic acid (acetic acid).' },
      ]},
      { id: uid(), name: 'Spanish Verbs', subject:'language', cards: [
        { id: uid(), q:'Conjugate "ser" in present (yo)', a:'Soy' },
        { id: uid(), q:'Conjugate "tener" (tú)', a:'Tienes' },
        { id: uid(), q:'"To eat" in Spanish', a:'Comer' },
      ]},
      { id: uid(), name: 'AP World History', subject:'history', cards: [
        { id: uid(), q:'Year the Berlin Wall fell', a:'1989' },
        { id: uid(), q:'What caused the Industrial Revolution?', a:'Steam power, mechanization, and agricultural surplus in 18th-century Britain.' },
      ]},
      { id: uid(), name: 'Data Structures', subject:'cs', cards: [
        { id: uid(), q:'Time complexity of binary search', a:'O(log n)' },
        { id: uid(), q:'Define a hash collision', a:'When two distinct keys map to the same hash bucket.' },
        { id: uid(), q:'Difference stack vs queue', a:'Stack is LIFO; queue is FIFO.' },
        { id: uid(), q:'What is a BST?', a:'A binary tree where left child < parent < right child.' },
      ]},
    ];

    const notes = [
      { id: uid(), title:'Limits & Continuity', subject:'math', body:'A limit lim(x→a) f(x) = L means f(x) approaches L as x approaches a.\n\nA function is continuous at a if:\n1. f(a) is defined\n2. lim(x→a) f(x) exists\n3. The limit equals f(a)\n\nKey techniques: factoring, rationalizing, L\'Hôpital\'s rule.', updatedAt: Date.now() - 86400000 },
      { id: uid(), title:'Cell Membrane Structure', subject:'science', body:'Phospholipid bilayer with embedded proteins.\n\n• Fluid mosaic model\n• Selectively permeable\n• Contains cholesterol for stability\n\nTransport: passive (diffusion, osmosis) vs active (pumps).', updatedAt: Date.now() - 172800000 },
      { id: uid(), title:'Essay Thesis — WWI', subject:'history', body:'Thesis: WWI was caused by a convergence of militarism, alliance networks, and nationalist tensions in the Balkans.\n\nKey points:\n- Schlieffen Plan\n- Assassination of Archduke Franz Ferdinand\n- July Crisis', updatedAt: Date.now() - 3600000 },
    ];

    // Study sessions: last 14 days, varying minutes per subject
    const sessions = [];
    for (let d = 13; d >= 0; d--) {
      const day = daysAgoISO(d);
      const count = d % 3 === 0 ? 3 : (d % 2 === 0 ? 2 : 1);
      for (let i = 0; i < count; i++) {
        const subj = SUBJECTS[(d + i) % SUBJECTS.length];
        sessions.push({ id: uid(), date: day, subject: subj, minutes: 20 + Math.round(Math.random()*40) });
      }
    }

    return {
      profile: { name: 'Scholar', streak: 7, goalMinutes: 180 },
      tasks, decks, notes, sessions,
      settings: { theme: 'dark', pomodoro: { focus: 25, short: 5, long: 15, rounds: 4 } },
      meta: { createdAt: Date.now() },
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    const s = seed();
    save(s);
    return s;
  }
  function save(state) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }

  const state = load();
  const listeners = [];

  const store = {
    SUBJECTS, SUBJECT_LABELS,
    get: () => state,
    persist: () => save(state),
    subscribe: (fn) => { listeners.push(fn); return () => { const i = listeners.indexOf(fn); if (i>-1) listeners.splice(i,1); }; },
    notify: () => { state.__rev = (state.__rev||0)+1; save(state); listeners.forEach(fn => fn(state)); },

    // Tasks
    addTask(t) { state.tasks.unshift({ id: uid(), done:false, due: todayISO(), ...t }); this.notify(); },
    toggleTask(id) { const t = state.tasks.find(x=>x.id===id); if(t){ t.done=!t.done; this.notify(); } },
    removeTask(id) { state.tasks = state.tasks.filter(x=>x.id!==id); this.notify(); },

    // Decks / cards
    addDeck(name, subject) { const d = { id: uid(), name, subject, cards: [] }; state.decks.push(d); this.notify(); return d; },
    removeDeck(id) { state.decks = state.decks.filter(d=>d.id!==id); this.notify(); },
    addCard(deckId, q, a) { const d = state.decks.find(x=>x.id===deckId); if(d){ d.cards.push({ id: uid(), q, a }); this.notify(); } },
    removeCard(deckId, cardId) { const d = state.decks.find(x=>x.id===deckId); if(d){ d.cards = d.cards.filter(c=>c.id!==cardId); this.notify(); } },

    // Notes
    addNote(subject='math') { const n = { id: uid(), title:'Untitled note', subject, body:'', updatedAt: Date.now() }; state.notes.unshift(n); this.notify(); return n; },
    updateNote(id, patch) { const n = state.notes.find(x=>x.id===id); if(n){ Object.assign(n, patch, { updatedAt: Date.now() }); this.notify(); } },
    removeNote(id) { state.notes = state.notes.filter(x=>x.id!==id); this.notify(); },

    // Sessions
    addSession(subject, minutes) { state.sessions.push({ id: uid(), date: todayISO(), subject, minutes }); this.notify(); },

    // Settings
    setTheme(t) { state.settings.theme = t; this.notify(); },

    reset() { const s = seed(); Object.assign(state, s); this.notify(); },
  };

  global.Store = store;
})(window);