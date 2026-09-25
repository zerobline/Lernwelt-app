// "Einmaleins" – multiplication 1–10 × 1–10 with three help levels and Leitner-box practice.
// Lernwelt app contract: mount(container, services) / unmount() / SettingsScreen / ProgressSummary
//
// The launcher provides the Home button, the parent area, speech, sounds, stars and the
// "Wirklich aufhören?" question; this module only draws the app itself.
import * as L from './logic.js';
import * as T from './tips.js';

const MAX_SESSIONS = 60;
const LEVELS = {
  1: { name: 'Viel Hilfe', sub: 'Punkte, Zahlenstrahl und Tipp' },
  2: { name: 'Wenig Hilfe', sub: 'Tipp auf Knopfdruck' },
  3: { name: 'Keine Hilfe', sub: 'Aus dem Kopf' },
};
const TIMERS = [0, 30, 20, 10];
const HOLD_MS = 1800;

// ------------------------------------------------------------------ storage
// Everything lives in one "data" entry of the app's launcher store.

export function defaults() {
  return { v: 1, level: 1, reihen: [1], facts: {}, sessions: [], settings: { timer: 0 } };
}

export function loadData(services) {
  const base = defaults();
  const d = services.storage.get('data', null);
  if (!d || typeof d !== 'object') return base;
  return { ...base, ...d, settings: { ...base.settings, ...(d.settings || {}) } };
}

// 0 = never seen (shown as "neu"), otherwise the Leitner box 1–5.
function shadeOf(facts, a, b) {
  const s = facts[L.key(a, b)];
  return s && s.seen ? s.box : 0;
}

function boxMeter(facts, list) {
  const counts = [0, 0, 0, 0, 0, 0];
  list.forEach((f) => counts[shadeOf(facts, f.a, f.b)]++);
  let html = '';
  for (let i = 5; i >= 1; i--) {
    if (counts[i]) html += `<i class="bx${i}" style="width:${(counts[i] / list.length) * 100}%"></i>`;
  }
  return `<span class="meter" aria-hidden="true">${html}</span>`;
}

function knownCount(facts, list) {
  return list.filter((f) => shadeOf(facts, f.a, f.b) >= 4).length;
}

// ------------------------------------------------------------------ icons
const ICON = {
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  grid: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="5" height="5" rx="1.2"/><rect x="9.5" y="3" width="5" height="5" rx="1.2"/><rect x="16" y="3" width="5" height="5" rx="1.2"/><rect x="3" y="9.5" width="5" height="5" rx="1.2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1.2"/><rect x="16" y="9.5" width="5" height="5" rx="1.2" opacity=".35"/><rect x="3" y="16" width="5" height="5" rx="1.2"/><rect x="9.5" y="16" width="5" height="5" rx="1.2" opacity=".35"/><rect x="16" y="16" width="5" height="5" rx="1.2" opacity=".35"/></svg>',
  speaker: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11"/></svg>',
  bulb: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0012 3z"/></svg>',
  del: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5h11v14H9l-6-7z"/><path d="M12.5 9.5l5 5M17.5 9.5l-5 5"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5l5 5 10-11"/></svg>',
};

function starPath(cx, cy, R, r) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 ? r : R;
    const ang = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${(cx + rad * Math.cos(ang)).toFixed(1)},${(cy + rad * Math.sin(ang)).toFixed(1)}`);
  }
  return pts.join(' ');
}

function star() {
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><polygon fill="var(--sun)" stroke="var(--sun-deep)" stroke-width="3" stroke-linejoin="round" points="${starPath(50, 53, 47, 21)}"/></svg>`;
}

function levelIcon(n) {
  let s = '<svg viewBox="0 0 64 48" aria-hidden="true">';
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      const x = 11 + c * 14;
      const y = 10 + r * 14;
      if (n === 1) s += `<circle cx="${x}" cy="${y}" r="5" fill="var(--accent)"/>`;
      else if (n === 2) s += `<circle cx="${x}" cy="${y}" r="4.5" fill="none" stroke="var(--dot)" stroke-width="2"/>`;
    }
  }
  if (n === 3) s += '<text x="32" y="36" text-anchor="middle" font-family="var(--font)" font-weight="800" font-size="30" fill="var(--accent)">?</text>';
  return s + '</svg>';
}

