// The Overview of a stopped run in the browser: a work out of attempts
// behind a stale plan approval, and a work that waits for it
// (fixtures/ru/view.stopped.json). The header, «Нужно от вас» and the other
// waits must agree and say whose turn it is, at 1280 and 390 px.
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { spawn } from 'node:child_process';

const axeOf = (page: Page) => new AxeBuilder({ page: page as never });

let url = '';
let stop: () => Promise<void> = async () => {};

test.beforeAll(async () => {
  const child = spawn(
    process.execPath,
    ['dist/lib/cli.js', '--lang', 'ru', '--view', 'fixtures/ru/view.stopped.json'],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  url = await new Promise<string>((ok, fail) => {
    let out = '';
    child.stdout.on('data', (c) => {
      out += c;
      if (out.includes('\n')) ok(JSON.parse(out.split('\n')[0]!).url);
    });
    child.once('exit', (code) => fail(new Error(`cli exited ${code}`)));
  });
  stop = () =>
    new Promise<void>((ok) => {
      child.once('exit', () => ok());
      child.kill('SIGTERM');
    });
});

test.afterAll(() => stop());

test('stopped run: one decision for you after the lead, the waits say whose turn', async ({
  page,
}) => {
  await page.goto(url.replace(/\/?$/, '/') + '?lang=ru#/');
  const main = page.locator('main');
  // No controller and nothing running: the queue stands, it does not «go» (F-X).
  await expect(main.getByTestId('queue-state')).toHaveText('Очередь стоит');
  await expect(main.getByTestId('story')).toHaveText(
    'Сейчас ничего не выполняется: работа ждёт вашего ответа или решения.',
  );
  await expect(main.getByTestId('problems')).toContainText('очередь стоит: harness не запущен');
  await expect(main.getByTestId('sentence')).toHaveText(
    'Сейчас: остановлено 1. От вас: принять 1 решение (после ведущего).',
  );
  const needs = main.getByTestId('needs-you');
  await expect(needs.getByRole('heading', { name: 'Нужно от вас (1)' })).toBeVisible();
  await expect(needs.locator('[data-kind]')).toHaveCount(1);
  await expect(needs).toContainText('Сбросить попытки — WEB-1');
  await expect(needs).toContainText(
    'отказов 4 (работа не доделана 2, время вышло 1, нужен ответ 1)',
  );
  await expect(needs).toContainText(
    'Сначала ведущий: политика изменилась после согласования — нужно согласовать план заново. Потом — вы',
  );
  await expect(needs).not.toContainText('incomplete');
  const others = main.getByTestId('decisions');
  await expect(others.getByRole('heading', { name: 'Остальные ожидания (2)' })).toBeVisible();
  await expect(others.getByTestId('by-lead')).toContainText('WEB-1, WEB-2');
  await expect(others.getByTestId('by-dependency')).toContainText(
    'WEB-2 ждёт WEB-1 (по ней дальше действует: ведущий, затем вы)',
  );
  await expect(main).not.toContainText('Нужен ваш ответ');
  await expect(main).not.toContainText('(0)');
  // The codes are one click away, not in the sentence.
  const details = needs.getByTestId('step-details');
  await expect(details).not.toHaveAttribute('open');
  const code = details.locator('code', { hasText: 'ATTEMPTS_EXHAUSTED' }).first();
  await expect(code).toBeHidden();
  await details.locator('summary').click();
  await expect(details).toHaveAttribute('open', '');
  await expect(code).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'horizontal scroll').toBeLessThanOrEqual(0);
  const axe = await axeOf(page).analyze();
  const serious = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' ')}`)).toEqual([]);
});
