// ui 0.1.0-alpha.12 in the browser (harness 0.1.0-alpha.70, view revision
// 10): «Расход» on the home screen with the lower bound said, the docs step
// under the release ring, and on the task card the second review pass (with
// its tooltip), the writer's proposals and the failure-cause link — in both
// themes, at 1280 and 390 px (playwright projects), with axe and no
// horizontal scroll. The view is the one of tests/revision10.ts.
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { revision10View } from '../tests/revision10.ts';

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

async function withView<T>(v: unknown, run: (url: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'hui-e2e-a12-'));
  const file = join(dir, 'view.json');
  writeFileSync(file, JSON.stringify(v));
  const cli = await startCli(file);
  try {
    return await run(cli.url);
  } finally {
    await cli.stop();
    const rmDir: string = dir;
    if (rmDir.startsWith(join(tmpdir(), 'hui-e2e-a12-')))
      rmSync(rmDir, { recursive: true, force: true });
  }
}

for (const scheme of ['light', 'dark'] as const)
  test(`revision 10: spend, docs step, second pass, proposals, failure link (${scheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.clock.setFixedTime(new Date('2026-11-19T12:05:00Z'));
    await withView(revision10View(), async (url) => {
      await page.goto(url + '?lang=ru#/');
      const costs = page.getByTestId('costs');
      await expect(costs).toBeVisible();
      await expect(costs.getByTestId('costs-total')).toContainText('не меньше $3.75');
      await expect(costs.getByTestId('costs-release')).toContainText('не меньше $1.00');
      await expect(costs.getByTestId('costs-lower')).toHaveText(
        'без цены: 1 вызов — суммы не меньше показанных',
      );
      await expect(costs.getByTestId('costs-by-role')).toContainText('исполнитель');
      await expect(costs.getByTestId('costs-by-model')).toContainText('gpt-x (openai)');
      await costs.getByTestId('costs-by-work').locator('summary').click();
      await expect(costs.getByTestId('costs-by-work')).toContainText('попытка 2 — цена неизвестна');
      const docs = page.getByTestId('release-docs');
      await expect(docs.getByTestId('release-docs-state')).toHaveText('нет работы документации');
      await expect(docs.getByTestId('release-docs-mode')).toHaveText('совет: выпуск не держит');
      await noScrollNoAxe(page);

      await page.goto(url + '?lang=ru#/tasks');
      const cardEl = page.getByTestId('task-locale-format');
      const pass = cardEl.getByTestId('second-pass').first();
      await expect(pass).toHaveText('второй проход: снято 1, отказ снят');
      // The tooltip names the mode on hover and on keyboard focus.
      await pass.hover();
      await expect(
        cardEl.locator('.hui-tooltip-root:has([data-testid="second-pass"]) .hui-tooltip').first(),
      ).toBeVisible();
      await expect(cardEl.getByTestId('second-pass-refuted')).toContainText(
        '«ложная» — обработано в строке 3',
      );
      await expect(cardEl.getByTestId('proposal')).toHaveCount(2);
      await expect(cardEl.getByTestId('proposal-status').first()).toHaveText('принято');
      await expect(cardEl.getByTestId('proposal-decision')).toContainText(
        'Вносим в следующий план',
      );
      await expect(cardEl.getByTestId('proposals-who')).toContainText('harness proposal');
      await expect(cardEl.locator('[data-testid="proposals"] button')).toHaveCount(0);
      const link = cardEl.getByTestId('failure-reference');
      await expect(link).toHaveText('что значит этот отказ');
      await expect(link).toHaveAttribute(
        'href',
        /\/blob\/v0\.1\.0-alpha\.70\/docs\/failure-causes\.md#kind-gate$/,
      );
      await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      await noScrollNoAxe(page);
    });
  });

test('the demo (an older view) has no spend block, docs step, proposals or second pass', async ({
  page,
}) => {
  await page.goto('./?lang=ru#/');
  await expect(page.locator('main .hui')).toBeVisible();
  await expect(page.getByTestId('forecast')).toBeVisible();
  await expect(page.getByTestId('costs')).toHaveCount(0);
  await expect(page.getByTestId('release-docs')).toHaveCount(0);
  await page.goto('./?lang=ru#/tasks');
  await expect(page.getByTestId('task-cards')).toBeVisible();
  await expect(page.getByTestId('proposals')).toHaveCount(0);
  await expect(page.getByTestId('second-pass')).toHaveCount(0);
  await expect(page.getByTestId('failure-reference')).toHaveCount(0);
});