function holdButton(action, label, extra = '') {
  return `<button class="btn hold ${extra}" data-hold="${action}"><span class="fill"></span><span class="lbl">${label}</span></button>`;
}

// ------------------------------------------------------------------ help pictures

function dotsSVG(a, b, counted) {
  const cell = 30;
  const pad = 6;
  const labelW = 50;
  const w = b * cell + pad * 2 + labelW;
  const h = a * cell + pad * 2;
  let s = `<svg class="dots" viewBox="0 0 ${w} ${h}" style="max-width:${Math.round(w * 1.25)}px" role="img" aria-label="${a} Reihen mit je ${b} Punkten">`;
  for (let i = 0; i < a; i++) {
    const y = pad + i * cell;
    s += `<g class="row${i < counted ? ' on' : ''}" data-act="row" data-i="${i}"><rect class="hit" x="0" y="${y}" width="${w}" height="${cell}"/>`;
    for (let j = 0; j < b; j++) s += `<circle cx="${pad + j * cell + cell / 2}" cy="${y + cell / 2}" r="${cell * 0.34}"/>`;
    s += `<text class="cnt" x="${pad + b * cell + 10}" y="${y + cell / 2 + 6}">${(i + 1) * b}</text></g>`;
  }
  return s + '</svg>';
}

function lineSVG(a, b, counted) {
  const W = 640;
  const H = 96;
  const x0 = 22;
  const x1 = W - 22;
  const base = 60;
  const max = a * b;
  const x = (v) => x0 + ((x1 - x0) * v) / max;
  let s =
    `<svg class="nline" viewBox="0 0 ${W} ${H}" role="img" aria-label="Zahlenstrahl in ${b}er-Sprüngen bis ${max}">` +
    `<line class="axis" x1="${x0}" y1="${base}" x2="${x1}" y2="${base}"/>` +
    `<line class="tick" x1="${x0}" y1="${base - 7}" x2="${x0}" y2="${base + 7}"/>` +
    `<text x="${x0}" y="${base + 28}">0</text>`;
  const lift = Math.min(40, ((x1 - x0) / a) * 0.6 + 8);
  for (let k = 0; k < a; k++) {
    const xa = x(k * b);
    const xb = x((k + 1) * b);
    const on = k < counted ? ' on' : '';
    s +=
      `<path class="arc${on}" d="M${xa.toFixed(1)} ${base - 4} Q${((xa + xb) / 2).toFixed(1)} ${(base - lift * 1.6).toFixed(1)} ${xb.toFixed(1)} ${base - 4}"/>` +
      `<line class="tick" x1="${xb.toFixed(1)}" y1="${base - 7}" x2="${xb.toFixed(1)}" y2="${base + 7}"/>` +
      `<text class="${on}" x="${xb.toFixed(1)}" y="${base + 28}">${(k + 1) * b}</text>`;
    if (k === 0) s += `<text class="jump" x="${((xa + xb) / 2).toFixed(1)}" y="${(base - lift * 0.8 - 6).toFixed(1)}">+${b}</text>`;
  }
  return s + '</svg>';
}

function tipPanel(a, b, reveal) {
  const text = T.tip(a, b);
  const shown = reveal ? text : T.maskTip(text, a, b);
  return `<div class="panel tip"><button class="say" data-act="sayTip" aria-label="Tipp vorlesen">${ICON.speaker}</button><p><span class="panel-label">Tipp</span><br>${shown}</p></div>`;
}

function dotsPanel(a, b, counted, interactive) {
  return (
    `<div class="panel dots-wrap"><div class="panel-label">${a === 1 ? '1 Reihe mit ' : `${a} Reihen mit je `}${b}</div>` +
    dotsSVG(a, b, counted) +
    lineSVG(a, b, counted) +
    (interactive ? '<span class="tap-hint">Tippe die Reihen an und zähle mit.</span>' : '') +
    '</div>'
  );
}

