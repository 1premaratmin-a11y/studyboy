/* ============================================================
   StudyBoy — Views (render functions for each route)
   ============================================================ */
(function (global) {
  'use strict';
  const { Store, Router } = global;
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html!=null) e.innerHTML = html; return e; };
  const svg = (path) => '<svg viewBox="0 0 24 24">' + path + '</svg>';
  const ICON = {
    check: svg('<path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2Z" fill="currentColor"/>'),
    play: svg('<path d="M8 5v14l11-7L8 5Z" fill="currentColor"/>'),
    pause: svg('<path d="M6 5h4v14H6V5Zm8 0h4v14h-4V5Z" fill="currentColor"/>'),
    plus: svg('<path d="M11 11V5h2v6h6v2h-6v6h-2v-6H5v-2h6Z" fill="currentColor"/>'),
    trash: svg('<path d="M6 7h12v2H6V7Zm2 3h8l-1 11H9L8 10Zm2-5h4l1 2H7l1-2Z" fill="currentColor"/>'),
    close: svg('<path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>'),
    left: svg('<path d="M15.5 4 8 12l7.5 8 1.4-1.4L10.8 12 16.9 5.4 15.5 4Z" fill="currentColor"/>'),
    right: svg('<path d="M8.5 4 16 12l-7.5 8-1.4-1.4L13.2 12 7.1 5.4 8.5 4Z" fill="currentColor"/>'),
    fire: '🔥', clock: '⏱', target: '🎯', book: '📚', check2: '✅', bolt: '⚡',
  };

  function fmtTime(min) {
    const h = Math.floor(min/60), m = min%60;
    return h>0 ? h+'h '+m+'m' : m+'m';
  }
  function relTime(ts) {
    const diff = Date.now() - ts;
    const d = Math.floor(diff/86400000);
    if (d===0) return 'Today';
    if (d===1) return 'Yesterday';
    if (d<7) return d+' days ago';
    return new Date(ts).toLocaleDateString();
  }

  /* ---------------- Dashboard ---------------- */
  function dashboard() {
    const s = Store.get();
    const today = new Date().toISOString().slice(0,10);
    const todaySessions = s.sessions.filter(x=>x.date===today);
    const todayMinutes = todaySessions.reduce((a,b)=>a+b.minutes,0);
    const todayTasks = s.tasks.filter(x=>x.due===today);
    const doneTasks = todayTasks.filter(x=>x.done).length;
    const totalCards = s.decks.reduce((a,b)=>a+b.cards.length,0);
    const hour = new Date().getHours();
    const greet = hour<12?'Good morning':hour<18?'Good afternoon':'Good evening';

    const wrap = el('div','view__inner');
    wrap.innerHTML = [
      '<div class="view__head reveal">',
        '<div class="view__greeting">',
          '<span class="eyebrow">'+new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})+'</span>',
          '<h1 class="h1">'+greet+', '+s.profile.name+' 👋</h1>',
          '<p class="lead muted">You have studied '+fmtTime(todayMinutes)+' today. '+(todayMinutes>=s.profile.goalMinutes?'Goal smashed — nicely done.':'Keep going to hit your '+fmtTime(s.profile.goalMinutes)+' goal.')+'</p>',
        '</div>',
        '<div class="card__actions">',
          '<button class="btn btn--ghost" id="quickNoteBtn">'+ICON.plus+' New note</button>',
          '<button class="btn btn--primary" id="quickFocusBtn">'+ICON.play+' Start focus</button>',
        '</div>',
      '</div>',
      '<div class="grid grid--stats reveal-2">',
        statCard('focus', fmtTime(todayMinutes), 'Focused today', '↑ 18% vs avg','up', ICON.clock),
        statCard('tasks', doneTasks+'/'+todayTasks.length, 'Tasks done', todayTasks.length? (todayTasks.length-doneTasks)+' left' : 'All clear','up', ICON.check2, 'green'),
        statCard('streak', s.profile.streak+' days', 'Current streak', 'Personal best!','up', ICON.fire, 'amber'),
        statCard('cards', totalCards, 'Flashcards', s.decks.length+' decks','up', ICON.book, 'violet'),
      '</div>',
      '<div class="grid grid--3 reveal-3">',
        '<div class="card span-2">',
          '<div class="card__head">',
            '<div><div class="card__title">Today\'s plan</div><div class="card__sub">'+todayTasks.length+' tasks scheduled</div></div>',
            '<button class="btn btn--sm btn--ghost" id="addTaskBtn">'+ICON.plus+' Add task</button>',
          '</div>',
          '<div id="taskList"></div>',
        '</div>',
        '<div class="card">',
          '<div class="card__head"><div class="card__title">Weekly focus</div></div>',
          '<div class="chart-wrap" id="weekChart"></div>',
          '<div class="legend" id="weekLegend"></div>',
        '</div>',
      '</div>',
      '<div class="grid grid--2 reveal-4">',
        '<div class="card">',
          '<div class="card__head"><div class="card__title">Continue studying</div><button class="btn btn--sm btn--ghost" data-route="flashcards">View all</button></div>',
          '<div class="deck-grid" id="deckPreview"></div>',
        '</div>',
        '<div class="card">',
          '<div class="card__head"><div class="card__title">Recent notes</div><button class="btn btn--sm btn--ghost" data-route="notes">Open notes</button></div>',
          '<div id="recentNotes"></div>',
        '</div>',
      '</div>'
    ].join('');

    const tl = wrap.querySelector('#taskList');
    if (!todayTasks.length) tl.appendChild(emptyState('🌙','No tasks today','Enjoy the breather or add a task to plan ahead.'));
    else todayTasks.forEach(t => tl.appendChild(taskRow(t)));

    wrap.querySelector('#weekChart').appendChild(weekBarChart(7));
    wrap.querySelector('#weekLegend').innerHTML = '<div class="legend__row"><span class="legend__swatch bg-math"></span><span class="legend__name">This week</span><span class="legend__val">'+fmtTime(weekTotal(7))+'</span></div>';

    const dp = wrap.querySelector('#deckPreview');
    Store.get().decks.slice(0,2).forEach(d => dp.appendChild(deckMini(d)));

    const rn = wrap.querySelector('#recentNotes');
    Store.get().notes.slice().sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,3).forEach(n => {
      const row = el('div','task');
      row.style.cursor='pointer';
      row.innerHTML = '<div class="stat__icon" style="width:34px;height:34px"><span class="s-'+n.subject+'">●</span></div><div class="task__body"><div class="task__title">'+escapeHtml(n.title)+'</div><div class="task__meta">'+Store.SUBJECT_LABELS[n.subject]+' · '+relTime(n.updatedAt)+'</div></div>';
      row.addEventListener('click',()=>Router.go('notes'));
      rn.appendChild(row);
    });

    wrap.querySelector('#quickNoteBtn').addEventListener('click',()=>{ Store.addNote(); Router.go('notes'); });
    wrap.querySelector('#quickFocusBtn').addEventListener('click',()=>Router.go('focus'));
    wrap.querySelector('#addTaskBtn').addEventListener('click',()=>openTaskModal());
    wrap.querySelectorAll('[data-route]').forEach(b=>b.addEventListener('click',()=>Router.go(b.dataset.route)));
    return wrap;
  }

  function statCard(key, value, label, delta, dir, icon, color) {
    color = color || '';
    return '<div class="card stat"><div class="stat__top"><div class="stat__icon stat__icon--'+color+'">'+icon+'</div></div><div><div class="stat__value">'+value+'</div><div class="stat__label">'+label+'</div></div><div class="stat__delta stat__delta--'+dir+'">'+delta+'</div></div>';
  }

  function taskRow(t) {
    const row = el('div','task'+(t.done?' is-done':''));
    row.dataset.id = t.id;
    row.innerHTML = '<div class="task__check" role="checkbox" aria-checked="'+t.done+'">'+ICON.check+'</div><div class="task__body"><div class="task__title">'+escapeHtml(t.title)+'</div><div class="task__meta"><span class="subject-dot bg-'+t.subject+'"></span><span class="s-'+t.subject+'">'+Store.SUBJECT_LABELS[t.subject]+'</span><span>·</span><span>'+fmtTime(t.minutes)+'</span></div></div><button class="icon-btn" data-del="'+t.id+'" aria-label="Delete" style="width:32px;height:32px">'+ICON.trash+'</button>';
    row.querySelector('.task__check').addEventListener('click',()=>Store.toggleTask(t.id));
    row.querySelector('[data-del]').addEventListener('click',(e)=>{ e.stopPropagation(); Store.removeTask(t.id); toast('Task removed','warn'); });
    return row;
  }

  function deckMini(d) {
    const node = el('div','deck');
    node.innerHTML = '<div><div class="deck__count">'+d.cards.length+' cards</div><div class="deck__name">'+escapeHtml(d.name)+'</div></div><div class="deck__foot"><span class="chip chip--accent"><span class="subject-dot bg-'+d.subject+'"></span>'+Store.SUBJECT_LABELS[d.subject]+'</span></div>';
    node.addEventListener('click',()=>{ Router.go('flashcards'); setTimeout(()=>global.Flash.openDeck(d.id),60); });
    return node;
  }

  function emptyState(icon,title,text) {
    const e = el('div','empty');
    e.innerHTML = '<div class="empty__icon">'+icon+'</div><div class="empty__title">'+title+'</div><div class="empty__text">'+text+'</div>';
    return e;
  }
  /* ---------------- Focus Timer ---------------- */
  function focus() {
    const s = Store.get();
    const p = s.settings.pomodoro;
    const wrap = el('div','view__inner');
    wrap.innerHTML = [
      '<div class="view__head reveal"><div class="view__greeting"><span class="eyebrow">Deep work</span><h1 class="h1">Focus Timer</h1><p class="lead muted">Work in focused sprints. Pick a subject, hit play, and let distractions fade.</p></div></div>',
      '<div class="grid grid--2 reveal-2">',
        '<div class="card"><div class="timer">',
          '<div class="timer__mode" id="modeGroup">',
            '<button data-mode="focus" class="is-active">Focus · '+p.focus+'m</button>',
            '<button data-mode="short">Short · '+p.short+'m</button>',
            '<button data-mode="long">Long · '+p.long+'m</button>',
          '</div>',
          '<div class="timer__dial"><svg viewBox="0 0 200 200"><defs><linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#7c9cff"/><stop offset="1" stop-color="#b18cff"/></linearGradient></defs><circle class="ring__track" cx="100" cy="100" r="92" fill="none" stroke-width="10"/><circle class="ring__fill" id="ringFill" cx="100" cy="100" r="92" fill="none" stroke-width="10" stroke-dasharray="578" stroke-dashoffset="0"/></svg><div class="timer__center"><div class="timer__time" id="timerTime">25:00</div><div class="timer__phase" id="timerPhase">Ready to focus</div></div></div>',
          '<div class="timer__controls"><button class="icon-btn" id="resetBtn" aria-label="Reset">'+svg('<path d="M12 5V2L8 6l4 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7Z" fill="currentColor"/>')+'</button><button class="timer__play" id="playBtn">'+ICON.play+'</button><button class="icon-btn" id="skipBtn" aria-label="Skip">'+svg('<path d="M6 18l8.5-6L6 6v12Zm9-12v12h2V6h-2Z" fill="currentColor"/>')+'</button></div>',
          '<div class="timer__rounds" id="rounds"></div>',
        '</div></div>',
        '<div class="timer-side reveal-3">',
          '<div class="card"><div class="card__head"><div class="card__title">Session settings</div></div><div class="field" style="margin-bottom:14px"><span class="label">Studying</span><div class="select-row" id="subjectRow"></div></div><div class="field"><span class="label">Quick start</span><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn--sm" data-min="15">15m</button><button class="btn btn--sm" data-min="25">25m</button><button class="btn btn--sm" data-min="45">45m</button><button class="btn btn--sm" data-min="60">60m</button></div></div></div>',
          '<div class="card"><div class="card__head"><div class="card__title">Today\'s sessions</div><span class="chip chip--accent" id="todayCount"></span></div><div id="sessionList" style="display:flex;flex-direction:column;gap:8px"></div></div>',
        '</div>',
      '</div>'
    ].join('');

    const sr = wrap.querySelector('#subjectRow');
    let activeSubject = 'math';
    Store.SUBJECTS.forEach(sub => {
      const c = el('button','select-chip'+(sub===activeSubject?' is-active':''));
      c.innerHTML = '<span class="subject-dot bg-'+sub+'"></span> '+Store.SUBJECT_LABELS[sub];
      c.addEventListener('click',()=>{ activeSubject=sub; sr.querySelectorAll('.select-chip').forEach(x=>x.classList.remove('is-active')); c.classList.add('is-active'); });
      sr.appendChild(c);
    });

    wrap.querySelectorAll('[data-min]').forEach(b=>b.addEventListener('click',()=>{ Timer.setMode('custom', parseInt(b.dataset.min,10)); Timer.start(); }));
    renderSessions(wrap);
    Timer.bind(wrap, activeSubject);
    return wrap;
  }

  function renderSessions(wrap) {
    const s = Store.get();
    const today = new Date().toISOString().slice(0,10);
    const todayS = s.sessions.filter(x=>x.date===today);
    wrap.querySelector('#todayCount').textContent = todayS.length+' session'+(todayS.length!==1?'s':'');
    const list = wrap.querySelector('#sessionList');
    list.innerHTML='';
    if (!todayS.length) { list.appendChild(emptyState('⏱','No sessions yet','Hit play to log your first focus block.')); return; }
    todayS.slice().reverse().forEach(s => {
      const row = el('div','session-row');
      row.innerHTML = '<div class="session-row__icon"><span class="s-'+s.subject+'">●</span></div><div class="session-row__body"><div class="session-row__title">'+Store.SUBJECT_LABELS[s.subject]+'</div><div class="session-row__meta">'+fmtTime(s.minutes)+' · focused</div></div>';
      list.appendChild(row);
    });
  }

  const Timer = (function(){
    let mode='focus', total=25*60, remaining=25*60, running=false, interval=null, subject='math', view=null, completedRounds=0;
    const MODE_MIN = { focus:25, short:5, long:15 };
    function fmt(sec){ const m=Math.floor(sec/60), s=sec%60; return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0'); }
    function render() {
      if (!view) return;
      const t = view.querySelector('#timerTime'); if (t) t.textContent = fmt(remaining);
      const ring = view.querySelector('#ringFill');
      if (ring) { const circ=2*Math.PI*92; ring.setAttribute('stroke-dasharray', circ); ring.setAttribute('stroke-dashoffset', circ*(1-remaining/total)); }
      const play = view.querySelector('#playBtn');
      if (play) { play.classList.toggle('is-running', running); play.innerHTML = running ? ICON.pause : ICON.play; }
      const phase = view.querySelector('#timerPhase');
      if (phase) phase.textContent = running ? (mode==='focus'?'Focusing…':'Break time') : (mode==='focus'?'Ready to focus':'Take a break');
      const rounds = view.querySelector('#rounds');
      if (rounds) { const p = Store.get().settings.pomodoro.rounds; rounds.innerHTML = Array.from({length:p},(_,i)=>'<div class="timer__round '+(i<completedRounds?'is-done':'')+'"></div>').join(''); }
      view.querySelectorAll('#modeGroup button').forEach(b=>b.classList.toggle('is-active', b.dataset.mode===mode));
    }
    function tick() { remaining--; if (remaining<=0) { complete(); return; } render(); }
    function complete() {
      stop();
      if (mode==='focus') { Store.addSession(subject, MODE_MIN.focus); completedRounds++; toast('Focus session complete! +'+MODE_MIN.focus+'m logged','success'); setMode('short'); }
      else { toast('Break finished — back to it','warn'); setMode('focus'); }
      if (view) renderSessions(view);
      render();
    }
    function start(){ if(running) return; running=true; interval=setInterval(tick,1000); render(); }
    function stop(){ running=false; clearInterval(interval); render(); }
    function toggle(){ running?stop():start(); }
    function reset(){ stop(); remaining=total; render(); }
    function skip(){ complete(); }
    function setMode(m, customMin) { mode = m==='custom'?'focus':m; const min = m==='custom' ? (customMin||25) : (Store.get().settings.pomodoro[m] || MODE_MIN[m] || 25); total = min*60; remaining = total; stop(); render(); }
    function bind(w, subj) {
      view = w; subject = subj; setMode('focus');
      w.querySelector('#playBtn').addEventListener('click', toggle);
      w.querySelector('#resetBtn').addEventListener('click', reset);
      w.querySelector('#skipBtn').addEventListener('click', skip);
      w.querySelectorAll('#modeGroup button').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
      const obs = new MutationObserver(()=>{ const act = w.querySelector('#subjectRow .is-active'); if(act){ const m=act.textContent.trim().split(' ').pop(); subject = Object.keys(Store.SUBJECT_LABELS).find(k=>Store.SUBJECT_LABELS[k]===m) || subject; } });
      obs.observe(w.querySelector('#subjectRow'),{subtree:true,attributes:true,attributeFilter:['class']});
      render();
    }
    return { bind, start, stop, toggle, reset, skip, setMode, render };
  })();

  /* ---------------- Flashcards ---------------- */
  const Flash = (function(){
    let deckId=null, idx=0, flipped=false;
    function deckOpen(){ return !!deckId; }

    function list() {
      const s = Store.get();
      const wrap = el('div','view__inner');
      wrap.innerHTML = '<div class="view__head reveal"><div class="view__greeting"><span class="eyebrow">Active recall</span><h1 class="h1">Flashcards</h1><p class="lead muted">Spaced repetition made simple. Pick a deck and flip your way to mastery.</p></div><button class="btn btn--primary" id="newDeckBtn">'+ICON.plus+' New deck</button></div><div class="deck-grid reveal-2" id="deckGrid"></div>';
      const grid = wrap.querySelector('#deckGrid');
      if (!s.decks.length) grid.appendChild(emptyState('📚','No decks yet','Create your first deck to start practicing.'));
      s.decks.forEach(d => {
        const node = el('div','deck');
        node.innerHTML = '<div><div class="deck__count">'+d.cards.length+' cards</div><div class="deck__name">'+escapeHtml(d.name)+'</div></div><div class="deck__foot"><span class="chip chip--accent"><span class="subject-dot bg-'+d.subject+'"></span>'+Store.SUBJECT_LABELS[d.subject]+'</span><button class="icon-btn deck-del" data-del="'+d.id+'" style="width:30px;height:30px">'+ICON.trash+'</button></div>';
        node.addEventListener('click',(e)=>{ if(e.target.closest('[data-del]')) return; openDeck(d.id); });
        node.querySelector('[data-del]').addEventListener('click',(e)=>{ e.stopPropagation(); Store.removeDeck(d.id); toast('Deck removed','warn'); global.App.render(); });
        grid.appendChild(node);
      });
      wrap.querySelector('#newDeckBtn').addEventListener('click', openDeckModal);
      return wrap;
    }

    function study() {
      const s = Store.get();
      const deck = s.decks.find(d=>d.id===deckId);
      const wrap = el('div','view__inner');
      if (!deck || !deck.cards.length) {
        wrap.innerHTML = '<div class="card reveal" style="padding:48px;text-align:center"><h2 class="h2" style="margin-bottom:8px">'+(deck?escapeHtml(deck.name):'Deck')+'</h2><p class="muted" style="margin-bottom:18px">This deck has no cards yet. Add some to start studying.</p><div style="display:flex;gap:10px;justify-content:center"><button class="btn" id="backBtn">Back to decks</button><button class="btn btn--primary" id="addCardBtn">'+ICON.plus+' Add card</button></div></div>';
        wrap.querySelector('#backBtn').addEventListener('click',()=>{ deckId=null; global.App.render(); });
        wrap.querySelector('#addCardBtn').addEventListener('click',()=>openCardModal(deck.id));
        return wrap;
      }
      const total = deck.cards.length;
      const pos = (idx % total) + 1;
      const card = deck.cards[idx % total];
      wrap.innerHTML = [
        '<div class="view__head reveal"><div class="view__greeting"><span class="eyebrow">'+Store.SUBJECT_LABELS[deck.subject]+'</span><h1 class="h1">'+escapeHtml(deck.name)+'</h1><p class="lead muted">Card '+pos+' of '+total+' · tap the card to flip</p></div><div class="card__actions"><button class="btn btn--sm" id="addCardBtn">'+ICON.plus+' Add card</button><button class="btn btn--sm btn--ghost" id="exitBtn">Exit</button></div></div>',
        '<div class="card reveal-2" style="padding:36px"><div class="flashcard-stage"><div class="flashcard" id="card"><div class="flashcard__face flashcard__front"><span class="flashcard__eyebrow">Question</span><div class="flashcard__q">'+escapeHtml(card.q)+'</div><div class="flashcard__hint">Tap to reveal answer</div></div><div class="flashcard__face flashcard__back"><span class="flashcard__eyebrow">Answer</span><div class="flashcard__a">'+escapeHtml(card.a)+'</div><div class="flashcard__hint">Tap to flip back</div></div></div></div>',
        '<div class="flash-controls"><button class="btn btn--icon" id="prevBtn" aria-label="Previous">'+ICON.left+'</button><button class="btn" id="flipBtn">Flip card</button><button class="btn btn--primary" id="nextBtn">Next '+ICON.right+'</button></div>',
        '<div class="progress" style="margin-top:20px"><div class="progress__fill" style="width:'+(pos/total*100)+'%"></div></div></div>'
      ].join('');
      const cardEl = wrap.querySelector('#card');
      const flip = ()=>{ flipped=!flipped; cardEl.classList.toggle('is-flipped', flipped); };
      cardEl.addEventListener('click', flip);
      wrap.querySelector('#flipBtn').addEventListener('click', flip);
      wrap.querySelector('#prevBtn').addEventListener('click',()=>{ flipped=false; idx=(idx-1+total)%total; global.App.render(); });
      wrap.querySelector('#nextBtn').addEventListener('click',()=>{ flipped=false; idx=(idx+1)%total; global.App.render(); toast('Nice — keep going!','success'); });
      wrap.querySelector('#exitBtn').addEventListener('click',()=>{ deckId=null; global.App.render(); });
      wrap.querySelector('#addCardBtn').addEventListener('click',()=>openCardModal(deck.id));
      return wrap;
    }

    function openDeck(id) { deckId=id; idx=0; flipped=false; global.App.render(); }
    function openDeckModal() {
      const body = '<div class="field"><span class="label">Deck name</span><input class="input" id="dName" placeholder="e.g. Organic Chemistry"/></div><div class="field"><span class="label">Subject</span><div class="select-row" id="dSubject"></div></div>';
      const foot = '<button class="btn" data-close>Cancel</button><button class="btn btn--primary" id="createDeck">Create deck</button>';
      const m = modal('New deck', body, foot);
      let subj='math';
      const row = m.querySelector('#dSubject');
      Store.SUBJECTS.forEach(s=>{ const c=el('button','select-chip'+(s===subj?' is-active':'')); c.innerHTML='<span class="subject-dot bg-'+s+'"></span> '+Store.SUBJECT_LABELS[s]; c.addEventListener('click',()=>{ subj=s; row.querySelectorAll('.select-chip').forEach(x=>x.classList.remove('is-active')); c.classList.add('is-active'); }); row.appendChild(c); });
      m.querySelector('#createDeck').addEventListener('click',()=>{ const name=m.querySelector('#dName').value.trim(); if(!name){toast('Enter a deck name','warn');return;} Store.addDeck(name,subj); closeModal(m); toast('Deck created','success'); global.App.render(); });
    }
    function openCardModal(did) {
      const body = '<div class="field"><span class="label">Question (front)</span><textarea class="textarea" id="cQ" placeholder="What is...?"></textarea></div><div class="field"><span class="label">Answer (back)</span><textarea class="textarea" id="cA" placeholder="The answer is..."></textarea></div>';
      const foot = '<button class="btn" data-close>Cancel</button><button class="btn btn--primary" id="addCard">Add card</button>';
      const m = modal('Add card', body, foot);
      m.querySelector('#addCard').addEventListener('click',()=>{ const q=m.querySelector('#cQ').value.trim(), a=m.querySelector('#cA').value.trim(); if(!q||!a){toast('Fill in both sides','warn');return;} Store.addCard(did,q,a); closeModal(m); toast('Card added','success'); global.App.render(); });
    }
    return { list, study, openDeck, deckOpen };
  })();

  /* ---------------- Notes ---------------- */
  function notes() {
    const s = Store.get();
    const wrap = el('div','view__inner');
    wrap.innerHTML = '<div class="view__head reveal"><div class="view__greeting"><span class="eyebrow">Knowledge base</span><h1 class="h1">Notes</h1><p class="lead muted">Capture ideas, formulas, and summaries — organized by subject.</p></div><button class="btn btn--primary" id="newNote">'+ICON.plus+' New note</button></div><div class="card card--padless reveal-2"><div class="notes-layout"><div class="notes-sidebar"><div class="select-row" id="noteFilter"></div><div class="notes-list" id="notesList"></div></div><div class="notes-editor" id="editor"></div></div></div>';
    let activeId = s.notes[0] ? s.notes[0].id : null;
    let filter = 'all';

    function renderList() {
      const list = wrap.querySelector('#notesList');
      list.innerHTML='';
      const items = s.notes.slice().sort((a,b)=>b.updatedAt-a.updatedAt).filter(n=>filter==='all'||n.subject===filter);
      if (!items.length) list.appendChild(emptyState('📝','No notes','Create one to get started.'));
      items.forEach(n=>{
        const it = el('div','note-item'+(n.id===activeId?' is-active':''));
        it.innerHTML = '<div class="note-item__title">'+escapeHtml(n.title||'Untitled')+'</div><div class="note-item__date"><span class="s-'+n.subject+'">●</span> '+Store.SUBJECT_LABELS[n.subject]+' · '+relTime(n.updatedAt)+'</div>';
        it.addEventListener('click',()=>{ activeId=n.id; renderList(); renderEditor(); });
        list.appendChild(it);
      });
    }
    function renderEditor() {
      const ed = wrap.querySelector('#editor');
      const n = s.notes.find(x=>x.id===activeId);
      if (!n) { ed.innerHTML = '<div class="notes-empty"><div class="notes-empty__icon">📝</div><div>Select or create a note</div></div>'; return; }
      ed.innerHTML = '<input class="notes-editor__title" id="nTitle" value="'+escapeHtml(n.title)+'" placeholder="Note title…"/><div class="notes-editor__meta"><span class="chip chip--accent"><span class="subject-dot bg-'+n.subject+'"></span>'+Store.SUBJECT_LABELS[n.subject]+'</span><span>·</span><span>Edited '+relTime(n.updatedAt)+'</span><span style="flex:1"></span><button class="btn btn--sm btn--danger" id="delNote">'+ICON.trash+' Delete</button></div><textarea class="notes-editor__body" id="nBody" placeholder="Start writing…">'+escapeHtml(n.body)+'</textarea>';
      const titleIn = ed.querySelector('#nTitle'), bodyIn = ed.querySelector('#nBody');
      let saveT;
      const save = ()=>{ Store.updateNote(n.id,{ title: titleIn.value || 'Untitled', body: bodyIn.value }); clearTimeout(saveT); toast('Note saved','success'); setTimeout(renderList,0); };
      const debounced = ()=>{ clearTimeout(saveT); saveT=setTimeout(save, 700); };
      titleIn.addEventListener('input', debounced);
      bodyIn.addEventListener('input', debounced);
      ed.querySelector('#delNote').addEventListener('click',()=>{ Store.removeNote(n.id); activeId = Store.get().notes[0] ? Store.get().notes[0].id : null; renderList(); renderEditor(); toast('Note deleted','warn'); });
    }

    const fr = wrap.querySelector('#noteFilter');
    const allBtn = el('button','select-chip is-active'); allBtn.textContent='All';
    fr.appendChild(allBtn);
    Store.SUBJECTS.forEach(sub=>{ const c=el('button','select-chip'); c.innerHTML='<span class="subject-dot bg-'+sub+'"></span> '+Store.SUBJECT_LABELS[sub]; c.addEventListener('click',()=>{ filter=sub; fr.querySelectorAll('.select-chip').forEach(x=>x.classList.remove('is-active')); c.classList.add('is-active'); renderList(); }); fr.appendChild(c); });
    allBtn.addEventListener('click',()=>{ filter='all'; fr.querySelectorAll('.select-chip').forEach(x=>x.classList.remove('is-active')); allBtn.classList.add('is-active'); renderList(); });
    wrap.querySelector('#newNote').addEventListener('click',()=>{ const n=Store.addNote(filter!=='all'?filter:'math'); activeId=n.id; renderList(); renderEditor(); });
    renderList(); renderEditor();
    return wrap;
  }

  /* ---------------- Analytics ---------------- */
  function analytics() {
    const s = Store.get();
    const wrap = el('div','view__inner');
    const totalMin = s.sessions.reduce((a,b)=>a+b.minutes,0);
    const sessions = s.sessions.length;
    const avgPerDay = Math.round(totalMin/14);
    wrap.innerHTML = [
      '<div class="view__head reveal"><div class="view__greeting"><span class="eyebrow">Insights</span><h1 class="h1">Analytics</h1><p class="lead muted">Your study patterns over the last 14 days.</p></div><button class="btn btn--ghost" id="resetData">Reset demo data</button></div>',
      '<div class="grid grid--stats reveal-2">',
        statCard('total',fmtTime(totalMin),'Total focused','','up',ICON.clock),
        statCard('sessions',sessions,'Sessions',avgPerDay+'m/day avg','up',ICON.target,'green'),
        statCard('best',fmtTime(bestDay()),'Best day','','up',ICON.fire,'amber'),
        statCard('cards',s.decks.reduce((a,b)=>a+b.cards.length,0),'Flashcards',s.decks.length+' decks','up',ICON.book,'violet'),
      '</div>',
      '<div class="grid grid--3 reveal-3"><div class="card span-2 chart-card"><div class="card__head"><div class="card__title">Study time — last 14 days</div><span class="chip">minutes / day</span></div><div class="chart-wrap" id="bigChart"></div></div><div class="card chart-card"><div class="card__head"><div class="card__title">By subject</div></div><div class="donut" id="donut"></div><div class="legend" id="donutLegend"></div></div></div>',
      '<div class="card reveal-4"><div class="card__head"><div class="card__title">Activity heatmap</div><span class="chip">last 28 days</span></div><div class="heatmap" id="heatmap"></div></div>'
    ].join('');
    wrap.querySelector('#bigChart').appendChild(weekBarChart(14, true));
    donutChart(wrap.querySelector('#donut'), wrap.querySelector('#donutLegend'));
    heatmap(wrap.querySelector('#heatmap'));
    wrap.querySelector('#resetData').addEventListener('click',()=>{ if(confirm('Reset all data to the demo seed? This clears your changes.')){ Store.reset(); toast('Data reset','warn'); global.App.render(); } });
    return wrap;
  }

  function bestDay() {
    const s = Store.get();
    const byDay = {};
    s.sessions.forEach(x=>{ byDay[x.date]=(byDay[x.date]||0)+x.minutes; });
    return Math.max.apply(null, [0].concat(Object.values(byDay)));
  }
  function weekTotal(days) {
    return Store.get().sessions.filter(x=>{ const d=new Date(x.date); return (Date.now()-d.getTime())/86400000 < days; }).reduce((a,b)=>a+b.minutes,0);
  }
  function weekBarChart(days, big) {
    if (big===undefined) big=false;
    const s = Store.get();
    const byDay = {};
    for (let i=days-1;i>=0;i--){ const d=new Date(); d.setDate(d.getDate()-i); byDay[d.toISOString().slice(0,10)]=0; }
    s.sessions.forEach(x=>{ if(x.date in byDay) byDay[x.date]+=x.minutes; });
    const max = Math.max.apply(null,[60].concat(Object.values(byDay)));
    const wrap = el('div','bar-chart');
    Object.keys(byDay).forEach(function(date){
      const min = byDay[date];
      const d = new Date(date);
      const bar = el('div','bar');
      const fill = el('div','bar__fill');
      fill.style.height = (min/max*100)+'%';
      fill.setAttribute('data-value', min+'m');
      bar.appendChild(fill);
      const lbl = el('div','bar__label', big ? d.toLocaleDateString('en-US',{weekday:'short',day:'numeric'}) : d.toLocaleDateString('en-US',{weekday:'narrow'}));
      bar.appendChild(lbl);
      wrap.appendChild(bar);
    });
    return wrap;
  }
  function donutChart(node, legendNode) {
    const s = Store.get();
    const bySub = {};
    s.sessions.forEach(x=>{ bySub[x.subject]=(bySub[x.subject]||0)+x.minutes; });
    const entries = Object.keys(bySub).map(k=>[k,bySub[k]]).sort((a,b)=>b[1]-a[1]);
    const total = entries.reduce((a,b)=>a+b[1],0) || 1;
    const colors = { math:'#7c9cff', science:'#6ee7ff', history:'#fbbf24', language:'#fb7185', art:'#c4a7ff', cs:'#4ade80' };
    const r=70, sw=24, circ=2*Math.PI*r;
    let offset=0;
    let segs='';
    entries.forEach(function(pair){ const sub=pair[0], min=pair[1]; const frac=min/total; const len=circ*frac; segs += '<circle cx="90" cy="90" r="'+r+'" fill="none" stroke="'+colors[sub]+'" stroke-width="'+sw+'" stroke-dasharray="'+len+' '+(circ-len)+'" stroke-dashoffset="'+(-offset)+'"/>'; offset+=len; });
    node.innerHTML = '<svg viewBox="0 0 180 180" width="180" height="180">'+segs+'</svg><div class="donut__center"><div class="donut__value">'+fmtTime(total)+'</div><div class="donut__label">total</div></div>';
    legendNode.innerHTML = entries.map(function(pair){ const sub=pair[0], min=pair[1]; return '<div class="legend__row"><span class="legend__swatch" style="background:'+colors[sub]+'"></span><span class="legend__name">'+Store.SUBJECT_LABELS[sub]+'</span><span class="legend__val">'+Math.round(min/total*100)+'%</span></div>'; }).join('');
  }
  function heatmap(node) {
    const s = Store.get();
    const byDay = {};
    s.sessions.forEach(x=>{ byDay[x.date]=(byDay[x.date]||0)+x.minutes; });
    const cells = [];
    for (let i=27;i>=0;i--){ const d=new Date(); d.setDate(d.getDate()-i); const key=d.toISOString().slice(0,10); const min=byDay[key]||0; let lvl=0; if(min>0)lvl=1; if(min>=30)lvl=2; if(min>=60)lvl=3; if(min>=100)lvl=4; cells.push(lvl); }
    node.innerHTML = cells.map(function(l){ return '<div class="heat-cell '+(l?('heat-'+l):'')+'"></div>'; }).join('');
  }

  /* ---------------- Shared: modal, toast ---------------- */
  function modal(title, bodyHtml, footHtml) {
    const ov = el('div','modal-overlay');
    ov.innerHTML = '<div class="modal"><div class="modal__head"><div class="modal__title">'+title+'</div><button class="icon-btn" data-close style="width:32px;height:32px">'+ICON.close+'</button></div><div class="modal__body">'+bodyHtml+'</div><div class="modal__foot">'+footHtml+'</div></div>';
    document.body.appendChild(ov);
    ov.addEventListener('click',(e)=>{ if(e.target===ov||e.target.closest('[data-close]')) closeModal(ov); });
    return ov;
  }
  function closeModal(m){ m.style.animation='pop 160ms reverse'; setTimeout(()=>m.remove(),150); }

  function openTaskModal() {
    const body = '<div class="field"><span class="label">Task</span><input class="input" id="tName" placeholder="e.g. Read chapter 5"/></div><div class="field"><span class="label">Subject</span><div class="select-row" id="tSubject"></div></div><div class="field"><span class="label">Estimated time (minutes)</span><input class="input" id="tMin" type="number" value="30" min="5" max="240"/></div>';
    const foot = '<button class="btn" data-close>Cancel</button><button class="btn btn--primary" id="saveTask">Add task</button>';
    const m = modal('New task', body, foot);
    let subj='math';
    const row=m.querySelector('#tSubject');
    Store.SUBJECTS.forEach(s=>{ const c=el('button','select-chip'+(s===subj?' is-active':'')); c.innerHTML='<span class="subject-dot bg-'+s+'"></span> '+Store.SUBJECT_LABELS[s]; c.addEventListener('click',()=>{ subj=s; row.querySelectorAll('.select-chip').forEach(x=>x.classList.remove('is-active')); c.classList.add('is-active'); }); row.appendChild(c); });
    m.querySelector('#saveTask').addEventListener('click',()=>{ const title=m.querySelector('#tName').value.trim(); if(!title){toast('Enter a task name','warn');return;} const min=parseInt(m.querySelector('#tMin').value,10)||30; Store.addTask({title, subject:subj, minutes:min}); closeModal(m); toast('Task added','success'); global.App.render(); });
  }

  function toast(msg, type) {
    type = type || '';
    const t = el('div','toast '+(type?('is-'+type):''));
    const icon = type==='success'?'✓':type==='warn'?'!':'i';
    t.innerHTML = '<div class="toast__icon">'+icon+'</div><div>'+escapeHtml(msg)+'</div>';
    document.getElementById('toasts').appendChild(t);
    setTimeout(()=>{ t.style.animation='pop 200ms reverse'; setTimeout(()=>t.remove(),180); }, 2600);
  }

  function escapeHtml(str){ return String(str==null?'':str).replace(/[&<>"']/g,function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }

  global.Views = { dashboard: dashboard, focus: focus, flashcards: function(){ return Flash.deckOpen() ? Flash.study() : Flash.list(); }, notes: notes, analytics: analytics };
  global.Flash = Flash;
  global.Toast = toast;
})(window);
