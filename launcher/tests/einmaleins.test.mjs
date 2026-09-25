import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../apps/einmaleins/logic.js';
import { tip, splitTip, maskTip, speakable } from '../apps/einmaleins/tips.js';

// ---------------------------------------------------------------- logic

function seeded(seed) {
  return () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
}

test('factsFor includes swapped facts without duplicates', () => {
  const f3 = L.factsFor([3]);
  assert.equal(f3.length, 19);
  const keys = f3.map((f) => L.key(f.a, f.b));
  assert.ok(keys.includes('3x8') && keys.includes('8x3'));
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(L.factsFor(L.ORDER).length, 100);
});

test('Leitner: up without hint, stay with hint, back to 1 when wrong', () => {
  let s = L.newStat();
  s = L.applyAnswer(s, true, false, 3);
  assert.equal(s.box, 2);
  s = L.applyAnswer(s, true, true, 3);
  assert.equal(s.box, 2);
  assert.equal(s.hints, 1);
  s = L.applyAnswer(s, true, false, 3);
  s = L.applyAnswer(s, true, false, 3);
  s = L.applyAnswer(s, true, false, 3);
  s = L.applyAnswer(s, true, false, 3);
  assert.equal(s.box, 5);
  s = L.applyAnswer(s, false, false, 3);
  assert.equal(s.box, 1);
  assert.deepEqual([s.seen, s.right, s.wrong], [7, 6, 1]);
});

test('multiple choice with full help lifts a fact at most to box 2', () => {
  let s = L.newStat();
  for (let i = 0; i < 5; i++) s = L.applyAnswer(s, true, false, 1);
  assert.equal(s.box, 2);
});

test('session has 15 distinct cards, weighted toward low boxes', () => {
  const pool = L.factsFor(L.ORDER);
  const facts = {};
  pool.forEach((f, i) => { facts[L.key(f.a, f.b)] = { ...L.newStat(), box: i < 50 ? 1 : 5 }; });
  let low = 0;
  const rng = seeded(7);
  for (let run = 0; run < 200; run++) {
    const s = L.buildSession(pool, facts, 15, rng);
    assert.equal(s.length, 15);
    assert.equal(new Set(s.map((c) => L.key(c.a, c.b))).size, 15);
    for (let i = 1; i < s.length; i++) {
      assert.ok(!(s[i].a === s[i - 1].b && s[i].b === s[i - 1].a), 'swap directly after fact');
    }
    low += s.filter((c) => facts[L.key(c.a, c.b)].box === 1).length;
  }
  assert.ok(low / (200 * 15) > 0.75, `low-box share ${low / 3000}`);
});

test('wrong answers come back later, at most twice', () => {
  const queue = [{ a: 3, b: 4 }, { a: 1, b: 2 }, { a: 5, b: 5 }, { a: 6, b: 6 }, { a: 7, b: 7 }];
  const repeats = {};
  assert.ok(L.requeue(queue, 0, queue[0], repeats));
  assert.deepEqual(queue[4], { a: 3, b: 4, repeat: true });
  assert.ok(L.requeue(queue, 4, queue[4], repeats));
  assert.deepEqual(queue[6], { a: 3, b: 4, repeat: true });
  assert.ok(!L.requeue(queue, 6, queue[6], repeats));
});

test('choices: 4 distinct positive options containing the answer', () => {
  const rng = seeded(3);
  for (let a = 1; a <= 10; a++) {
    for (let b = 1; b <= 10; b++) {
      const c = L.choices(a, b, rng);
      assert.equal(c.length, 4, `${a}×${b}: ${c}`);
      assert.equal(new Set(c).size, 4);
      assert.ok(c.includes(a * b));
      assert.ok(c.every((v) => v > 0));
    }
  }
  // Near-misses for 3 × 4: swapped digits (21), a row more/less, a column more/less.
  const c = L.choices(3, 4, seeded(1));
  assert.ok(c.includes(21));
  assert.ok(c.filter((v) => [16, 8, 15, 9].includes(v)).length === 2, String(c));
});