// ------------------------------------------------------------------ 10 × 10 grid

function gridHTML(facts, sel = null, interactive = true) {
  let cells = '<span class="h">×</span>';
  for (let c = 1; c <= 10; c++) cells += `<span class="h">${c}</span>`;
  for (let a = 1; a <= 10; a++) {
    cells += `<span class="h">${a}</span>`;
    for (let b = 1; b <= 10; b++) {
      const cls = `cell bx${shadeOf(facts, a, b)}${sel && sel.a === a && sel.b === b ? ' sel' : ''}`;
      cells += interactive
        ? `<button class="${cls}" data-act="cell" data-a="${a}" data-b="${b}" aria-label="${a} mal ${b}">${a * b}</button>`
        : `<span class="${cls}">${a * b}</span>`;
    }
  }
  return `<div class="grid-wrap"><div class="grid">${cells}</div></div>`;
}

function legendHTML() {
  const items = [['bx0', 'neu'], ['bx1', '1'], ['bx2', '2'], ['bx3', '3'], ['bx4', '4'], ['bx5', '5 · sitzt']];
  return `<div class="legend">${items.map(([c, l]) => `<span><i class="${c}"></i>${l}</span>`).join('')}</div>`;
}

function reihenHTML(facts) {
  return L.ORDER.map((r) => {
    const f = L.factsFor([r]);
    return `<div class="reihe-row"><span>${r}er</span>${boxMeter(facts, f)}<small>${knownCount(facts, f)}/${f.length}</small></div>`;
  }).join('');
}

// ------------------------------------------------------------------ app

let instance = null;

