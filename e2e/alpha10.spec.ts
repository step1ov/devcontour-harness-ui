// ui 0.1.0-alpha.10 in the browser: the sticky top menu (P6-28) in both
// themes and at 390 px with anchors below it, the card bar of the current
// attempt with the attempt badge (P6-25) and the per-attempt review line
// (P6-10). Runs against --demo (playwright.config).
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

async function startCli(file: string) {
  const child = spawn(process.execPath, ['dist/lib/cli.js', '--lang', 'ru', '--view', file], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const url = await new Promise<string>((ok, fail) => {
    let out = '';
    child.stdout.on('data', (c) => {
      out += c;
      if (out.includes('\n')) ok(JSON.parse(out.split('\n')[0]!).url);
    });
    child.once('exit', (code) => fail(new Error(`cli exited ${code}`)));
  });
  return {
    url: url.replace(/\/?$/, '/'),
    stop: () =>
      new Promise<void>((ok) => {
        child.once('exit', () => ok());
        child.kill('SIGTERM');
      }),
  };
}

for (const scheme of ['light', 'dark'] as const)
  test(`revision 8 data: stages, growth, reopened, attempt reviews, decisions (${scheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.clock.setFixedTime(new Date('2026-11-19T12:05:00Z'));
    const dir = mkdtempSync(join(tmpdir(), 'hui-e2e-a10-'));
    const file = join(dir, 'view.json');
    const v = JSON.parse(readFileSync('fixtures/ru/view.sample.json', 'utf8'));
    v.viewRevision = 8;
    Object.assign(v.forecast.progress, {
      growth: {
        at: '2026-11-19T11:01:00.000Z',
        added: ['photo-gate-handoff'],
        before: 95,
        after: 80,
        by: 'works',
        line: 'план вырос: +photo-gate-handoff (было 95 % → стало 80 %)',
      },
    });
    v.forecast.outline = {
      state: 'recorded',
      revision: 1,
      units: 10,
      stages: [
        {
          id: 'infra',
          kind: 'infra',
          state: 'registered',
          units: 3,
          registered: 3,
          percent: 100,
          components: [],
        },
        {
          id: 'product',
          kind: 'product',
          state: 'partial',
          units: 5,
          registered: 2,
          percent: 20,
          components: [],
        },
        {
          id: 'deploy',
          kind: 'deploy',
          state: 'unregistered',
          units: 2,
          registered: 0,
          percent: 0,
          components: [],
        },
      ],
      line: 'план выпуска: 3 этапа, ~10 задач; зарегистрировано ~5, ещё нет ~5',
    };
    const w = v.works.find((x: { id: string }) => x.id === 'import-csv');
    w.attemptReviews = [
      {
        attempt: 1,
        phase: 'candidate',
        verdict: 'rejected',
        findings: 3,
        notes: 0,
        at: '2026-11-19T10:40:00.000Z',
      },
      {
        attempt: 2,
        phase: 'candidate',
        verdict: 'rejected',
        findings: 1,
        notes: 1,
        at: '2026-11-19T11:35:00.000Z',
      },
    ];
    v.works.find((x: { id: string }) => x.id === 'add-greeting').reopened = {
      at: '2026-11-19T11:00:00.000Z',
      by: 'lead',
      revision: 2,
      budget: 'fresh',
      acceptedSha: '3b1f9e0aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      spent: 1,
      reason:
        'переоткрыта ведущим: доработка после приёмки (принятый результат 3b1f9e0 не включён)',
    };
    v.decisions.unshift({
      id: 'diagnosis:0123456789abcdef',
      kind: 'diagnosis',
      by: 'lead',
      at: '2026-11-19T11:40:50.000Z',
      workId: 'locale-format',
      subject: 'D1',
      temporary: false,
      title: 'слабое покрытие · по желанию',
      reason: 'тест не ловит лишний импорт',
    });
    writeFileSync(file, JSON.stringify(v));
    const cli = await startCli(file);
    try {
      await page.goto(cli.url + '?lang=ru#/');
      await expect(page.getByTestId('forecast-stages')).toContainText(
        'продукт — 20 % (заведена часть задач)',
      );
      await expect(page.getByTestId('forecast-growth')).toHaveText(
        'план вырос: +photo-gate-handoff (было 95 % → стало 80 %)',
      );
      await noScrollNoAxe(page);
      await page.goto(cli.url + '?lang=ru#/tasks');
      await expect(
        page.getByTestId('task-import-csv').getByTestId('task-attempt-reviews'),
      ).toHaveText(
        'Ревью: попытка 1 — отклонено (3 находки), попытка 2 — отклонено (1 находка, 1 заметка)',
      );
      await expect(
        page.getByTestId('task-add-greeting').getByTestId('task-reopened'),
      ).toContainText('переоткрыта ведущим: доработка после приёмки');
      await noScrollNoAxe(page);
      await page.goto(cli.url + '?lang=ru#/decisions');
      await expect(page.getByTestId('decision-diagnosis:0123456789abcdef')).toContainText(
        'разбор ведущего по D1',
      );
      await noScrollNoAxe(page);
    } finally {
      await cli.stop();
      const rmDir: string = dir;
      if (rmDir.startsWith(join(tmpdir(), 'hui-e2e-a10-')))
        rmSync(rmDir, { recursive: true, force: true });
    }
  });

async function noScrollNoAxe(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'horizontal scroll').toBeLessThanOrEqual(0);
  const axe = await axeOf(page).analyze();
  const serious = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' ')}`)).toEqual([]);
}

for (const scheme of ['light', 'dark'] as const)
  test(`the first Tab shows the skip link above the sticky menu (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await open(page, '#/tasks');
    await page.keyboard.press('Tab');
    const skip = page.locator('a.app-skip');
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    // Nothing covers it: the topmost element at its centre is the link itself.
    const onTop = await skip.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return hit === el || el.contains(hit);
    });
    expect(onTop).toBe(true);
    // Enter moves focus to the content.
    await page.keyboard.press('Enter');
    await expect(page.locator('#hui-main')).toBeFocused();
    const axe = await axeOf(page).analyze();
    expect(
      axe.violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => v.id),
    ).toEqual([]);
  });
