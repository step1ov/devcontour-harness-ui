// View revision 7 (harness 0.1.0-alpha.67) in the browser: the setup
// progress block on the home while there are no works (light and dark, 1280
// and 390 px, axe), and on a revision 7 overview an infrastructure work's
// badge and the queue line «запустите harness run» as the lead's next move.
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

test('setup progress on the home: steps, time, budget exceeded; light and dark', async ({
  page,
}) => {
  const cli = await startCli('fixtures/ru/view.setup-progress.json');
  try {
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(cli.url + '?lang=ru#/');
      const note = page.getByTestId('stage-setup');
      await expect(note).toContainText('Идёт настройка harness');
      await expect(note).toContainText('Задач пока нет');
      const block = note.getByTestId('setup-progress');
      await expect(block).toBeVisible();
      await expect(block.getByTestId('setup-progress-line')).toHaveText(
        'Настройка: готово 3 из 5 шагов · идёт 42 мин (бюджет 30 мин — превышен); не прошло: проба исполнителя; новый код инфраструктуры — работами infra в плане, а не в настройке',
      );
      await expect(block.getByTestId('setup-budget')).toHaveText('бюджет 30 мин');
      await expect(block.getByTestId('setup-over-budget')).toContainText(
        'Превышен бюджет настройки',
      );
      // The viewer's clock is past the fixture: the time goes on, never below 42 min.
      await expect(block.getByTestId('setup-progress-time')).toContainText('идёт');
      const steps = block.getByTestId('setup-step');
      await expect(steps).toHaveCount(7);
      await expect(steps.nth(4)).toHaveAttribute('data-state', 'failed');
      await expect(steps.nth(4)).toContainText('проба исполнителя: не прошло, 40 с');
      await noScrollNoAxe(page);
    }
    // Another screen keeps the line and the time, without the step list.
    await page.goto(cli.url + '?lang=ru#/tasks');
    await expect(page.getByTestId('setup-progress-line')).toBeVisible();
    await expect(page.getByTestId('setup-step')).toHaveCount(0);
  } finally {
    await cli.stop();
  }
});

test('revision 7 overview: the infra badge and the lead’s next move «запустите harness run»', async ({
  page,
}) => {
  const base = join(tmpdir(), 'hui-e2e-r7-');
  const dir = mkdtempSync(base);
  const file = join(dir, 'view.json');
  const v = JSON.parse(readFileSync('fixtures/ru/view.sample.json', 'utf8'));
  v.viewRevision = 7;
  v.works.find((w: { id: string }) => w.id === 'locale-format').kind = 'infra';
  const line =
    'Очередь стоит — никто не запущен: запустите harness run: готово 2 задачи, вопрос блокирует только export-csv (ведущий).';
  v.progress.queue = { paused: false, runner: 'not-running', restartBy: 'lead', line };
  writeFileSync(file, JSON.stringify(v));
  const cli = await startCli(file);
  try {
    await page.goto(cli.url + '?lang=ru#/');
    const main = page.locator('main');
    await expect(main.getByTestId('queue-state')).toHaveText('Очередь стоит');
    const move = main.getByTestId('lead-next-move');
    await expect(move).toBeVisible();
    await expect(move).toContainText('Следующий ход ведущего');
    await expect(move).toContainText(line + ' — запускает: ведущий');
    await expect(main.getByTestId('plan').getByTestId('infra-badge')).toHaveText('инфраструктура');
    await noScrollNoAxe(page);
    await page.goto(cli.url + '?lang=ru#/tasks');
    await expect(page.getByTestId('task-locale-format').getByTestId('infra-badge')).toHaveText(
      'инфраструктура',
    );
    await expect(page.getByTestId('infra-badge')).toHaveCount(1);
  } finally {
    await cli.stop();
    if (!dir.startsWith(base)) throw new Error('refusing rm');
    rmSync(dir, { recursive: true, force: true });
  }
});