export function mount(container, services) {
  unmount();
  const removeCss = services.ui.loadStylesheet(services.asset('style.css'));
  const app = document.createElement('div');
  app.className = 'emx';
  container.append(app);

  let data = loadData(services);
  const S = { screen: 'home', run: null, sel: null, toast: '' };
  const timers = new Set();
  const later = (fn, ms) => {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
    return t;
  };
  const cancel = (t) => {
    clearTimeout(t);
    timers.delete(t);
  };

  const save = () => services.storage.set('data', data);
  const say = (text) => services.speech.speak(text);
  const stat = (a, b) => L.statOf(data.facts, a, b);
  const allReihen = () => data.reihen.length === 10;
  const reiheLabel = (list) => (list.length === 10 ? 'Gemischt' : list.map((r) => `${r}er`).join(', '));

  // ---------------------------------------------------------------- home
  function viewHome() {
    const levels = [1, 2, 3]
      .map(
        (n) =>
          `<button class="level" data-act="level" data-n="${n}" aria-pressed="${data.level === n}">${levelIcon(n)}<b>${LEVELS[n].name}</b><span>${LEVELS[n].sub}</span></button>`,
      )
      .join('');
    const chips =
      `<button class="chip mixed" data-act="mixed" aria-pressed="${allReihen()}">Gemischt</button>` +
      L.ORDER.map((r) => {
        const on = !allReihen() && data.reihen.includes(r);
        return `<button class="chip" data-act="reihe" data-n="${r}" aria-pressed="${on}" aria-label="${r}er-Reihe">${r}er${boxMeter(data.facts, L.factsFor([r]))}</button>`;
      }).join('');
    return (
      '<section class="screen narrow">' +
      `<header class="home-head"><span class="hint-line">1 × 1 bis 10 × 10</span><div class="head-actions"><button class="btn icon" data-act="go" data-to="progress" aria-label="Fortschritt">${ICON.grid}</button></div></header>` +
      `<div><h2 class="section-title">Wie viel Hilfe?</h2><div class="levels">${levels}</div></div>` +
      `<div><h2 class="section-title">Welche Reihen?</h2><div class="chips">${chips}</div></div>` +
      `<div class="go-row"><button class="btn primary big" data-act="start">Los geht’s!</button>` +
      `<span class="hint-line">${L.SESSION_SIZE} Karten · etwa 5 Minuten · ${reiheLabel(data.reihen)}</span></div>` +
      '</section>'
    );
  }

  // ---------------------------------------------------------------- practice
  function startSession() {
    const pool = L.factsFor(data.reihen);
    S.run = {
      level: data.level,
      reihen: data.reihen.slice(),
      queue: L.buildSession(pool, data.facts),
      i: 0,
      marks: [],
      repeats: {},
      results: [],
      promoted: 0,
      missed: [],
    };
    S.screen = 'practice';
    services.session.begin();
    setCard();
  }

  function setCard() {
    const run = S.run;
    const card = run.queue[run.i];
    Object.assign(run, { card, input: '', hint: 0, counted: 0, state: 'ask', given: null, timeout: false, enter: true });
    run.options = run.level === 1 ? L.choices(card.a, card.b) : null;
    stopTimer();
    if (run.level === 3 && data.settings.timer) {
      run.deadline = Date.now() + data.settings.timer * 1000;
      run.timerId = setInterval(tickTimer, 100);
    }
    render();
  }

  function tickTimer() {
    const run = S.run;
    if (!run || run.state !== 'ask') return stopTimer();
    const left = run.deadline - Date.now();
    const bar = app.querySelector('.timer i');
    if (bar) bar.style.transform = `scaleX(${Math.max(0, left / (data.settings.timer * 1000))})`;
    if (left <= 0) {
      run.timeout = true;
      answer(null);
    }
  }

  function stopTimer() {
    if (S.run?.timerId) {
      clearInterval(S.run.timerId);
      S.run.timerId = null;
    }
  }

  function answer(value) {
    const run = S.run;
    if (run.state !== 'ask') return;
    stopTimer();
    const { a, b } = run.card;
    const correct = value === a * b;
    const usedHint = run.hint > 0;
    run.given = value;
    run.enter = false;
    if (!run.card.repeat) {
      const before = stat(a, b);
      const after = L.applyAnswer(before, correct, usedHint, run.level);
      data.facts[L.key(a, b)] = after;
      if (after.box > before.box) run.promoted++;
      run.results.push({ a, b, correct, hint: usedHint });
      save();
      services.session.update({ correct: run.results.filter((r) => r.correct).length, total: run.results.length });
    }
    run.marks[run.i] = correct ? 'ok' : 'bad';
    const spoken = `${a} mal ${b} ist ${a * b}`;
    if (correct) {
      run.state = 'right';
      services.sounds.correct();
      say(spoken);
      render();
      run.autoNext = later(next, 2200);
    } else {
      run.state = 'wrong';
      run.counted = a;
      if (!run.missed.includes(L.key(a, b))) run.missed.push(L.key(a, b));
      L.requeue(run.queue, run.i, run.card, run.repeats);
      services.sounds.wrong();
      later(() => say(`${spoken}.`), 450);
      render();
    }
  }

  function next() {
    const run = S.run;
    if (!run || S.screen !== 'practice') return;
    cancel(run.autoNext);
    run.i++;
    if (run.i >= run.queue.length) finish();
    else setCard();
  }

  function finish() {
    const run = S.run;
    stopTimer();
    data.sessions.push({ t: Date.now(), level: run.level, reihen: run.reihen, results: run.results });
    if (data.sessions.length > MAX_SESSIONS) data.sessions = data.sessions.slice(-MAX_SESSIONS);
    save();
    const practiced = new Set();
    run.results.forEach((r) => L.reihenOf(r.a, r.b).forEach((n) => practiced.add(n)));
    const candidates = run.reihen.filter((r) => practiced.has(r));
    run.suggest = run.level === data.level ? L.levelUpReihen(data.sessions, run.level, candidates) : [];
    const right = run.results.filter((r) => r.correct).length;
    run.stars = services.session.end({ correct: right, total: run.results.length }).stars;
    S.screen = 'reward';
    services.sounds.reward();
    render();
    window.scrollTo(0, 0);
  }

  function viewPractice() {
    const run = S.run;
    const { a, b } = run.card;
    const p = a * b;
    const done = run.state !== 'ask';

    const pips = run.queue.map((c, i) => `<span class="pip ${run.marks[i] || (i === run.i ? 'now' : '')}"></span>`).join('');
    const bar = `<header class="bar"><div class="pips" aria-hidden="true">${pips}</div><span class="count">${Math.min(run.i + 1, run.queue.length)} / ${run.queue.length}</span></header>`;

    const slotText = run.state === 'ask' ? (run.level === 1 ? '?' : run.input || '?') : String(p);
    const slotEmpty = run.state === 'ask' && (run.level === 1 || !run.input);
    const cardCls = `card${run.enter ? ' enter' : ''}${run.state === 'right' ? ' right' : ''}${run.state === 'wrong' ? ' wrong' : ''}`;
    const card =
      `<div class="${cardCls}">` +
      `<div class="card-tools"><button class="say" data-act="sayProblem" aria-label="Aufgabe vorlesen">${ICON.speaker}</button></div>` +
      `<div class="problem" aria-label="${a} mal ${b}"><span>${a}</span><span class="op">×</span><span>${b}</span><span class="op">=</span>` +
      `<span class="slot${slotEmpty ? ' empty' : ''}">${slotText}</span></div>` +
      (run.state === 'wrong' ? `<div class="given">${run.timeout ? 'Die Zeit ist um.' : `Deine Antwort: <s>${run.given}</s>`}</div>` : '') +
      (run.level === 3 && data.settings.timer && run.state === 'ask' ? '<div class="timer"><i></i></div>' : '') +
      (run.state === 'right' ? `<div class="star-pop">${star()}</div>` : '') +
      '</div>';

    let help = '';
    if (run.level === 1 || run.state === 'wrong') {
      help = dotsPanel(a, b, run.counted, true) + tipPanel(a, b, done);
    } else if (run.level === 2) {
      if (run.hint >= 1) help += tipPanel(a, b, done);
      if (run.hint >= 2) help += dotsPanel(a, b, run.counted, true);
    }

    let ans = '';
    if (run.state === 'right') {
      ans = `<p class="feedback good">Richtig! ${a} × ${b} = ${p}</p><button class="btn primary big next-btn" data-act="next">Weiter</button>`;
    } else if (run.state === 'wrong') {
      ans =
        `<p class="feedback bad">Schau mal: ${a} × ${b} = ${p}</p>` +
        '<p class="hint-line" style="text-align:center">Die Aufgabe kommt gleich noch einmal.</p>' +
        '<button class="btn primary big next-btn" data-act="next">Weiter</button>';
    } else if (run.level === 1) {
      ans = `<div class="choices">${run.options.map((v, i) => `<button class="btn" data-act="choose" data-v="${v}" aria-keyshortcuts="${i + 1}">${v}</button>`).join('')}</div>`;
    } else {
      if (run.level === 2) {
        const hintLabel = run.hint === 0 ? 'Tipp' : run.hint === 1 ? 'Punkte zeigen' : 'Alle Hilfen offen';
        ans += `<button class="btn hint-btn" data-act="hint"${run.hint >= 2 ? ' disabled' : ''}>${ICON.bulb}${hintLabel}</button>`;
      }
      const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button class="btn" data-act="digit" data-v="${n}">${n}</button>`).join('');
      ans +=
        `<div class="pad">${keys}` +
        `<button class="btn del" data-act="del" aria-label="Löschen">${ICON.del}</button>` +
        '<button class="btn" data-act="digit" data-v="0">0</button>' +
        `<button class="btn ok" data-act="submit" aria-label="Fertig"${run.input ? '' : ' disabled'}>${ICON.check}</button></div>`;
    }

    return `<section class="screen practice">${bar}<div class="stage"><div class="col">${card}${help}</div><div class="col answer-col">${ans}</div></div></section>`;
  }

  // ---------------------------------------------------------------- reward
  function viewReward() {
    const run = S.run;
    const right = run.results.filter((r) => r.correct).length;
    const total = run.results.length;
    const title = right >= total - 1 ? 'Super gemacht!' : right >= total * 0.6 ? 'Gut gemacht!' : 'Weiter so!';
    const stars = run.results.map((r) => `<svg viewBox="0 0 100 100" aria-hidden="true"><polygon class="${r.correct ? 'on' : 'off'}" points="${starPath(50, 53, 47, 21)}"/></svg>`).join('');
    let lines = '';
    if (run.stars) {
      lines += `<div class="panel"><b>+${run.stars} ★ für deine Sammlung</b></div>`;
    }
    if (run.promoted) {
      lines += `<div class="panel"><b>${run.promoted}${run.promoted === 1 ? ' Aufgabe ist' : ' Aufgaben sind'} eine Stufe höher gerutscht.</b></div>`;
    }
    if (run.missed.length) {
      lines +=
        '<div class="panel"><div class="panel-label">Die üben wir noch</div><div class="fact-chips">' +
        run.missed.map((k) => {
          const [x, y] = k.split('x');
          return `<span class="fact-chip">${x} × ${y} = ${x * y}</span>`;
        }).join('') +
        '</div></div>';
    }
    if (run.suggest?.length) {
      const names = run.suggest.map((r) => `die ${r}er-Reihe`);
      const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} und ${names[names.length - 1]}` : names[0];
      lines +=
        '<div class="panel parent-box"><div class="panel-label">Für Eltern</div>' +
        `<p>${list.charAt(0).toUpperCase() + list.slice(1)} ${names.length > 1 ? 'klappen' : 'klappt'} in zwei Übungen hintereinander zu mindestens 90 %. Ab jetzt mit „${LEVELS[run.level + 1].name}“ üben?</p>` +
        `<div class="btn-row">${holdButton('levelUp', 'Ja – gedrückt halten')}<button class="btn" data-act="dismissSuggest">Noch nicht</button></div></div>`;
    } else if (S.toast) {
      lines += `<p class="toast">${S.toast}</p>`;
    }
    return (
      '<section class="screen reward narrow">' +
      `<div class="trophy">${star()}<b>${right}</b></div>` +
      `<h1>${title}</h1>` +
      `<p class="hint-line">${right} von ${total} Karten auf Anhieb richtig</p>` +
      `<div class="star-row">${stars}</div>` +
      `<div class="summary">${lines}` +
      '<div class="btn-row"><button class="btn primary big" data-act="start">Nochmal</button><button class="btn big" data-act="done">Fertig</button></div></div></section>'
    );
  }

  // ---------------------------------------------------------------- progress
  function viewProgress() {
    const all = L.factsFor(L.ORDER);
    let detail = '<span class="hint-line">Tippe ein Feld an, um mehr zu sehen.</span>';
    if (S.sel) {
      const st = stat(S.sel.a, S.sel.b);
      const sh = shadeOf(data.facts, S.sel.a, S.sel.b);
      detail =
        `<b>${S.sel.a} × ${S.sel.b} = ${S.sel.a * S.sel.b}</b><span class="hint-line">` +
        (sh ? `Stufe ${st.box} · ${st.right}× richtig · ${st.wrong}× falsch · ${st.hints}× mit Tipp` : 'Noch nicht geübt') +
        '</span>';
    }
    const last = data.sessions[data.sessions.length - 1];
    return (
      '<section class="screen narrow">' +
      `<header class="page-head"><button class="btn icon" data-act="go" data-to="home" aria-label="Zurück">${ICON.back}</button><h1>Fortschritt</h1></header>` +
      `<div class="stats"><span><b>${knownCount(data.facts, all)}</b> von 100 sitzen</span><span><b>${data.sessions.length}</b> Übungen</span>` +
      (last ? `<span>zuletzt ${new Date(last.t).toLocaleDateString('de-DE')}</span>` : '') +
      `<span>Stufe: ${LEVELS[data.level].name}</span></div>` +
      gridHTML(data.facts, S.sel) +
      legendHTML() +
      `<div class="panel detail">${detail}</div>` +
      `<div><h2 class="section-title">Reihen (sitzt = Stufe 4 oder 5)</h2><div class="reihen">${reihenHTML(data.facts)}</div></div>` +
      '</section>'
    );
  }

  // ---------------------------------------------------------------- render + events
  function render() {
    const views = { home: viewHome, practice: viewPractice, reward: viewReward, progress: viewProgress };
    app.innerHTML = views[S.screen]();
  }

  function go(to) {
    stopTimer();
    if (S.run) cancel(S.run.autoNext);
    S.screen = to;
    S.sel = null;
    S.toast = '';
    render();
    window.scrollTo(0, 0);
  }

  const actions = {
    go: (el) => go(el.dataset.to),
    level: (el) => {
      data.level = Number(el.dataset.n);
      save();
      render();
    },
    mixed: () => {
      data.reihen = L.ORDER.slice();
      save();
      render();
    },
    reihe: (el) => {
      const n = Number(el.dataset.n);
      if (allReihen()) data.reihen = [n];
      else if (data.reihen.includes(n)) {
        if (data.reihen.length > 1) data.reihen = data.reihen.filter((r) => r !== n);
      } else data.reihen = data.reihen.concat(n);
      save();
      render();
    },
    start: () => {
      S.toast = '';
      services.sounds.tap();
      startSession();
      window.scrollTo(0, 0);
    },
    done: () => services.goHome(),
    choose: (el) => answer(Number(el.dataset.v)),
    digit: (el) => {
      const run = S.run;
      if (run.state !== 'ask' || run.input.length >= 3) return;
      run.input = (run.input + el.dataset.v).replace(/^0+(?=\d)/, '');
      run.enter = false;
      render();
    },
    del: () => {
      S.run.input = S.run.input.slice(0, -1);
      S.run.enter = false;
      render();
    },
    submit: () => {
      if (S.run.input) answer(Number(S.run.input));
    },
    hint: () => {
      const run = S.run;
      if (run.hint >= 2 || run.state !== 'ask') return;
      run.hint++;
      run.enter = false;
      if (run.hint === 1) say(T.speakable(T.maskTip(T.tip(run.card.a, run.card.b), run.card.a, run.card.b)));
      render();
    },
    row: (el) => {
      const run = S.run;
      const i = Number(el.dataset.i);
      run.counted = run.counted === i + 1 ? i : i + 1;
      run.enter = false;
      if (run.counted) say(String(run.counted * run.card.b));
      render();
    },
    sayTip: () => {
      const { card, state } = S.run;
      const t = T.tip(card.a, card.b);
      say(T.speakable(state === 'ask' ? T.maskTip(t, card.a, card.b) : t));
    },
    sayProblem: () => {
      const c = S.run.card;
      say(S.run.state === 'ask' ? `${c.a} mal ${c.b}` : `${c.a} mal ${c.b} ist ${c.a * c.b}`);
    },
    next,
    dismissSuggest: () => {
      S.run.suggest = [];
      render();
    },
    cell: (el) => {
      S.sel = { a: Number(el.dataset.a), b: Number(el.dataset.b) };
      render();
    },
  };

  const holdActions = {
    levelUp: () => {
      data.level = Math.min(3, S.run.level + 1);
      S.run.suggest = [];
      S.toast = `Ab jetzt: ${LEVELS[data.level].name}.`;
      save();
      render();
    },
  };

  app.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled || !actions[el.dataset.act]) return;
    actions[el.dataset.act](el);
  });

  // Hold-to-confirm button (level change suggested to parents on the reward screen).
  let hold = null;
  function holdStart(el) {
    holdCancel();
    const t0 = performance.now();
    hold = { el, raf: 0 };
    const step = (now) => {
      if (!hold) return;
      const p = Math.min(1, (now - t0) / HOLD_MS);
      el.style.setProperty('--p', p);
      if (p >= 1) {
        const name = el.dataset.hold;
        hold = null;
        holdActions[name]();
        return;
      }
      hold.raf = requestAnimationFrame(step);
    };
    hold.raf = requestAnimationFrame(step);
  }
  function holdCancel() {
    if (!hold) return;
    cancelAnimationFrame(hold.raf);
    hold.el.style.setProperty('--p', 0);
    hold = null;
  }
  app.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('[data-hold]');
    if (el) {
      e.preventDefault();
      holdStart(el);
    }
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) {
    app.addEventListener(ev, (e) => {
      if (hold && (ev !== 'pointerleave' || e.target === hold.el)) holdCancel();
    }, true);
  }
  app.addEventListener('contextmenu', (e) => {
    if (e.target.closest('[data-hold]')) e.preventDefault();
  });

  function onKeyDown(e) {
    if (e.defaultPrevented || document.querySelector('.lw-overlay')) return;
    const el = document.activeElement?.closest?.('[data-hold]');
    if (el && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      if (!e.repeat) holdStart(el);
      return;
    }
    if (S.screen !== 'practice' || !S.run) {
      if (e.key === 'Escape' && S.screen === 'progress') go('home');
      return;
    }
    const run = S.run;
    if (run.state !== 'ask') {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        next();
      }
      return;
    }
    if (run.level === 1) {
      const n = Number(e.key);
      if (n >= 1 && n <= 4) answer(run.options[n - 1]);
      return;
    }
    if (/^[0-9]$/.test(e.key)) actions.digit({ dataset: { v: e.key } });
    else if (e.key === 'Backspace') actions.del();
    else if (e.key === 'Enter') {
      e.preventDefault();
      actions.submit();
    }
  }
  function onKeyUp(e) {
    if (e.key === 'Enter' || e.key === ' ') holdCancel();
  }
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);

  render();

  instance = {
    destroy() {
      stopTimer();
      holdCancel();
      timers.forEach(clearTimeout);
      timers.clear();
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      removeCss();
      app.remove();
    },
  };
}

