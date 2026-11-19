// One dictionary for every UI string: both languages have every key, with
// the same kind of value (text, or a function of the same arity), and no
// value is empty. Also the hash routes of the standalone app.

import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { dictionaries } from '../src/model/dict.ts';
import { activityHash, parseRoute, workHash } from '../src/app/route.ts';

function walk(ru: unknown, en: unknown, path: string, out: string[]) {
  if (typeof ru === 'function' || typeof en === 'function') {
    if (typeof ru !== 'function' || typeof en !== 'function') out.push(`${path}: kind differs`);
    else if (ru.length !== en.length) out.push(`${path}: arity ${ru.length} vs ${en.length}`);
    return;
  }
  if (typeof ru === 'string' || typeof en === 'string') {
    if (typeof ru !== 'string' || typeof en !== 'string') out.push(`${path}: kind differs`);
    else if (!ru.trim() || !en.trim()) out.push(`${path}: empty`);
    return;
  }
  const a = ru as Record<string, unknown>;
  const b = en as Record<string, unknown>;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (!Object.hasOwn(a, k)) out.push(`${path}.${k}: missing in ru`);
    else if (!Object.hasOwn(b, k)) out.push(`${path}.${k}: missing in en`);
    else walk(a[k], b[k], `${path}.${k}`, out);
  }
}

test('both languages have every dictionary key with the same kind of value', () => {
  const out: string[] = [];
  walk(dictionaries.ru, dictionaries.en, 'dict', out);
  assert.deepEqual(out, []);
});

test('the Russian dictionary is Russian: section titles and glossary are in Cyrillic', () => {
  const ru = dictionaries.ru;
  for (const s of [ru.nav.overview, ru.work.whyRetry, ru.work.whatChecked, ru.settings.ask])
    assert.match(s, /[а-яё]/i, s);
  for (const [id, g] of Object.entries(ru.glossary)) assert.match(g.meaning, /[а-яё]/i, id);
});

test('components write no visible text of their own: every JSX text node is punctuation', () => {
  const dir = new URL('../src/components/', import.meta.url);
  let seen = 0;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.tsx'))) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    // Text between a closing `>` and an opening `<` in JSX that contains a letter.
    for (const m of src.matchAll(/>([^<>{}]*[A-Za-zА-Яа-яЁё][^<>{}]*)</g)) {
      const s = m[1]!.trim();
      if (!s || /^[=)&|?:;,.\s]/.test(s) || /=>|\(|\)|&&|\|\||[?=;]/.test(s)) continue; // code, not text
      // Allowed literal words: commands and the product name.
      assert.match(
        s,
        /^(Harness|harness input-show --state|--request|harness run)$/,
        `${f}: «${s}»`,
      );
      seen++;
    }
  }
  assert.ok(seen > 0, 'the scan finds JSX text at all');
});

test('hash routes', () => {
  assert.deepEqual(parseRoute(''), { screen: 'overview' });
  assert.deepEqual(parseRoute('#/'), { screen: 'overview' });
  assert.deepEqual(parseRoute('#/reviews'), { screen: 'reviews' });
  assert.deepEqual(parseRoute('#/work/locale-format'), { screen: 'work', workId: 'locale-format' });
  assert.deepEqual(parseRoute('#/work/a%20b#verification'), {
    screen: 'work',
    workId: 'a b',
    anchor: 'verification',
  });
  assert.deepEqual(parseRoute('#/activity?work=x&actor=lead'), {
    screen: 'activity',
    filter: { workId: 'x', actor: 'lead' },
  });
  assert.deepEqual(parseRoute('#/work/%E0%A4%A'), { screen: 'unknown' });
  assert.deepEqual(parseRoute('#/nope'), { screen: 'unknown' });
  assert.deepEqual(parseRoute('#/__proto__'), { screen: 'unknown' });
  assert.equal(workHash('a/b'), '#/work/a%2Fb');
  assert.equal(activityHash({ workId: 'w', actor: 'lead' }), '#/activity?work=w&actor=lead');
  assert.equal(activityHash({}), '#/activity');
});
