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
  ['work-accepted', '#/work/add-greeting', /в удалённом репозитории — неизвестно/],
  ['reviews', '#/reviews', /раунды 2 из 6/],
  ['decisions', '#/decisions', /Временные \(1\)/],
  ['activity', '#/activity', /Кто что делал/],
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
  await page.locator('[data-testid="accepted"] a', { hasText: 'что проверено' }).click();
  await expect(page).toHaveURL(/#\/work\/add-greeting#verification$/);
  await expect(page.locator('#verification')).toBeInViewport();
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