export function unmount() {
  instance?.destroy();
  instance = null;
}

// ------------------------------------------------------------------ parent area

export function SettingsScreen(container, services) {
  const { h, selectField } = services.ui;
  const data = loadData(services);
  const save = () => services.storage.set('data', data);
  container.append(
    h('h2', { class: 'lw-card__title' }, 'Einmaleins'),
    selectField('Hilfestufe', data.level, [1, 2, 3].map((n) => ({ value: n, label: LEVELS[n].name })), (v) => {
      data.level = Number(v);
      save();
    }),
    h(
      'p',
      { class: 'lw-muted' },
      `Mit „Viel Hilfe“ (Auswahl aus 4 Antworten) steigt eine Aufgabe höchstens bis Stufe ${L.MAX_BOX_BY_LEVEL[1]}. Grün wird sie erst, wenn sie ohne Tipp eingetippt wird. Ein Tipp ist erlaubt, die Aufgabe bleibt dann auf ihrer Stufe und kommt öfter dran.`,
    ),
    selectField('Zeitlimit bei „Keine Hilfe“', data.settings.timer, TIMERS.map((t) => ({ value: t, label: t ? `${t} Sekunden` : 'Aus' })), (v) => {
      data.settings.timer = Number(v);
      save();
    }),
    h('p', { class: 'lw-muted' }, 'Ein ruhiger Balken zeigt die Zeit. Ist sie um, wird die Lösung gezeigt und die Aufgabe kommt noch einmal.'),
  );
}

export function ProgressSummary(container, services) {
  const data = loadData(services);
  const all = L.factsFor(L.ORDER);
  const wrap = document.createElement('div');
  wrap.className = 'emx emx--summary';
  wrap.innerHTML =
    `<p><b>${knownCount(data.facts, all)} von 100</b> Aufgaben sitzen · Stufe: ${LEVELS[data.level].name}</p>` +
    gridHTML(data.facts, null, false) +
    legendHTML();
  container.append(wrap);
  return services.ui.loadStylesheet(services.asset('style.css'));
}