test('level-up suggestion needs >= 90 % over two sessions at that level', () => {
  const session = (level, right, total) => ({
    level,
    results: Array.from({ length: total }, (_, i) => ({ a: 2, b: 3 + (i % 5), correct: i < right, hint: false }))
  });
  assert.deepEqual(L.levelUpReihen([session(1, 10, 10)], 1, [2]), []);
  assert.deepEqual(L.levelUpReihen([session(1, 10, 10), session(1, 9, 10)], 1, [2]), [2]);
  assert.deepEqual(L.levelUpReihen([session(1, 10, 10), session(1, 7, 10)], 1, [2]), []);
  assert.deepEqual(L.levelUpReihen([session(1, 10, 10), session(2, 10, 10)], 1, [2]), []);
  assert.deepEqual(L.levelUpReihen([session(3, 10, 10), session(3, 10, 10)], 3, [2]), []);
  // A correct answer with a hint does not count as known.
  const hinted = { level: 2, results: [{ a: 2, b: 3, correct: true, hint: true }, { a: 2, b: 4, correct: true, hint: false }, { a: 2, b: 5, correct: true, hint: false }] };
  assert.deepEqual(L.levelUpReihen([hinted, hinted], 2, [2]), []);
});

// ---------------------------------------------------------------- tips

const ALL = [];
for (let a = 1; a <= 10; a++) for (let b = 1; b <= 10; b++) ALL.push([a, b]);

// Evaluate "5 × 8 + 2 × 8" with × and : before + and −.
function evaluate(expr) {
  const tokens = expr.trim().split(/\s+/);
  const terms = [];
  const signs = [1];
  let value = Number(tokens[0]);
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i];
    const n = Number(tokens[i + 1]);
    assert.ok(Number.isFinite(n), `not a number in "${expr}"`);
    if (op === '×') value *= n;
    else if (op === ':') value /= n;
    else if (op === '+' || op === '−') {
      terms.push(value);
      signs.push(op === '+' ? 1 : -1);
      value = n;
    } else assert.fail(`unknown operator "${op}" in "${expr}"`);
  }
  terms.push(value);
  return terms.reduce((sum, t, i) => sum + signs[i] * t, 0);
}

// Strip the leading label ("Verdoppeln: ") but not a division " : ".
function mathPart(text) {
  const m = text.match(/^[^:]*?[^ ]: /);
  return (m ? text.slice(m[0].length) : text).replace(/\.$/, '');
}

test('tip() gives a non-empty German tip ending with the product for all 100 facts', () => {
  for (const [a, b] of ALL) {
    const t = tip(a, b);
    assert.equal(typeof t, 'string');
    assert.ok(t.length > 10, `${a}×${b}: too short`);
    assert.ok(t.endsWith(` ${a * b}.`), `${a}×${b}: "${t}" must end with the product`);
    assert.ok(t.includes(`${a} × ${b}`), `${a}×${b}: "${t}" must name the fact`);
  }
});

test('every calculation inside every tip is correct', () => {
  for (const [a, b] of ALL) {
    const t = tip(a, b);
    const math = mathPart(t).replace(' ist dasselbe wie ', ' = ');
    if (math.includes('→')) {
      // Doubling chain: 4 × 6 → 12 → 24
      const [start, ...steps] = math.split(' → ').map((s) => s.trim());
      let v = evaluate(start) / 4;
      for (const s of steps) {
        v *= 2;
        assert.equal(Number(s), v, `${a}×${b}: "${t}"`);
      }
      continue;
    }
    const parts = math.split(' = ');
    for (const part of parts) {
      assert.equal(evaluate(part), a * b, `${a}×${b}: "${part}" in "${t}"`);
    }
  }
});

