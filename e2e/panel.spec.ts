import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

// Screenshots go to E2E_SHOTS when set (outside the repository); nothing is written otherwise.
const shots = process.env.E2E_SHOTS;
// @axe-core/playwright carries its own playwright-core types; the page is the same object.
const axeOf = (page: Page) => new AxeBuilder({ page: page as never });

const screens: [string, string, RegExp][] = [
  ['overview', '#/', /Сейчас: в работе 1[\s\S]*Какой разделитель использовать в CSV\?/],
  ['work', '#/work/locale-format', /Что проверено/],
  [
    'work-accepted',
    '#/work/add-greeting',
    /Принято локально; в удалённой ветке origin\/harness\/accepted ещё нет\.[\s\S]*git обновил копию: вчера 20:30/,
  ],
  ['reviews', '#/reviews', /раунды 2 из 6/],
  ['decisions', '#/decisions', /Временные \(1\)/],
  ['activity', '#/activity', /Кто что делал[\s\S]*контроллер[\s\S]*вчера 21:05/],
  ['settings', '#/settings', /Технические вопросы решает ведущий: да/],
  ['history', '#/history', /Наибольшая нагрузка за окно/],
  ['health', '#/health', /Контроллер работает/],
];

async function open(page: Page, hash: string, lang = 'ru') {
  await page.goto(`./?lang=${lang}${hash}`);
  await expect(page.locator('main .hui')).toBeVisible();
}

for (const [name, hash, key] of screens) {
  test(`${name}: key text, no horizontal scroll, axe clean`, async ({ page }, info) => {
    // The viewer's clock is fixed shortly after the demo data (19.11.2026 15:00 Moscow time).
    await page.clock.setFixedTime(new Date('2026-11-19T12:05:00Z'));
    await open(page, hash);
    await expect(page.locator('main')).toContainText(key);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'horizontal scroll').toBeLessThanOrEqual(0);
    const axe = await axeOf(page).analyze();
    const serious = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' ')}`)).toEqual([]);
    await expect(page.locator('form')).toHaveCount(0);
    if (shots) {
      mkdirSync(shots, { recursive: true });
      const width = info.project.name === 'mobile' ? 390 : 1280;
      await page.screenshot({ path: join(shots, `${name}-ru-${width}.png`), fullPage: true });
    }
  });
}

test('English labels come from ?lang=en, and the harness texts are asked in it', async ({
  page,
}) => {
  const asked: string[] = [];
  page.on('request', (r) => asked.push(r.url()));
  await open(page, '#/settings', 'en');
  await expect(page.locator('main')).toContainText(
    'The lead agent decides technical questions: yes',
  );
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect(asked.some((u) => u.includes('api/view?lang=en'))).toBe(true);
});

test('keyboard: the nav reaches every screen and focus is visible', async ({ page }) => {
  await open(page, '#/');
  await page.keyboard.press('Tab'); // skip link
  await page.keyboard.press('Tab'); // first nav link
  await page.keyboard.press('Tab'); // reviews
  const focused = page.locator(':focus');
  await expect(focused).toHaveText('Ревью');
  const outline = await focused.evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).not.toBe('none');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/reviews$/);
  await expect(page.locator('main')).toContainText('раунды 2 из 6');
  // A glossary disclosure opens from the keyboard.
  const summary = page.locator('details.hui-term summary').first();
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('details.hui-term').first()).toHaveAttribute('open', '');
});

test('a work link opens the detail, and "what was checked" lands on the rows', async ({ page }) => {
  await open(page, '#/');
  await page.locator('[data-testid="accepted"] a', { hasText: 'что проверено' }).first().click();
  await expect(page).toHaveURL(/#\/work\/add-greeting#verification$/);
  await expect(page.locator('#verification')).toBeInViewport();
});

// The demo feed: 19.11 14:41 (the second attempt start) … 18.11 21:05 (oldest); the remote copy
// was updated on 18.11 at 20:30 (Moscow time, playwright.config).
const days: [string, string, string[], string[]][] = [
  ['the day of the oldest event', '2026-11-18T19:00:00Z', ['21:05'], ['20:30']],
  ['the day of the data', '2026-11-19T12:05:00Z', ['14:41', 'вчера 21:05'], ['вчера 20:30']],
  [
    'the day after',
    '2026-11-20T12:05:00Z',
    ['вчера 14:41', '18.11.2026 21:05'],
    ['18.11.2026 20:30'],
  ],
  ['two days after', '2026-11-21T12:05:00Z', ['19.11.2026 14:41'], ['18.11.2026 20:30']],
];
for (const [when, now, feed, remote] of days)
  test(`times by the viewer's clock on ${when}: today bare, «вчера», then the date`, async ({
    page,
  }) => {
    await page.clock.setFixedTime(new Date(now));
    await open(page, '#/activity');
    const list = page.getByTestId('activity-feed').locator('ol time');
    for (const t of feed)
      await expect(list.filter({ hasText: new RegExp(`^${t}$`) })).toHaveCount(1);
    await open(page, '#/work/add-greeting');
    for (const t of remote)
      await expect(page.getByTestId('remote-checked')).toContainText(`git обновил копию: ${t}.`);
  });

