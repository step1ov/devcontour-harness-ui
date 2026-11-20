// One dictionary for every UI string: both languages have every key, with
// the same kind of value (text, or a function of the same arity), and no
// value is empty. Also the hash routes of the standalone app.

import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { dictionaries } from '../src/model/dict.ts';
import { activityHash, parseRoute, redirectOf, workHash } from '../src/app/route.ts';

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
  const files = [
    ...readdirSync(dir, { recursive: true })
      .map(String)
      .filter((x) => x.endsWith('.tsx'))
      .map((f) => new URL(f, dir)),
  ];
  // The scan covers the screens and the shadcn/ui pieces, and finds text at all.
  assert.ok(files.length >= 15, `files scanned: ${files.length}`);
  assert.ok(files.some((u) => u.pathname.endsWith('/ui/card.tsx')));
  // The scan itself finds text: a literal word between tags is caught.
  assert.match('<p>Готово</p>', />([^<>{}]*[A-Za-zА-Яа-яЁё][^<>{}]*)</);
  for (const url of files) {
    const f = url.pathname.split('/src/')[1]!;
    const src = readFileSync(url, 'utf8');
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
    }
  }
});

test('components and the app put no literal words in accessible attributes or JSX string expressions', () => {
  const files = [
    ...readdirSync(new URL('../src/components/', import.meta.url), { recursive: true })
      .map(String)
      .filter((x) => x.endsWith('.tsx'))
      .map((f) => new URL('../src/components/' + f, import.meta.url)),
    new URL('../src/app/main.tsx', import.meta.url),
  ];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\b(aria-label|title|alt|placeholder)="([^"]*)"/g))
      assert.doesNotMatch(m[2]!, /[A-Za-zА-Яа-яЁё]{2}/, `${f.pathname}: ${m[0]}`);
    // {'text'} or {"text"} with two letters in a row inside JSX children.
    for (const m of src.matchAll(/\{\s*(['"])([^'"]*[A-Za-zА-Яа-яЁё]{2}[^'"]*)\1\s*\}/g))
      assert.fail(`${f.pathname}: literal JSX string ${m[0]}`);
  }
});

test('hash routes', () => {
  assert.deepEqual(parseRoute(''), { screen: 'overview' });
  assert.deepEqual(parseRoute('#/'), { screen: 'overview' });
  assert.deepEqual(parseRoute('#/reviews'), { screen: 'reviews' });
  assert.equal(redirectOf(parseRoute('#/reviews')), '#/tasks');
  assert.deepEqual(parseRoute('#/tasks'), { screen: 'tasks' });
  assert.equal(redirectOf(parseRoute('#/tasks')), undefined);
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
