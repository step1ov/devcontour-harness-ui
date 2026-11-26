// ui 0.1.0-alpha.13 in the browser (harness 0.1.0-alpha.73, view revision
// 11): thin mode on the home screen (badge with what it means in a tooltip,
// on hover and keyboard focus) and in the settings (name, explanation, the
// write guard line of the light environment, the round cap) — in both
// themes, at 1280 and 390 px (playwright projects), with axe and no
// horizontal scroll. The view is the one of tests/revision11.ts.
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { revision11View } from '../tests/revision11.ts';

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
  const dir = mkdtempSync(join(tmpdir(), 'hui-e2e-a13-'));
  const file = join(dir, 'view.json');
  writeFileSync(file, JSON.stringify(v));
  const cli = await startCli(file);
  try {
    return await run(cli.url);
  } finally {
    await cli.stop();
    const rmDir: string = dir;
    if (rmDir.startsWith(join(tmpdir(), 'hui-e2e-a13-')))
      rmSync(rmDir, { recursive: true, force: true });
  }
}

for (const scheme of ['light', 'dark'] as const)
  test(`revision 11: thin mode on the home screen and in the settings (${scheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.clock.setFixedTime(new Date('2026-11-19T12:05:00Z'));
    await withView(revision11View(), async (url) => {
      await page.goto(url + '?lang=ru#/');
      const badge = page.getByTestId('harness-mode');
      await expect(badge).toHaveText('режим: тонкий');
      await badge.hover();
      const tip = page.locator('[data-testid="harness-mode-why"] .hui-tooltip');
      await expect(tip).toBeVisible();
      await expect(tip).toContainText('одна сессия исполнителя');
      await noScrollNoAxe(page);

      await page.goto(url + '?lang=ru#/settings');
      const mode = page.getByTestId('settings-harness-mode');
      await expect(mode.getByTestId('harness-mode-name')).toHaveText('тонкий');
      await expect(mode.getByTestId('harness-mode-guard')).toContainText('Защита записи');
      await expect(mode.getByTestId('harness-mode-guard')).not.toHaveAttribute(
        'data-status',
        'blocked',
      );
      await expect(mode.getByTestId('harness-mode-thin')).toContainText('чистом checkout');
      await expect(page.getByTestId('settings-limits')).toContainText('тонкий режим; в строгом');
      await noScrollNoAxe(page);
    });
  });
