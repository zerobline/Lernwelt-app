// "Uhr lesen" – read an analog clock in spoken German ("Viertel nach drei", "halb vier").
// Lernwelt app contract: mount(container, services) / unmount() / SettingsScreen / ProgressSummary
//
// The launcher provides the Home button, the parent area, speech, sounds, stars and the
// "Wirklich aufhören?" question; this module only draws the app itself.
import * as Z from './time-phrase.js';
import { create as createClock } from './clock.js';

const QUESTIONS = 10;
const PROMOTE_SCORE = 8;
const HELP_ORDER = ['keine', 'wenig', 'viel'];
const STUFE_NAMES = { 1: 'volle Stunden', 2: 'halbe Stunden', 3: 'Viertelstunden', 4: '5-Minuten-Schritte', 5: 'jede Minute' };
const MODE_NAMES = { leicht: 'Leicht', mittel: 'Mittel', schwer: 'Schwer' };
const ERROR_NAMES = { hour: 'Stunde falsch', minute: 'Minuten falsch', direction: '„nach“ und „vor“ vertauscht', other: 'Sonstiges' };
const PRAISE = ['Super!', 'Richtig!', 'Toll gemacht!', 'Genau!', 'Klasse!', 'Prima!'];
const RATES = [0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2];

const SPEAKER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9v6h4l5 4V5L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/></svg>';
const STAR_PATH = 'M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z';

// ------------------------------------------------------------------ storage
// Everything lives in one "data" entry of the app's launcher store.

export function defaults() {
  return {
    settings: { help: 'viel', stufe: 1, mode: 'leicht', region: 'standard', rate: 0.9 },
    stats: {},
    errorTypes: { hour: 0, minute: 0, direction: 0, other: 0 },
    history: [],
    suggestDismissedAt: -1,
  };
}

export function loadData(services) {
  const data = defaults();
  const saved = services.storage.get('data', null);
  if (!saved || typeof saved !== 'object') return data;
  return { ...data, ...saved, settings: { ...data.settings, ...(saved.settings || {}) } };
}

// ------------------------------------------------------------------ helpers

const rand = (n) => Math.floor(Math.random() * n);
const pick = (list) => list[rand(list.length)];
function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const h12 = (h) => Z.hour12(h);
const sameTime = (a, b) => a && b && h12(a.hour) === h12(b.hour) && a.minute === b.minute;

