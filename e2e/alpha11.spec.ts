// ui 0.1.0-alpha.11 in the browser (harness 0.1.0-alpha.69, view revision 9):
// the harness mode in the header and the settings, «Ревью выпуска» on the
// home screen with the release figure below 100 until approved, plan review
// rounds without a limit and the release review subject on the tasks screen,
// and the cause of a held gate — in both themes, at 1280 and 390 px
// (playwright projects), with axe and no horizontal scroll.
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const axeOf = (page: Page) => new AxeBuilder({ page: page as never });

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

async function noScrollNoAxe(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'horizontal scroll').toBeLessThanOrEqual(0);
  const axe = await axeOf(page).analyze();
  const serious = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' ')}`)).toEqual([]);
}

/** The Russian demo view as revision 9; `review` overrides the release review. */
function revision9(review: Record<string, unknown> = {}) {
  const v = JSON.parse(readFileSync('fixtures/ru/view.sample.json', 'utf8'));
  v.viewRevision = 9;
  v.settings.harnessMode = { mode: 'light', default: true, writeGuard: true };
  v.settings.thresholds.reviewRoundsUnlimited = true;
  v.reviews[0].rounds = { used: 7, max: null };
  v.forecast.progress.percent = 99;
  v.forecast.progress.release.state = 'code-accepted';
  v.forecast.progress.release.line = 'код принят, ведущий завершает выпуск';
  v.forecast.progress.release.review = {
    required: true,
    status: 'findings',
    round: 2,
    open: 3,
    blocking: 1,
    base: '1a2b3c4',
    baseSource: 'register',
    line: 'приёмка выпуска: блокирующих 1 из открытых 3 (раунд 2) — исправить работами (обязательна: release done ждёт)',
    ...review,
  };
  v.reviews.push({
    kind: 'release',
    subject: 'release',
    approved: false,
    rounds: { used: 2, max: null },
    open: { blocking: 1, notes: 2 },
    accepted: 0,
    reviewer: { runtime: 'codex' },
    spend: { calls: 2, usd: { value: 0.4, bound: 'exact' } },
    findings: [{ id: 'R1', severity: 'high', status: 'open', rounds: 1 }],
    line: 'выпуск: замечаний 3, блокирующих 1',
  });
  v.resources.gates.held[0].cause = 'gate-definition';
  return v;
}

async function withView<T>(v: unknown, run: (url: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'hui-e2e-a11-'));
  const file = join(dir, 'view.json');
  writeFileSync(file, JSON.stringify(v));
  const cli = await startCli(file);
  try {
    return await run(cli.url);
  } finally {
    await cli.stop();
    const rmDir: string = dir;
    if (rmDir.startsWith(join(tmpdir(), 'hui-e2e-a11-')))
      rmSync(rmDir, { recursive: true, force: true });
  }
}

for (const scheme of ['light', 'dark'] as const)
  test(`revision 9: mode, release review, unlimited plan rounds, held gate cause (${scheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.clock.setFixedTime(new Date('2026-11-19T12:05:00Z'));
    await withView(revision9(), async (url) => {
      await page.goto(url + '?lang=ru#/');
      await expect(page.getByTestId('harness-mode')).toHaveText('режим: облегчённый');
      const block = page.getByTestId('release-review');
      await expect(block).toBeVisible();
      await expect(block.getByTestId('release-review-state')).toHaveText(
        'замечания 3 (блокирующих 1)',
      );
      await expect(block.getByTestId('release-review-required')).toHaveText(
        'обязательно: release done ждёт одобрения',
      );
      await expect(block.getByTestId('release-review-capped')).toHaveText(
        'Выпуск не покажет 100 %, пока ревью выпуска не одобрено.',
      );
      await expect(block.getByTestId('release-review-line')).toContainText(
        'блокирующих 1 из открытых 3',
      );
      // The release figure stays below 100 while the review is not approved.
      const ring = page.getByTestId('ring-release').getByRole('progressbar');
      await expect(ring).toHaveAttribute('aria-valuenow', '99');
      // «Что задействовано»: the cause of the held gate.
      await page.getByTestId('resources-more').locator('summary').click();
      await expect(page.getByTestId('resources-held-cause')).toHaveText(
        '— проверка не назвала причину — исправить команду проверки, ход ведущего',
      );
      await noScrollNoAxe(page);

      await page.goto(url + '?lang=ru#/tasks');
      await expect(page.getByTestId('task-import-csv').getByTestId('task-gate-cause')).toHaveText(
        'проверка не назвала причину — исправить команду проверки, ход ведущего',
      );
      const plan = page.getByTestId('review-plan-g1');
      await expect(plan.getByTestId('review-rounds')).toContainText('раундов 7, без предела');
      await expect(plan.getByTestId('rounds-unlimited')).toContainText(
        'облегчённый режим; бюджет — время и стоимость выпуска',
      );
      await expect(page.getByTestId('review-release-release')).toContainText('выпуск');
      await expect(
        page.getByTestId('review-release-release').getByTestId('review-rounds'),
      ).toHaveText('раундов 2, без предела');
      await noScrollNoAxe(page);

      await page.goto(url + '?lang=ru#/settings');
      const mode = page.getByTestId('settings-harness-mode');
      await expect(mode.getByTestId('harness-mode-name')).toHaveText('облегчённый');
      await expect(mode.getByTestId('harness-mode-guard')).toContainText(
        'пишут только в своё дерево попытки',
      );
      await expect(page.getByTestId('settings-limits')).toContainText(
        'без предела (облегчённый режим; в строгом — 6)',
      );
      await noScrollNoAxe(page);
    });
  });