test('who did what: filter by work, then open the work from an event', async ({ page }) => {
  await open(page, '#/activity');
  const feed = page.getByTestId('activity-feed');
  await feed
    .getByRole('group', { name: 'Работа' })
    .getByRole('link', { name: 'add-greeting' })
    .click();
  await expect(page).toHaveURL(/#\/activity\?work=add-greeting$/);
  await expect(feed).toContainText('показано 8 из 17');
  await expect(feed).not.toContainText('locale-format; пишет');
  await feed.locator('ol a', { hasText: 'add-greeting' }).first().click();
  await expect(page).toHaveURL(/#\/work\/add-greeting$/);
  await expect(page.locator('main')).toContainText('в удалённой ветке: что это значит');
});

test('--hui-* set on a wrapper changes the computed colours', async ({ page }) => {
  await open(page, '#/');
  const before = await page.locator('main .hui').evaluate((el) => getComputedStyle(el).color);
  await page.evaluate(() => {
    document.getElementById('root')!.style.setProperty('--hui-text', 'rgb(1, 2, 3)');
  });
  const after = await page.locator('main .hui').evaluate((el) => getComputedStyle(el).color);
  expect(after).toBe('rgb(1, 2, 3)');
  expect(after).not.toBe(before);
});

test('reduced motion and dark theme render without scroll', async ({ browser }) => {
  const ctx = await browser.newContext({
    reducedMotion: 'reduce',
    colorScheme: 'dark',
    viewport: { width: 390, height: 844 },
  });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:4808/?lang=ru#/history');
  await expect(page.locator('main .hui')).toBeVisible();
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(20, 23, 27)');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  const axe = await axeOf(page).analyze();
  expect(
    axe.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => v.id),
  ).toEqual([]);
  await ctx.close();
});

test('long unbroken harness text wraps at 390 px instead of scrolling', async ({ page }) => {
  const long = 'x'.repeat(120);
  await page.route('**/api/work/locale-format*', async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    body.work.title = long;
    body.work.attempts.lastFailure.plain = 'y'.repeat(160);
    await route.fulfill({ response: res, json: body });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, '#/work/locale-format');
  await expect(page.locator('main')).toContainText(long);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('"what was checked" moves keyboard focus to the rows', async ({ page }) => {
  await open(page, '#/');
  await page.locator('[data-testid="accepted"] a', { hasText: 'что проверено' }).first().focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#verification')).toBeFocused();
});

test('without ?lang the CLI language wins over the browser locale', async ({ browser }) => {
  // The demo server runs with --lang ru (playwright.config); an English browser still gets Russian.
  const ctx = await browser.newContext({ locale: 'en-US' });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:4808/#/settings');
  await expect(page.locator('main')).toContainText('Технические вопросы решает ведущий: да');
  await ctx.close();
});

test('a temporary 503 keeps the last view with a stale warning', async ({ page }) => {
  await page.clock.install();
  // Without a stream the page polls; the poll then meets the 503.
  await page.route('**/api/events**', (route) => route.abort());
  await open(page, '#/');
  await page.route('**/api/view*', (route) =>
    route.fulfill({
      status: 503,
      json: { error: { code: 'VIEW_UNAVAILABLE', message: 'harness view: timed out' } },
    }),
  );
  await page.clock.runFor(6000);
  await expect(page.getByTestId('stale')).toContainText(
    /Не удалось обновить данные с \d\d:\d\d: harness view: timed out\. На экране данные на/,
  );
  await expect(page.locator('main')).toContainText('Сейчас: в работе 1');
});