test('rules apply in priority order', () => {
  const rule = (a, b) => {
    const t = tip(a, b);
    if (t.startsWith('Mal 10 minus')) return 9;
    if (t.startsWith('Mal 1 ')) return 1;
    if (t.startsWith('Hänge')) return 10;
    if (t.startsWith('Verdoppeln')) return 2;
    if (t.startsWith('Die Hälfte')) return 5;
    if (t.startsWith('Zweimal')) return 4;
    if (t.startsWith('Quadratzahl')) return 'square';
    if (t.startsWith('Nachbar')) return 'neighbor';
    if (t.includes('ist dasselbe wie')) return 'swap';
    return 'split';
  };
  for (const [a, b] of ALL) {
    const has = (n) => a === n || b === n;
    let expected;
    if (has(1)) expected = 1;
    else if (has(10)) expected = 10;
    else if (has(2)) expected = 2;
    else if (has(5)) expected = 5;
    else if (has(9)) expected = 9;
    else if (has(4)) expected = 4;
    else if (a === b) expected = 'square';
    else if (Math.abs(a - b) === 1) expected = 'neighbor';
    else expected = rule(a, b) === 'swap' ? 'swap' : 'split';
    assert.equal(rule(a, b), expected, `${a}×${b}: "${tip(a, b)}"`);
  }
});

test('commutative tip only points to the easier swapped fact', () => {
  const order = [1, 10, 2, 5, 4, 9, 3, 6, 8, 7];
  for (const [a, b] of ALL) {
    const t = tip(a, b);
    if (t.includes('ist dasselbe wie')) {
      assert.ok(order.indexOf(a) < order.indexOf(b), `${a}×${b}: "${t}"`);
      assert.ok(!tip(b, a).includes('ist dasselbe wie'), `${b}×${a} must not point back`);
    }
  }
});

test('examples from the brief', () => {
  assert.equal(tip(7, 10), 'Hänge eine 0 an: 7 × 10 = 70.');
  assert.equal(tip(2, 8), 'Verdoppeln: 2 × 8 = 8 + 8 = 16.');
  assert.equal(tip(5, 8), 'Die Hälfte von mal 10: 5 × 8 = 80 : 2 = 40.');
  assert.equal(tip(9, 7), 'Mal 10 minus einmal: 9 × 7 = 70 − 7 = 63.');
  assert.equal(tip(4, 6), 'Zweimal verdoppeln: 4 × 6 → 12 → 24.');
  assert.equal(tip(7, 7), 'Quadratzahl – merk sie dir: 7 × 7 = 49.');
  assert.equal(tip(6, 7), 'Nachbar der Quadratzahl: 6 × 7 = 6 × 6 + 6 = 36 + 6 = 42.');
  assert.equal(tip(3, 8), '3 × 8 ist dasselbe wie 8 × 3 = 24.');
  assert.equal(splitTip(7, 8), '7 × 8 = 5 × 8 + 2 × 8 = 40 + 16 = 56.');
  assert.equal(tip(1, 6), 'Mal 1 bleibt die Zahl gleich: 1 × 6 = 6.');
});

test('maskTip hides only the final result', () => {
  for (const [a, b] of ALL) {
    const masked = maskTip(tip(a, b), a, b);
    assert.ok(masked.endsWith('?'), masked);
    assert.ok(!masked.endsWith(`${a * b}.`), masked);
  }
  assert.equal(maskTip(tip(9, 7), 9, 7), 'Mal 10 minus einmal: 9 × 7 = 70 − 7 = ?');
});

test('speakable reads symbols as German words', () => {
  assert.equal(speakable(tip(9, 7)), 'Mal 10 minus einmal: 9 mal 7 ist 70 minus 7 ist 63.');
  assert.equal(speakable(maskTip(tip(4, 6), 4, 6)), 'Zweimal verdoppeln: 4 mal 6, dann 12, dann wie viel?');
});
