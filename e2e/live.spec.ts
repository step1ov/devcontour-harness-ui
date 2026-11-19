// Live updates in the browser (slice S3): a changed view reaches an open
// page within 2 s, a failing source shows a stale warning instead of fresh
// data, a hidden tab costs the server no harness run, and a page whose
// stream is blocked falls back to polling.
import { expect, test, type Page } from '@playwright/test';
import { spawn, type ChildProcessByStdio } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { fakeHarness, runsIn } from '../tests/fake-harness.ts';

const sample = JSON.parse(readFileSync('fixtures/ru/view.sample.json', 'utf8'));

function writeView(file: string, token: string, title: string) {
  const v = structuredClone(sample);
  v.source.token = token;
  v.generatedAt = new Date().toISOString();
  v.questions[0].title = title;
  writeFileSync(file, JSON.stringify(v));
}

async function startCli(args: string[]) {
  const child: ChildProcessByStdio<null, Readable, Readable> = spawn(
    process.execPath,
    ['dist/lib/cli.js', '--lang', 'ru', ...args],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const url = await new Promise<string>((ok, fail) => {
    let out = '';
    child.stdout.on('data', (c) => {
      out += c;
      if (out.includes('\n')) ok(JSON.parse(out.split('\n')[0]!).url);
    });
    child.once('exit', (code) => fail(new Error(`cli exited ${code}`)));
  });
  return {
    url,
    stop: () =>
      new Promise<void>((ok) => {
        child.once('exit', () => ok());
        child.kill('SIGTERM');
      }),
  };
}

function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'hui-e2e-live-'));
  return {
    dir,
    remove: () => {
      if (!dir.startsWith(join(tmpdir(), 'hui-e2e-live-'))) throw new Error('refusing rm');
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

const setHidden = (page: Page, hidden: boolean) =>
  page.evaluate((h) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);

test('a rewritten view file reaches the open page within 2 s; a missing one is stale', async ({
  page,
}) => {
  const s = scratch();
  const file = join(s.dir, 'view.json');
  writeView(file, 'e2e-a', 'Первый вопрос');
  const cli = await startCli(['--view', file]);
  try {
    await page.goto(cli.url + '?lang=ru#/');
    await expect(page.locator('main')).toContainText('Первый вопрос');
    const fresh = page.getByTestId('freshness');
    await expect(fresh).toContainText(/Данные на \d\d:\d\d · снимок/);
    writeView(file, 'e2e-b', 'Второй вопрос');
    await expect(page.locator('main')).toContainText('Второй вопрос', { timeout: 2000 });
    unlinkSync(file);
    await expect(page.getByTestId('stale')).toContainText(
      /Не удалось обновить данные с \d\d:\d\d/,
      {
        timeout: 3000,
      },
    );
    // The last document stays, marked as possibly out of date, never as fresh.
    await expect(page.getByTestId('stale')).toContainText('могут быть устаревшими');
    await expect(page.locator('main')).toContainText('Второй вопрос');
    writeView(file, 'e2e-c', 'Третий вопрос');
    await expect(page.locator('main')).toContainText('Третий вопрос', { timeout: 3000 });
    await expect(page.getByTestId('stale')).toHaveCount(0);
  } finally {
    await cli.stop();
    s.remove();
  }
});

test('live route: a hidden tab runs no harness; showing it again resumes', async ({ page }) => {
  const s = scratch();
  const viewFile = join(s.dir, 'view.json');
  const countFile = join(s.dir, 'runs');
  writeView(viewFile, 'live-a', 'Живой вопрос');
  const fake = fakeHarness({ view: true, lang: true, viewFile, countFile });
  const cli = await startCli(['--state', join(s.dir, 'state'), '--harness', fake.bin]);
  try {
    await page.goto(cli.url + '?lang=ru#/');
    await expect(page.locator('main')).toContainText('Живой вопрос');
    await expect(page.getByTestId('freshness')).toContainText('обновляются сами');
    await setHidden(page, true);
    await page.waitForTimeout(500);
    const hidden = runsIn(countFile).length;
    await page.waitForTimeout(4000);
    expect(runsIn(countFile).length, 'harness runs while hidden').toBe(hidden);
    await setHidden(page, false);
    await expect.poll(() => runsIn(countFile).length, { timeout: 3000 }).toBeGreaterThan(hidden);
  } finally {
    await cli.stop();
    fake.remove();
    s.remove();
  }
});

test('a blocked stream falls back to polling every 5 s', async ({ page }) => {
  const s = scratch();
  const file = join(s.dir, 'view.json');
  writeView(file, 'poll-a', 'Вопрос опроса');
  const cli = await startCli(['--view', file]);
  try {
    await page.route('**/api/events**', (r) => r.abort());
    await page.goto(cli.url + '?lang=ru#/');
    await expect(page.getByTestId('freshness')).toContainText('проверка раз в 5 секунд');
    writeView(file, 'poll-b', 'Новый вопрос опроса');
    await expect(page.locator('main')).toContainText('Новый вопрос опроса', { timeout: 7000 });
  } finally {
    await cli.stop();
    s.remove();
  }
});

test('a load that fails after a pushed change is retried until it succeeds', async ({ page }) => {
  const s = scratch();
  const file = join(s.dir, 'view.json');
  writeView(file, 'retry-a', 'Вопрос до сбоя');
  const cli = await startCli(['--view', file]);
  try {
    await page.goto(cli.url + '?lang=ru#/');
    await expect(page.locator('main')).toContainText('Вопрос до сбоя');
    await expect(page.getByTestId('freshness')).toContainText('снимок');
    // The stream stays healthy, but the document GET fails for a while.
    await page.route('**/api/view**', (r) => r.abort());
    writeView(file, 'retry-b', 'Вопрос после сбоя');
    await expect(page.getByTestId('stale')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('main')).toContainText('Вопрос до сбоя');
    // No further file change: only the page's own retry can bring the new view.
    await page.unroute('**/api/view**');
    await expect(page.locator('main')).toContainText('Вопрос после сбоя', { timeout: 7000 });
    await expect(page.getByTestId('stale')).toHaveCount(0);
  } finally {
    await cli.stop();
    s.remove();
  }
});

test('a first load refused as unavailable is retried until the view comes', async ({ page }) => {
  const s = scratch();
  const file = join(s.dir, 'view.json');
  writeView(file, 'cold-a', 'Вопрос после старта');
  const cli = await startCli(['--view', file]);
  try {
    await page.route('**/api/view**', (r) =>
      r.fulfill({
        status: 503,
        json: { error: { code: 'VIEW_UNAVAILABLE', message: 'harness view: timed out' } },
      }),
    );
    await page.goto(cli.url + '?lang=ru#/');
    await expect(page.locator('main')).toContainText('Представление сейчас недоступно');
    // The stream is healthy and the file never changes again: only a retry helps.
    await page.unroute('**/api/view**');
    await expect(page.locator('main')).toContainText('Вопрос после старта', { timeout: 7000 });
  } finally {
    await cli.stop();
    s.remove();
  }
});

test('a hidden tab never polls, even after a load failed', async ({ page }) => {
  const s = scratch();
  const file = join(s.dir, 'view.json');
  writeView(file, 'hide-a', 'Скрытый вопрос');
  const cli = await startCli(['--view', file]);
  try {
    await page.goto(cli.url + '?lang=ru#/');
    await expect(page.locator('main')).toContainText('Скрытый вопрос');
    let gets = 0;
    await page.route('**/api/view**', (r) => {
      gets++;
      return r.abort();
    });
    writeView(file, 'hide-b', 'Новый скрытый вопрос');
    await expect(page.getByTestId('stale')).toBeVisible({ timeout: 3000 });
    await setHidden(page, true);
    const before = gets;
    await page.waitForTimeout(6000);
    expect(gets, 'GETs while hidden').toBe(before);
  } finally {
    await cli.stop();
    s.remove();
  }
});

test('the work screen holds one stream, the work detail one', async ({ page }) => {
  const opened: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/events')) opened.push(r.url());
  });
  await page.goto('./?lang=ru#/work/locale-format');
  await expect(page.locator('main')).toContainText('Что проверено');
  await expect(page.getByTestId('freshness')).toContainText('снимок');
  expect(opened.length).toBe(1);
  expect(new URL(opened[0]!).searchParams.get('work')).toBe('locale-format');
});
