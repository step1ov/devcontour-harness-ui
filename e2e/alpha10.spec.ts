// ui 0.1.0-alpha.10 in the browser: the sticky top menu (P6-28) in both
// themes and at 390 px with anchors below it, the card bar of the current
// attempt with the attempt badge (P6-25) and the per-attempt review line
// (P6-10). Runs against --demo (playwright.config).
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const axeOf = (page: Page) => new AxeBuilder({ page: page as never });

async function open(page: Page, hash: string) {
  await page.goto(`./?lang=ru${hash}`);
  await expect(page.locator('main .hui')).toBeVisible();
}

for (const scheme of ['light', 'dark'] as const)
  test(`the top menu stays on top while scrolling (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await open(page, '#/tasks');
    const top = page.locator('header.app-top');
    const nav = page.getByRole('navigation', { name: 'Разделы панели' });
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(200);
    const box = await top.boundingBox();
    expect(box!.y).toBe(0);
    await expect(nav.getByRole('link', { name: 'Задачи' })).toBeInViewport();
    // Opaque: the menu has its own background, not the content under it.
    const bg = await top.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).not.toBe('rgba(0, 0, 0, 0)');
    // The same surface as the cards, in either theme.
    expect(bg).toBe(
      await page
        .locator('main .hui-card-ui')
        .first()
        .evaluate((el) => getComputedStyle(el).backgroundColor),
    );
    // A short menu: at most a fifth of the screen.
    const vh = page.viewportSize()!.height;
    expect(box!.height).toBeLessThan(vh / 5);
    // The tabs still reach every screen from the keyboard, also when scrolled.
    await nav.getByRole('link', { name: 'Решения' }).focus();
    await expect(nav.getByRole('link', { name: 'Решения' })).toBeInViewport();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'horizontal scroll').toBeLessThanOrEqual(0);
    const axe = await axeOf(page).analyze();
    expect(
      axe.violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => v.id),
    ).toEqual([]);
  });

test('an anchor lands below the sticky menu, not under it', async ({ page }) => {
  await open(page, '#/');
  await page.locator('[data-testid="accepted"] a', { hasText: 'что проверено' }).first().click();
  await expect(page).toHaveURL(/#\/work\/add-greeting#verification$/);
  const target = page.locator('#verification');
  await expect(target).toBeInViewport();
  const menu = (await page.locator('header.app-top').boundingBox())!;
  const box = (await target.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(menu.y + menu.height);
});

test('a task card: the current attempt toward acceptance, the badge, the review of each attempt', async ({
  page,
}) => {
  await open(page, '#/tasks');
  const running = page.getByTestId('task-locale-format');
  const bar = running.getByTestId('task-progress').getByRole('progressbar');
  await expect(bar).toHaveAttribute('aria-valuenow', '25');
  await expect(bar).toHaveAccessibleName('Попытка 2: к приёмке ~25 %');
  await expect(running.getByTestId('task-progress')).toContainText(
    'Попытка 2: идёт «проверки» — пройдено этапов 1 из 4',
  );
  await expect(running.getByTestId('task-retry-after')).toHaveText('повтор после отказа: проверки');
  await expect(running.getByTestId('attempt-badge')).toHaveText('попытка 2 из 3');
  // The badge sits in the card corner: its right edge near the header's.
  const head = (await running.locator('h3').boundingBox())!;
  const badge = (await running.getByTestId('attempt-badge').boundingBox())!;
  const cardBox = (await running.boundingBox())!;
  expect(badge.x + badge.width).toBeGreaterThan(cardBox.x + cardBox.width - 40);
  expect(badge.y).toBeLessThan(head.y + head.height + 30);
  // Held for the lead: a red badge that says so.
  const held = page.getByTestId('task-import-csv');
  await expect(held.getByTestId('attempt-badge')).toHaveText('попытка 2 из 3 — ждёт ведущего');
  await expect(held.getByTestId('attempt-badge')).toHaveAttribute('data-why', 'lead');
  await expect(held.getByTestId('task-attempt-reviews')).toHaveText('Ревью: попытка 2 — отклонено');
  await expect(held.getByTestId('task-reviews')).toHaveCount(0);
  // The badge tooltip for the pointer repeats the attempts line of the card.
  await running.getByTestId('attempt-badge').hover();
  await expect(
    running.locator('.hui-tooltip').filter({ hasText: 'Попытки: израсходовано 2 из 3' }),
  ).toBeVisible();
});