test('an approved release review reaches 100 % with release done; the badge is green', async ({
  page,
}) => {
  const v = revision9({
    status: 'approved',
    open: 0,
    blocking: 0,
    line: 'приёмка выпуска одобрена (раунд 3)',
    round: 3,
  });
  v.forecast.progress.percent = 100;
  v.forecast.progress.release = {
    ...v.forecast.progress.release,
    state: 'done',
    doneAt: '2026-11-19T12:00:00.000Z',
    line: 'выпуск завершён',
  };
  await withView(v, async (url) => {
    await page.goto(url + '?lang=ru#/');
    await expect(page.getByTestId('release-review-state')).toHaveText('одобрено');
    await expect(page.getByTestId('release-review-state')).toHaveClass(/hui:text-ok/);
    await expect(page.getByTestId('release-review-required')).toHaveCount(0);
    await expect(page.getByTestId('ring-release').getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '100',
    );
    await noScrollNoAxe(page);
  });
});

test('the demo (an older view) has no mode badge and no release review block', async ({ page }) => {
  await page.goto('./?lang=ru#/');
  await expect(page.locator('main .hui')).toBeVisible();
  await expect(page.getByTestId('forecast')).toBeVisible();
  await expect(page.getByTestId('harness-mode')).toHaveCount(0);
  await expect(page.getByTestId('release-review')).toHaveCount(0);
});

test('review fixes: a stale release approval and a capped 100 % in the browser', async ({
  page,
}) => {
  const v = revision9({ status: 'stale', open: 0, blocking: 0 });
  const rel = v.reviews.find((x: { kind: string }) => x.kind === 'release');
  rel.approved = true;
  rel.open = { blocking: 0, notes: 0 };
  v.forecast.progress.percent = 100;
  v.forecast.progress.line = 'готово 100 %, осталось задач: 0 из 6';
  await withView(v, async (url) => {
    await page.goto(url + '?lang=ru#/');
    await expect(page.getByTestId('release-line')).toHaveText(
      'готово ~99 % — выпуск ждёт одобрения ревью выпуска',
    );
    const ring = page.getByTestId('ring-release').getByRole('progressbar');
    await expect(ring).toHaveAttribute('aria-valuenow', '99');
    await expect(ring).toHaveAttribute(
      'aria-valuetext',
      'До релиза: готово ~99 % — выпуск ждёт одобрения ревью выпуска',
    );
    await noScrollNoAxe(page);
    await page.goto(url + '?lang=ru#/tasks');
    await expect(
      page.getByTestId('review-release-release').getByTestId('review-verdict'),
    ).toHaveText('одобрено ранее · устарело');
    await noScrollNoAxe(page);
  });
});