function esc(text) {
  return String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

function starSvg(kind) {
  const cls = kind === 'first' || kind === 'second' ? 'star-full' : kind === 'later' ? 'star-silver' : 'star-empty';
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path class="${cls}" d="${STAR_PATH}"/></svg>`;
}

function holdHTML(id, label = 'Eltern: gedrückt halten') {
  return `<button type="button" class="hold-btn" id="${id}"><span class="hold-fill"></span><span class="hold-label">${label}</span></button>`;
}

const TEMPLATE = `
  <!-- ============ Start ============ -->
  <section id="screen-start" class="screen">
    <div id="suggest-banner" class="suggest-banner" hidden>
      <p id="banner-text"></p>
      <div class="row-actions">
        ${holdHTML('banner-yes')}
        <button type="button" class="btn-soft" id="banner-no">Noch nicht</button>
      </div>
    </div>

    <div class="pick-group">
      <h2 class="pick-title">Hilfe an der Uhr</h2>
      <div class="pick-row pick-row-3" id="pick-help">
        <button type="button" class="pick" data-value="viel"><span class="mini-clock" data-help="viel"></span><span class="pick-label">Viel Hilfe</span></button>
        <button type="button" class="pick" data-value="wenig"><span class="mini-clock" data-help="wenig"></span><span class="pick-label">Wenig Hilfe</span></button>
        <button type="button" class="pick" data-value="keine"><span class="mini-clock" data-help="keine"></span><span class="pick-label">Keine Hilfe</span></button>
      </div>
    </div>

    <div class="pick-group">
      <h2 class="pick-title">Stufe</h2>
      <div class="pick-row pick-row-5" id="pick-stufe">
        <button type="button" class="pick pick-stufe" data-value="1"><span class="stufe-num">1</span><span class="pick-label">volle Stunden</span><span class="pick-example">drei Uhr</span></button>
        <button type="button" class="pick pick-stufe" data-value="2"><span class="stufe-num">2</span><span class="pick-label">+ halbe</span><span class="pick-example">halb vier</span></button>
        <button type="button" class="pick pick-stufe" data-value="3"><span class="stufe-num">3</span><span class="pick-label">+ Viertel</span><span class="pick-example">Viertel nach drei</span></button>
        <button type="button" class="pick pick-stufe" data-value="4"><span class="stufe-num">4</span><span class="pick-label">+ 5 Minuten</span><span class="pick-example">fünf vor halb vier</span></button>
        <button type="button" class="pick pick-stufe" data-value="5"><span class="stufe-num">5</span><span class="pick-label">jede Minute</span><span class="pick-example">siebzehn nach drei</span></button>
      </div>
    </div>

    <div class="pick-group">
      <h2 class="pick-title">So antworte ich</h2>
      <div class="pick-row pick-row-3" id="pick-mode">
        <button type="button" class="pick pick-mode" data-value="leicht"><span class="dots" aria-hidden="true"><i></i></span><span class="pick-label">Leicht</span><span class="pick-example">Antwort antippen</span></button>
        <button type="button" class="pick pick-mode" data-value="mittel"><span class="dots" aria-hidden="true"><i></i><i></i></span><span class="pick-label">Mittel</span><span class="pick-example">Wörter legen</span></button>
        <button type="button" class="pick pick-mode" data-value="schwer"><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="pick-label">Schwer</span><span class="pick-example">Zeiger stellen</span></button>
      </div>
    </div>

    <button type="button" class="btn-go" id="start-session">Los geht’s!</button>
  </section>

  <!-- ============ Quiz ============ -->
  <section id="screen-quiz" class="screen" hidden>
    <header class="quiz-head">
      <ol class="progress" id="progress" aria-label="Fortschritt"></ol>
    </header>

    <div class="quiz-body">
      <div class="clock-wrap">
        <div id="clock" class="clock-holder"></div>
        <p class="help-note" id="help-note" hidden></p>
      </div>

      <div class="answer-area">
        <div class="prompt">
          <p class="prompt-text" id="prompt-text">Wie spät ist es?</p>
          <button type="button" class="speak-btn" id="prompt-speak" aria-label="Vorlesen">${SPEAKER}</button>
        </div>

        <!-- Leicht -->
        <div class="choices" id="choices" hidden></div>

        <!-- Mittel -->
        <div class="tiles-wrap" id="tiles-wrap" hidden>
          <div class="build" id="build" aria-label="Deine Antwort"><span class="build-empty">Tippe die Wörter an</span></div>
          <div class="tiles" id="tiles"></div>
          <div class="row-actions">
            <button type="button" class="btn-soft" id="build-speak">Anhören</button>
            <button type="button" class="btn-soft" id="build-clear">Löschen</button>
            <button type="button" class="btn-check" id="build-check" disabled>Fertig</button>
          </div>
        </div>

        <!-- Schwer -->
        <div class="set-wrap" id="set-wrap" hidden>
          <p class="set-hint">Dreh die Zeiger. Der <b class="c-hour">kleine</b> zeigt die Stunde, der <b class="c-minute">große</b> die Minuten.</p>
          <button type="button" class="btn-check" id="set-check">Fertig</button>
        </div>

        <div class="feedback" id="feedback" hidden>
          <div class="feedback-msg" id="feedback-msg"></div>
          <button type="button" class="btn-go btn-next" id="next-question" hidden>Weiter</button>
        </div>
      </div>
    </div>
  </section>

  <!-- ============ Reward ============ -->
  <section id="screen-reward" class="screen" hidden>
    <div class="reward">
      <h2 class="reward-title" id="reward-title">Geschafft!</h2>
      <div class="reward-stars" id="reward-stars"></div>
      <p class="reward-text" id="reward-text"></p>
      <p class="reward-text" id="reward-collect" hidden></p>

      <div class="suggest-card" id="suggest-card" hidden>
        <p id="suggest-text"></p>
        <div class="row-actions">
          ${holdHTML('suggest-yes')}
          <button type="button" class="btn-soft" id="suggest-no">Noch nicht</button>
        </div>
      </div>

      <div class="row-actions">
        <button type="button" class="btn-go" id="again">Nochmal</button>
        <button type="button" class="btn-soft" id="to-home">Fertig</button>
      </div>
    </div>
  </section>
`;

// ------------------------------------------------------------------ app

let instance = null;

export function mount(container, services) {
  unmount();
  const removeCss = services.ui.loadStylesheet(services.asset('style.css'));
  const root = document.createElement('div');
  root.className = 'uhr';
  root.innerHTML = TEMPLATE;
  container.append(root);

  const $ = (id) => root.querySelector(`#${id}`);
  let store = loadData(services);
  const save = () => services.storage.set('data', store);
  const phraseOpts = () => ({ region: store.settings.region });
  const speak = (text) => {
    if (text) services.speech.speak(text, { rate: store.settings.rate });
  };
  const stopSpeech = () => services.speech.stop();

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

  function show(screenId) {
    for (const id of ['screen-start', 'screen-quiz', 'screen-reward']) $(id).hidden = id !== screenId;
    window.scrollTo(0, 0);
  }

  // ---------------------------------------------------------------- start screen
  function bindPicker(groupId, key, parse) {
    const buttons = [...$(groupId).querySelectorAll('.pick')];
    const refresh = () => buttons.forEach((b) => b.setAttribute('aria-pressed', String(parse(b.dataset.value) === store.settings[key])));
    buttons.forEach((b) =>
      b.addEventListener('click', () => {
        store.settings[key] = parse(b.dataset.value);
        save();
        refresh();
        services.sounds.tap();
      }),
    );
    refresh();
    return refresh;
  }

  const same = (v) => v;
  const refreshPickers = [bindPicker('pick-help', 'help', same), bindPicker('pick-stufe', 'stufe', Number), bindPicker('pick-mode', 'mode', same)];

  // Small preview clocks on the help buttons.
  const clocks = [...root.querySelectorAll('.mini-clock')].map((holder) => {
    const c = createClock(holder, { onFaceTap: false });
    c.setHelp(holder.dataset.help);
    c.set({ hour: 3, minute: 15 });
    c.el.setAttribute('aria-hidden', 'true');
    return c;
  });

  function refreshStart() {
    refreshPickers.forEach((f) => f());
    const s = suggestion();
    $('suggest-banner').hidden = !s;
    if (s) $('banner-text').textContent = `Zweimal hintereinander ${PROMOTE_SCORE} von 10! Weiter zu Stufe ${s} (${STUFE_NAMES[s]})?`;
  }

  // ---------------------------------------------------------------- session
  const clock = createClock($('clock'), {
    onFaceTap: () => services.sounds.tap(),
    onChange: () => {
      if (session && session.mode === 'schwer') clock.setHighlight(null);
    },
  });
  clocks.push(clock);

  let session = null;

  function newMinutesFor(stufe) {
    const all = Z.STUFE_MINUTES[stufe];
    if (stufe === 1) return all;
    const prev = Z.STUFE_MINUTES[stufe - 1];
    return all.filter((m) => !prev.includes(m));
  }

  function makeTimes(stufe) {
    const all = Z.STUFE_MINUTES[stufe];
    const fresh = newMinutesFor(stufe);
    const times = [];
    let guard = 0;
    while (times.length < QUESTIONS && guard++ < 500) {
      // Half of the questions practise what is new at this Stufe.
      const minute = times.length % 2 === 0 ? pick(fresh) : pick(all);
      const t = { hour: 1 + rand(12), minute };
      if (times.some((o) => sameTime(o, t)) && guard < 400) continue;
      times.push(t);
    }
    return shuffle(times);
  }

  function startSession() {
    const s = store.settings;
    session = {
      stufe: s.stufe,
      mode: s.mode,
      help: s.help,
      queue: makeTimes(s.stufe).map((t, i) => ({ hour: t.hour, minute: t.minute, slot: i, reask: false })),
      results: new Array(QUESTIONS).fill(null),
      pos: -1,
      item: null,
      attempt: 0,
      done: false,
      startedAt: Date.now(),
    };
    services.session.begin();
    show('screen-quiz');
    nextQuestion();
  }

  function reportProgress() {
    const r = session.results;
    services.session.update({ correct: r.filter((x) => x === 'first').length, total: r.filter(Boolean).length });
  }

  function renderProgress(popSlot) {
    const ol = $('progress');
    ol.innerHTML = '';
    for (let i = 0; i < QUESTIONS; i++) {
      const li = document.createElement('li');
      li.innerHTML = starSvg(session.results[i]);
      if (session.item && session.item.slot === i && !session.done) li.classList.add('current');
      if (popSlot === i) li.classList.add('pop');
      ol.appendChild(li);
    }
    const solved = session.results.filter(Boolean).length;
    ol.setAttribute('aria-label', `Fortschritt: ${solved} von ${QUESTIONS} Sternen`);
  }

  function helpUp(level) {
    const i = HELP_ORDER.indexOf(level);
    return HELP_ORDER[Math.min(HELP_ORDER.length - 1, i + 1)];
  }

  function nextQuestion() {
    session.pos += 1;
    if (session.pos >= session.queue.length) return finishSession();
    const item = session.queue[session.pos];
    session.item = item;
    session.attempt = 0;
    session.done = false;
    session.phrases = Z.timeToPhrases(item.hour, item.minute, phraseOpts());

    clock.setHelp(session.help);
    clock.setHighlight(null);
    clock.clearHint();
    for (const id of ['help-note', 'feedback', 'next-question', 'choices', 'tiles-wrap', 'set-wrap']) $(id).hidden = true;
    renderProgress();

    const prompt = $('prompt-text');
    if (session.mode === 'schwer') {
      const step = Z.STUFE_STEP[session.stufe];
      let start;
      do {
        start = { hour: 1 + rand(12), minute: pick(Z.STUFE_MINUTES[Math.max(session.stufe, 2)].filter((m) => m % step === 0)) };
      } while (sameTime(start, item));
      clock.set(start);
      clock.setInteractive(true, step);
      prompt.innerHTML = 'Stell die Uhr auf:<span class="target"></span>';
      prompt.querySelector('.target').textContent = session.phrases.text;
      $('set-wrap').hidden = false;
      $('set-check').disabled = false;
      speak(`Stell die Uhr auf ${session.phrases.text}`);
    } else {
      clock.set(item);
      clock.setInteractive(false);
      prompt.textContent = item.reask ? 'Noch einmal: Wie spät ist es?' : 'Wie spät ist es?';
      if (session.mode === 'leicht') renderChoices();
      else renderTiles();
    }
  }

  function promptSpeech() {
    if (!session) return;
    if (session.mode === 'schwer') speak(`Stell die Uhr auf ${session.phrases.text}`);
    else if (session.mode === 'mittel') speak(buildText() || 'Wie spät ist es?');
    else speak('Wie spät ist es?');
  }

  // ---------- Leicht: 3 choices ----------

  /** Near-miss wrong answers: wrong hour, nach/vor swapped, halb confusion. */
  function distractors(item) {
    const h = h12(item.hour);
    const m = item.minute;
    const cands = [];
    const add = (hh, mm, prio) => cands.push({ hour: h12(hh), minute: mm, prio });

    if (m === 0) {
      add(h - 1, 30, 1);
      add(h, 30, 2);
      add(h + 1, 0, 2);
      add(h - 1, 0, 3);
    } else if (m === 30) {
      add(h - 1, 30, 1);
      add(h, 0, 2);
      add(h + 1, 30, 2);
      add(h + 1, 0, 3);
    } else {
      // nach/vor swapped with the same spoken hour word.
      if (m < 25) add(h - 1, 60 - m, 1);
      else if (m > 35) add(h + 1, 60 - m, 1);
      else add(h, 60 - m, 1); // fünf vor halb <-> fünf nach halb
      // wrong hour (the classic "halb"-style off-by-one)
      add(h - 1, m, 1);
      add(h + 1, m, 2);
      // close minute
      if (session.stufe >= 4) {
        add(h, (m + 5) % 60, 3);
        add(h, (m + 55) % 60, 3);
      }
    }

    const seen = new Set([Z.normalize(session.phrases.text)]);
    const out = [];
    shuffle(cands)
      .sort((a, b) => a.prio - b.prio)
      .forEach((c) => {
        if (sameTime(c, item)) return;
        const text = Z.timeToPhrase(c.hour, c.minute, phraseOpts());
        const key = Z.normalize(text);
        if (seen.has(key)) return;
        seen.add(key);
        out.push({ hour: c.hour, minute: c.minute, text });
      });
    return out.slice(0, 2);
  }

  function renderChoices() {
    const item = session.item;
    const options = shuffle([{ hour: item.hour, minute: item.minute, text: session.phrases.text, right: true }].concat(distractors(item)));
    const box = $('choices');
    box.innerHTML = '';
    for (const opt of options) {
      const row = document.createElement('div');
      row.className = 'choice';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'choice-btn';
      btn.textContent = opt.text;
      btn.addEventListener('click', () => {
        if (session.done || btn.disabled) return;
        if (opt.right) {
          btn.classList.add('right');
          onCorrect();
        } else {
          btn.classList.add('wrong', 'shake');
          btn.disabled = true;
          onWrong({ hour: opt.hour, minute: opt.minute });
        }
      });
      const sp = document.createElement('button');
      sp.type = 'button';
      sp.className = 'speak-btn';
      sp.setAttribute('aria-label', `Vorlesen: ${opt.text}`);
      sp.innerHTML = SPEAKER;
      sp.addEventListener('click', () => speak(opt.text));
      row.append(btn, sp);
      box.appendChild(row);
      opt.btn = btn;
    }
    session.options = options;
    box.hidden = false;
  }

  // ---------- Mittel: word tiles ----------

  function tileDistractors(item, words) {
    const lower = words.map((w) => w.toLowerCase());
    const extra = [];
    const hourWord = words[words.length - 1] === 'Uhr' ? words[words.length - 2] : words[words.length - 1];
    const hourNum = Z.HOUR_WORDS.lastIndexOf(hourWord === 'ein' ? 'eins' : hourWord);
    if (hourNum > 0) {
      let other = Z.HOUR_WORDS[h12(hourNum - 1)];
      if (words[words.length - 1] === 'Uhr') other = h12(hourNum - 1) === 1 ? 'ein' : other;
      extra.push(other);
    }
    const nachWord = store.settings.region === 'ch' ? 'ab' : 'nach';
    if (lower.includes('nach') || lower.includes('ab')) extra.push('vor');
    else if (lower.includes('vor')) extra.push(nachWord);
    if (!lower.includes('halb')) extra.push('halb');
    else if (!lower.includes('uhr')) extra.push('Uhr');
    if (item.minute === 0 && !extra.includes('nach')) extra.push(nachWord);
    return extra.filter((w) => !lower.includes(w.toLowerCase())).slice(0, 3);
  }

  function renderTiles() {
    const words = session.phrases.text.split(' ');
    const all = shuffle(words.concat(tileDistractors(session.item, words)));
    session.built = [];
    const tiles = $('tiles');
    tiles.innerHTML = '';
    all.forEach((word, i) => {
      const t = document.createElement('button');
      t.type = 'button';
      t.className = 'tile';
      t.textContent = word;
      t.dataset.idx = String(i);
      t.addEventListener('click', () => {
        if (session.done || t.classList.contains('used')) return;
        t.classList.add('used');
        session.built.push({ word, src: t });
        speak(word);
        renderBuild();
      });
      tiles.appendChild(t);
    });
    renderBuild();
    $('tiles-wrap').hidden = false;
  }

  function buildText() {
    return (session.built || []).map((b) => b.word).join(' ');
  }

  function renderBuild() {
    const box = $('build');
    box.innerHTML = '';
    box.classList.remove('wrong', 'right');
    if (!session.built.length) box.innerHTML = '<span class="build-empty">Tippe die Wörter an</span>';
    session.built.forEach((b, i) => {
      const t = document.createElement('button');
      t.type = 'button';
      t.className = 'tile';
      t.textContent = b.word;
      t.setAttribute('aria-label', `${b.word} zurücklegen`);
      t.addEventListener('click', () => {
        if (session.done) return;
        b.src.classList.remove('used');
        session.built.splice(i, 1);
        renderBuild();
      });
      box.appendChild(t);
    });
    $('build-check').disabled = !session.built.length || session.done;
  }

  $('build-clear').addEventListener('click', () => {
    if (!session || session.done) return;
    session.built.forEach((b) => b.src.classList.remove('used'));
    session.built = [];
    renderBuild();
  });
  $('build-speak').addEventListener('click', () => {
    if (session) speak(buildText() || 'Wie spät ist es?');
  });
  $('build-check').addEventListener('click', () => {
    if (!session || session.done) return;
    const text = buildText();
    const item = session.item;
    if (Z.isCorrect(text, item.hour, item.minute, phraseOpts())) {
      $('build').classList.add('right');
      onCorrect();
    } else {
      const box = $('build');
      box.classList.remove('shake');
      void box.offsetWidth;
      box.classList.add('wrong', 'shake');
      onWrong(Z.phraseToTime(text, phraseOpts()));
    }
  });

  // ---------- Schwer: set the hands ----------

  $('set-check').addEventListener('click', () => {
    if (!session || session.done) return;
    const t = clock.get();
    if (sameTime(t, session.item)) onCorrect();
    else onWrong(t);
  });

  // ---------- evaluation ----------

  function recordFirstAttempt(correct, diag) {
    if (session.item.reask) return; // re-asks are practice, not stats
    const cat = Z.categoryOf(session.item.minute);
    const s = store.stats[cat] || (store.stats[cat] = { asked: 0, wrong: 0 });
    s.asked += 1;
    if (!correct) {
      s.wrong += 1;
      store.errorTypes[diag.type] = (store.errorTypes[diag.type] || 0) + 1;
    }
    save();
  }

  function setFeedback(kind, html) {
    const fb = $('feedback');
    fb.hidden = false;
    fb.className = `feedback ${kind}`;
    $('feedback-msg').innerHTML = html;
  }

  function onCorrect() {
    const item = session.item;
    if (session.attempt === 0) recordFirstAttempt(true);
    session.done = true;
    const slot = item.slot;
    const kind = item.reask ? 'later' : session.attempt === 0 ? 'first' : 'second';
    if (!session.results[slot]) session.results[slot] = kind;
    else if (session.results[slot] === 'missed') session.results[slot] = 'later';
    reportProgress();
    renderProgress(slot);
    clock.setInteractive(false);
    clock.setHighlight(null);
    services.sounds.correct();
    const praise = pick(PRAISE);
    setFeedback('good', `${esc(praise)}<span class="say">${esc(session.phrases.text)}</span>`);
    lockAnswers();
    $('next-question').hidden = false;
    $('next-question').focus({ preventScroll: true });
    const said = `${praise} ${session.phrases.text}`;
    const asked = session.item;
    later(() => {
      if (session && session.item === asked) speak(said);
    }, 350);
  }

  function onWrong(given) {
    const item = session.item;
    const diag = diagnose(given, item);
    if (session.attempt === 0) recordFirstAttempt(false, diag);
    session.attempt += 1;
    services.sounds.wrong();

    if (session.attempt === 1) {
      // First miss: one more help level, highlight the misread hand, try again.
      const level = helpUp(session.help);
      clock.setHelp(level);
      clock.setHighlight({ hour: diag.hour, minute: diag.minute });
      if (level !== session.help) {
        const note = $('help-note');
        note.hidden = false;
        note.textContent = level === 'viel' ? 'Jetzt mit mehr Hilfe an der Uhr' : 'Jetzt mit Zahlen an der Uhr';
      }
      let hint;
      if (diag.hour && diag.minute) hint = 'Schau dir beide Zeiger genau an.';
      else if (diag.hour) hint = 'Schau auf den kleinen roten Zeiger.';
      else hint = 'Schau auf den großen blauen Zeiger.';
      if (diag.type === 'direction') hint = 'Ist es „nach“ oder „vor“? Schau auf den großen blauen Zeiger.';
      if (session.mode === 'schwer') hint = hint.replace('Schau auf', 'Prüfe').replace('Schau dir', 'Prüfe').replace(' genau an', '');
      setFeedback('oops', `Fast! ${esc(hint)}`);
      speak(`Fast! ${hint}`);
      return;
    }

    // Second miss: show and say the answer, no penalty, ask again later.
    session.done = true;
    if (!session.results[item.slot]) session.results[item.slot] = 'missed';
    if (!item.reask) {
      const at = Math.min(session.queue.length, session.pos + 3);
      session.queue.splice(at, 0, { hour: item.hour, minute: item.minute, slot: item.slot, reask: true });
    }
    reportProgress();
    clock.setInteractive(false);
    clock.setHighlight(null);
    lockAnswers(true);
    const say = session.phrases.text;
    setFeedback('oops', `So heißt es:<span class="say">${esc(say)}</span>${item.reask ? '' : '<small>Die Uhrzeit kommt gleich noch einmal.</small>'}`);
    if (session.mode === 'schwer') clock.animateTo(item.hour, item.minute);
    speak(`So heißt es: ${say}`);
    renderProgress();
    $('next-question').hidden = false;
  }

  function lockAnswers(revealRight) {
    if (session.mode === 'leicht' && session.options) {
      for (const o of session.options) {
        o.btn.disabled = true;
        if (revealRight && o.right) o.btn.classList.add('right');
      }
    }
    if (session.mode === 'mittel') {
      $('build-check').disabled = true;
      if (revealRight) $('build').classList.remove('wrong');
    }
    if (session.mode === 'schwer') $('set-check').disabled = true;
  }

  $('next-question').addEventListener('click', () => {
    stopSpeech();
    nextQuestion();
  });
  $('prompt-speak').addEventListener('click', promptSpeech);

  // ---------------------------------------------------------------- end of session, progression
  function finishSession() {
    const r = session.results;
    const first = r.filter((x) => x === 'first').length;
    const stars = r.filter((x) => x && x !== 'missed').length;
    store.history.push({
      date: new Date().toISOString(),
      stufe: session.stufe,
      mode: session.mode,
      help: session.help,
      firstTry: first,
      stars,
      total: QUESTIONS,
      minutes: Math.max(1, Math.round((Date.now() - session.startedAt) / 60000)),
    });
    if (store.history.length > 200) store.history = store.history.slice(-200);
    save();
    const collected = services.session.end({ correct: first, total: QUESTIONS }).stars;

    $('reward-stars').innerHTML = r.map((x, i) => starSvg(x).replace('<svg ', `<svg style="animation-delay:${i * 0.12}s" `)).join('');
    const title = stars >= 9 ? 'Super gemacht!' : stars >= 6 ? 'Toll gemacht!' : 'Gut geübt!';
    $('reward-title').textContent = title;
    $('reward-text').textContent = `${stars} von ${QUESTIONS} Sternen gesammelt.`;
    $('reward-collect').hidden = !collected;
    $('reward-collect').textContent = `+${collected} ★ für deine Sammlung`;
    services.sounds.reward();
    speak(`${title} Du hast ${stars} Sterne gesammelt.`);

    const next = suggestion();
    const card = $('suggest-card');
    card.hidden = !next;
    if (next) $('suggest-text').textContent = `Zweimal hintereinander ${PROMOTE_SCORE} von 10 beim ersten Versuch! Weiter zu Stufe ${next} (${STUFE_NAMES[next]})?`;

    session = null;
    show('screen-reward');
  }

  /** Next Stufe to suggest, or 0. */
  function suggestion() {
    const hist = store.history;
    if (hist.length < 2 || store.suggestDismissedAt >= hist.length - 1) return 0;
    const a = hist[hist.length - 1];
    const b = hist[hist.length - 2];
    const cur = store.settings.stufe;
    if (a.stufe !== cur || b.stufe !== cur || cur >= 5) return 0;
    if (a.firstTry >= PROMOTE_SCORE && b.firstTry >= PROMOTE_SCORE) return cur + 1;
    return 0;
  }

  // Hold-to-confirm button: a simple parent gate for moving up a Stufe.
  function holdButton(btn, onDone, ms = 1600) {
    let timer = null;
    function start(evt) {
      evt.preventDefault();
      btn.classList.add('holding');
      timer = later(() => {
        btn.classList.remove('holding');
        timer = null;
        onDone();
      }, ms);
    }
    function stop() {
      if (timer) cancel(timer);
      timer = null;
      btn.classList.remove('holding');
    }
    btn.addEventListener('pointerdown', start);
    btn.addEventListener('pointerup', stop);
    btn.addEventListener('pointerleave', stop);
    btn.addEventListener('pointercancel', stop);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
    btn.addEventListener('keydown', (e) => {
      if ((e.key === ' ' || e.key === 'Enter') && !timer && !e.repeat) start(e);
    });
    btn.addEventListener('keyup', (e) => {
      if (e.key === ' ' || e.key === 'Enter') stop();
    });
  }

  function acceptSuggestion() {
    const next = suggestion();
    if (!next) return 0;
    store.settings.stufe = next;
    store.suggestDismissedAt = store.history.length - 1;
    save();
    services.sounds.correct();
    return next;
  }
  function dismissSuggestion() {
    store.suggestDismissedAt = store.history.length - 1;
    save();
  }

  holdButton($('suggest-yes'), () => {
    const next = acceptSuggestion();
    $('suggest-card').hidden = true;
    if (next) $('reward-text').textContent = `Ab jetzt: Stufe ${next} – ${STUFE_NAMES[next]}.`;
  });
  $('suggest-no').addEventListener('click', () => {
    dismissSuggestion();
    $('suggest-card').hidden = true;
  });
  holdButton($('banner-yes'), () => {
    acceptSuggestion();
    refreshStart();
  });
  $('banner-no').addEventListener('click', () => {
    dismissSuggestion();
    refreshStart();
  });

  $('again').addEventListener('click', startSession);
  $('to-home').addEventListener('click', () => services.goHome());
  $('start-session').addEventListener('click', () => {
    services.sounds.tap();
    startSession();
  });

  refreshStart();
  show('screen-start');

  instance = {
    destroy() {
      timers.forEach(clearTimeout);
      timers.clear();
      clocks.forEach((c) => c.destroy());
      removeCss();
      root.remove();
    },
  };
}

export function unmount() {
  instance?.destroy();
  instance = null;
}

/** Which hand was misread, and what kind of mistake was it? */
export function diagnose(given, item) {
  if (!given) return { hour: true, minute: true, type: 'other' };
  const hourWrong = h12(given.hour) !== h12(item.hour);
  const minuteWrong = given.minute !== item.minute;
  let type = 'other';
  if (minuteWrong && item.minute !== 0 && item.minute !== 30 && given.minute === 60 - item.minute) type = 'direction';
  else if (hourWrong && !minuteWrong) type = 'hour';
  else if (minuteWrong && !hourWrong) type = 'minute';
  return { hour: hourWrong, minute: minuteWrong || type === 'direction', type };
}

// ------------------------------------------------------------------ parent area

export function SettingsScreen(container, services) {
  const { h, selectField } = services.ui;
  const data = loadData(services);
  const save = () => services.storage.set('data', data);
  container.append(
    h('h2', { class: 'lw-card__title' }, 'Uhr lesen'),
    selectField('Stufe', data.settings.stufe, [1, 2, 3, 4, 5].map((n) => ({ value: n, label: `${n} – ${STUFE_NAMES[n]}` })), (v) => {
      data.settings.stufe = Number(v);
      save();
    }),
    selectField(
      'Regionale Formen',
      data.settings.region,
      [
        { value: 'standard', label: 'Aus (Viertel nach / Viertel vor)' },
        { value: 'viertel', label: 'Viertel vier, drei viertel vier' },
        { value: 'ch', label: 'Schweiz: „ab“ statt „nach“' },
      ],
      (v) => {
        data.settings.region = v;
        save();
      },
    ),
    selectField('Sprechtempo', data.settings.rate, RATES.map((r) => ({ value: r, label: r === 0.9 ? '0,9 (normal)' : String(r).replace('.', ',') })), (v) => {
      data.settings.rate = Number(v);
      save();
      services.speech.speak('Viertel nach drei', { rate: data.settings.rate });
    }),
    h('p', { class: 'lw-muted' }, 'Hilfe an der Uhr, Stufe und Antwortart kann das Kind auch selbst auf dem Startbildschirm der App wählen.'),
  );
}

export function ProgressSummary(container, services) {
  const store = loadData(services);
  const rows = Object.keys(Z.CATEGORY_LABELS)
    .map((cat) => {
      const s = store.stats[cat] || { asked: 0, wrong: 0 };
      return { cat, asked: s.asked, wrong: s.wrong, rate: s.asked ? s.wrong / s.asked : 0 };
    })
    .filter((r) => r.asked > 0)
    .sort((a, b) => b.rate - a.rate || b.wrong - a.wrong);

  let html = `<p><b>Stufe ${store.settings.stufe}</b> – ${STUFE_NAMES[store.settings.stufe]} · ${MODE_NAMES[store.settings.mode]}</p>`;
  html += '<div class="panel"><h3>Wo passieren die meisten Fehler?</h3>';
  if (!rows.length) {
    html += '<p class="panel-note">Noch keine Daten. Nach der ersten Runde steht hier, welche Uhrzeiten schwerfallen.</p>';
  } else {
    html += '<p class="panel-note">Wie oft eine Zeitart beim ersten Versuch falsch gelesen wurde.</p>';
    html += rows
      .map((r) => {
        const pct = Math.round(r.rate * 100);
        return `<div class="stat-row"><span class="stat-name">${esc(Z.CATEGORY_LABELS[r.cat])}</span><span class="stat-nums">${r.wrong} / ${r.asked} falsch</span><span class="stat-bar" aria-hidden="true"><span style="width:${pct}%"></span></span></div>`;
      })
      .join('');
  }
  const et = store.errorTypes;
  const types = Object.keys(ERROR_NAMES).filter((k) => et[k]);
  if (types.length) {
    html += `<p class="panel-note">Art der Fehler:</p><div class="chips">${types.map((k) => `<span class="chip">${esc(ERROR_NAMES[k])}: ${et[k]}</span>`).join('')}</div>`;
  }
  html += '</div>';

  const hist = store.history.slice(-10).reverse();
  if (hist.length) {
    html +=
      '<div class="panel"><h3>Letzte Runden</h3><div class="hist-wrap"><table class="hist"><thead><tr><th>Datum</th><th>Stufe</th><th>Antwort</th><th>Hilfe</th><th>1. Versuch</th><th>Sterne</th></tr></thead><tbody>' +
      hist
        .map((x) => {
          const d = new Date(x.date);
          return `<tr><td>${d.toLocaleDateString('de-DE')} ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</td><td>${x.stufe}</td><td>${MODE_NAMES[x.mode]}</td><td>${x.help}</td><td>${x.firstTry} / ${x.total}</td><td>${x.stars}</td></tr>`;
        })
        .join('') +
      '</tbody></table></div></div>';
  }

  const wrap = document.createElement('div');
  wrap.className = 'uhr uhr--summary';
  wrap.innerHTML = html;
  container.append(wrap);
  return services.ui.loadStylesheet(services.asset('style.css'));
}
