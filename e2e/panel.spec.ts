import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

// Screenshots go to E2E_SHOTS when set (outside the repository); nothing is written otherwise.
const shots = process.env.E2E_SHOTS;
// @axe-core/playwright carries its own playwright-core types; the page is the same object.
const axeOf = (page: Page) => new AxeBuilder({ page: page as never });

const screens: [string, string, RegExp][] = [
  [
    'overview',
    '#/',
    /Сейчас harness работает над locale-format[\s\S]*В harness: принято 1 из 5 · в работе 1 · ждут 3[\s\S]*Какой разделитель использовать в CSV\?[\s\S]*Проблемы по ходу/,
  ],
  [
    'tasks',
    '#/tasks',
    /Format dates by locale[^]*Попытки: израсходовано 2 из 3, осталось 1[^]*Дальше действует: harness[^]*Export report as CSV[^]*Дальше действует: вы[^]*раунды 2 из 6/,
  ],
  ['work', '#/work/locale-format', /Путь задачи[\s\S]*идёт сейчас[\s\S]*Что проверено/],
  ['work-diagnosis', '#/work/import-csv', /разбор ведущего[\s\S]*ждёт/],
  ['lead', '#/lead', /Журнал ведущего \(6\)[\s\S]*ведущий разобрал отказы locale-format/],
  [
    'work-accepted',
    '#/work/add-greeting',
    /Принято локально; в удалённой ветке origin\/harness\/accepted ещё нет\.[\s\S]*git обновил копию: вчера 20:30/,
  ],
  ['decisions', '#/decisions', /Временные \(1\)/],
  ['activity', '#/activity', /Кто что делал[\s\S]*контроллер[\s\S]*вчера 21:05/],
  ['settings', '#/settings', /Кто принимает решения[\s\S]*Технические вопросы решает ведущий: да/],
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

test('overview rings: two progressbars with values and text, light and dark, no scroll', async ({
  page,
}, info) => {
  // At the demo's own time: «прошло» goes on with the clock from the harness start point.
  await page.clock.setFixedTime(new Date('2026-11-19T12:00:00Z'));
  const width = info.project.name === 'mobile' ? 390 : 1280;
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await open(page, '#/');
    const forecast = page.getByTestId('forecast');
    // The rings are the first thing on the Overview.
    await expect(page.locator('main .hui-overview > *').first()).toHaveAttribute(
      'data-testid',
      'forecast',
    );
    const release = page.getByRole('progressbar', { name: 'До релиза' });
    await expect(release).toHaveAttribute('aria-valuenow', '23');
    await expect(release).toHaveAttribute('aria-valuetext', /готово ~23 %, осталось задач: 5 из 6/);
    const time = page.getByRole('progressbar', { name: 'Время' });
    await expect(time).toHaveAttribute(
      'aria-valuetext',
      'Время: прошло 2 ч 50 мин · осталось ~1,5–3 ч',
    );
    await expect(forecast.getByTestId('human-wait')).toContainText('В прогноз это не входит');
    await expect(page.getByTestId('updates-banner')).toContainText(
      'Доступна harness 0.1.0-alpha.61',
    );
    // Both rings side by side at 1280, one under the other at 390; each fully visible.
    const a = (await release.boundingBox())!;
    const b = (await time.boundingBox())!;
    if (width === 1280) expect(Math.abs(a.y - b.y)).toBeLessThan(2);
    else expect(b.y).toBeGreaterThan(a.y + a.height);
    expect(a.width).toBeGreaterThanOrEqual(120);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'horizontal scroll').toBeLessThanOrEqual(0);
    const axe = await axeOf(page).analyze();
    const serious = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' ')}`)).toEqual([]);
    if (shots && (scheme === 'light' || width === 1280)) {
      mkdirSync(shots, { recursive: true });
      const name = `ru-overview-${width}${scheme === 'dark' ? '-dark' : ''}`;
      await page.screenshot({ path: join(shots, `${name}.png`), fullPage: true });
      await forecast.screenshot({ path: join(shots, `${name}-rings.png`) });
    }
  }
});

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
  await page.keyboard.press('Tab'); // tasks
  const focused = page.locator(':focus');
  await expect(focused).toHaveText('Задачи');
  const outline = await focused.evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).not.toBe('none');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/tasks$/);
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
  expect(bg).toBe('rgb(14, 16, 19)');
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

test('the old #/reviews link lands on the tasks, and «Журнал» groups its screens', async ({
  page,
}) => {
  await open(page, '#/reviews');
  await expect(page).toHaveURL(/#\/tasks$/);
  await expect(page.getByRole('link', { name: 'Задачи', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await open(page, '#/history');
  await expect(page.getByRole('link', { name: 'Журнал', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  const sub = page.getByRole('navigation', { name: 'Разделы журнала' });
  await expect(sub.getByRole('link', { name: 'История' })).toHaveAttribute('aria-current', 'page');
  await sub.getByRole('link', { name: 'Здоровье' }).click();
  await expect(page).toHaveURL(/#\/health$/);
});

test('a task card opens the process timeline of its work', async ({ page }) => {
  await open(page, '#/tasks');
  await page.getByTestId('task-locale-format').getByRole('link', { name: 'Весь процесс' }).click();
  await expect(page).toHaveURL(/#\/work\/locale-format$/);
  const tl = page.getByTestId('timeline');
  await expect(tl.locator(':scope > li')).toHaveCount(6);
  await expect(tl.locator(':scope > li[data-state="current"]')).toContainText('Проверки');
  // Revision 3: preparation is its own step with its time, and the unused store says so.
  const prep = tl.locator(':scope > li').first();
  await expect(prep).toContainText('Подготовкапройдено, 20 с');
  await expect(prep).toContainText('хранилище зависимостей: не используется, 2 с');
  await expect(page.getByRole('link', { name: '← К задачам' })).toBeVisible();
});

test('the theme choice in Settings applies at once and is kept in this browser', async ({
  page,
}) => {
  await open(page, '#/settings');
  const group = page.getByRole('radiogroup', { name: 'Тема' });
  await group.getByRole('radio', { name: 'Тёмная' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const dark = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(dark).toBe('rgb(14, 16, 19)');
  await page.reload();
  await expect(page.locator('main .hui')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(
    page.getByRole('radiogroup', { name: 'Тема' }).getByRole('radio', { name: 'Тёмная' }),
  ).toHaveAttribute('aria-checked', 'true');
  const axe = await axeOf(page).analyze();
  expect(
    axe.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => v.id),
  ).toEqual([]);
  await page
    .getByRole('radiogroup', { name: 'Тема' })
    .getByRole('radio', { name: 'Как в системе' })
    .click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /./);
});

test('an open tab offers a reload when the panel server serves a new build (F-AF)', async ({
  page,
}) => {
  await open(page, '#/');
  // The page carries its build; the same build served again asks nothing.
  await expect(page.locator('meta[name="hui-build"]')).toHaveAttribute('content', /^[0-9a-f]{16}$/);
  const checked = page.waitForResponse('**/api/health');
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await checked;
  await page.waitForTimeout(200);
  await expect(page.getByTestId('new-build')).toHaveCount(0);
  // Only the build decides: the same version with a new build still prompts.
  await page.route('**/api/health', async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    await route.fulfill({ response: res, json: { ...body, build: 'f'.repeat(16) } });
  });
  // The tab checks when it becomes visible again (and every minute).
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  const prompt = page.getByTestId('new-build');
  await expect(prompt).toContainText(
    /Панель обновилась \(версия [^)]+\): на этой вкладке открыта прежняя сборка\./,
  );
  await expect(prompt.getByRole('button', { name: 'Обновить страницу' })).toBeVisible();
});

test('task path: one focusable line per card, focus or tap opens the steps, Escape closes', async ({
  page,
}) => {
  await open(page, '#/tasks');
  const card = page.getByTestId('task-locale-format');
  const trigger = card.getByRole('button', { name: 'Путь задачи Format dates by locale' });
  await expect(trigger).toBeVisible();
  const tip = card.getByRole('tooltip');
  await expect(tip).toBeHidden();
  // The steps are the button's description for assistive technology.
  await expect(trigger).toHaveAccessibleDescription(
    /разбор ведущего — решение \(D1: слабое покрытие\)[\s\S]*попытка 2: код — пройдено; проверки — идёт сейчас/,
  );
  // Keyboard: Tab reaches it and the list opens; Escape closes it.
  await trigger.focus();
  await expect(tip).toBeVisible();
  await expect(tip).toContainText('попытка 2: код — пройдено; проверки — идёт сейчас');
  await page.keyboard.press('Escape');
  await expect(tip).toBeHidden();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  // A tap (click) opens it and a second tap closes it.
  await page.mouse.move(0, 0);
  await trigger.blur();
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(tip).toBeVisible();
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  const dot = card.locator('.hui-dot[data-tone="current"]');
  await expect(dot).toHaveCount(1);
  expect(await dot.evaluate((el) => getComputedStyle(el).animationName)).toBe('hui-pulse');
  // States differ by mark too: failed is a cross, waiting a ring.
  const failed = page.locator('.hui-dot[data-tone="failed"]').first();
  expect(await failed.evaluate((el) => getComputedStyle(el).clipPath)).toMatch(/polygon/);
  const waiting = page.locator('.hui-dot[data-tone="waiting"]').first();
  expect(await waiting.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
    'rgba(0, 0, 0, 0)',
  );
  // Each colour of the owner's palette is used in the demo.
  for (const tone of ['passed', 'current', 'failed', 'waiting', 'decision', 'rework', 'planned'])
    expect(await page.locator(`.hui-dot[data-tone="${tone}"]`).count(), tone).toBeGreaterThan(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await dot.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'horizontal scroll').toBeLessThanOrEqual(0);
});

test('the lead tab and the home panels: lead, previews, what is used, planned tasks', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-11-19T12:05:00Z'));
  await open(page, '#/');
  const lead = page.getByTestId('lead-summary');
  await expect(lead).toContainText('работает');
  await expect(lead).toContainText('Последняя заметка (14:50): жду ответа про разделитель CSV');
  const preview = page.getByTestId('previews').getByRole('link', { name: 'Открыть Сайт' });
  await expect(preview).toHaveAttribute('href', 'http://127.0.0.1:4791/');
  await expect(preview).toHaveAttribute('target', '_blank');
  await expect(page.getByTestId('resources')).toContainText('docker: postgres — 1 работает');
  await expect(page.getByTestId('resources')).toContainText(
    'Удержано: app/e2e (работа import-csv)',
  );
  await expect(page.getByTestId('needs-you')).not.toContainText('удержан');
  // The lead's diagnosis is not «нужно от вас».
  await expect(page.getByTestId('needs-you')).not.toContainText('import-csv');
  await expect(page.getByTestId('by-lead')).toContainText('Разобрать причину повторных отказов');
  await lead.getByRole('link', { name: 'Журнал ведущего' }).click();
  await expect(page).toHaveURL(/#\/lead$/);
  const sub = page.getByRole('navigation', { name: 'Разделы журнала' });
  await expect(sub.getByRole('link', { name: 'Ведущий' })).toHaveAttribute('aria-current', 'page');
  await open(page, '#/tasks');
  await expect(page.getByTestId('tasks-planned')).toContainText('DEMO-6 · Печать отчёта');
  await expect(page.getByTestId('tasks-planned')).toContainText('ещё не утверждена');
  await expect(page.getByTestId('task-import-csv').getByTestId('task-gate-held')).toContainText(
    'Удержано: app/e2e (работа import-csv)',
  );
});
