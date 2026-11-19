// Panel language. Russian is first-class; English is the fallback. The
// scaffold localizes the Overview header sentence and footer only; the
// remaining labels follow in slice S2 (docs/design.md, "Language").
// Pure: no node:*, no React. Sentences are phrasing over the view's own
// counts; no number is derived here.

export type Lang = 'ru' | 'en';

/** `ru` for a Russian locale tag (`ru`, `ru-RU`, `ru_RU.UTF-8`), else `en`. */
export function langOf(locale: string | undefined | null): Lang {
  return typeof locale === 'string' && /^ru(?:[-_.]|$)/i.test(locale.trim()) ? 'ru' : 'en';
}

/** Russian plural form: 1 вопрос, 2 вопроса, 5 вопросов. */
export function ruPlural(n: number, forms: readonly [string, string, string]): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return forms[0];
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return forms[1];
  return forms[2];
}

export interface HeaderCounts {
  running: number;
  queued: number;
  stopped: number;
  paused: boolean;
  /** Questions in `awaiting-answer`. */
  questions: number;
  /** Escalations whose actor is the operator. */
  decisions: number;
}

/** The Overview header sentence: «Сейчас… От вас: …». */
export function headerSentence(c: HeaderCounts, lang: Lang): string {
  if (lang === 'ru') {
    const now: string[] = [];
    if (c.paused) now.push('очередь на паузе');
    if (c.running) now.push(`в работе ${c.running}`);
    if (c.queued) now.push(`в очереди ${c.queued}`);
    if (c.stopped) now.push(`остановлено ${c.stopped}`);
    const asks: string[] = [];
    if (c.questions)
      asks.push(
        `ответить на ${c.questions} ${ruPlural(c.questions, ['вопрос', 'вопроса', 'вопросов'])}`,
      );
    if (c.decisions)
      asks.push(
        `принять ${c.decisions} ${ruPlural(c.decisions, ['решение', 'решения', 'решений'])}`,
      );
    return (
      (now.length ? `Сейчас: ${now.join(', ')}.` : 'Сейчас ничего не выполняется.') +
      ' От вас: ' +
      (asks.length ? asks.join(' и ') : 'ничего не нужно') +
      '.'
    );
  }
  const now: string[] = [];
  if (c.paused) now.push('the queue is paused');
  if (c.running) now.push(`${c.running} working`);
  if (c.queued) now.push(`${c.queued} waiting in the queue`);
  if (c.stopped) now.push(`${c.stopped} stopped`);
  const asks: string[] = [];
  if (c.questions) asks.push(`answer ${c.questions} question${c.questions === 1 ? '' : 's'}`);
  if (c.decisions) asks.push(`take ${c.decisions} decision${c.decisions === 1 ? '' : 's'}`);
  return (
    (now.length ? `Now: ${now.join(', ')}.` : 'Nothing is running now.') +
    ' From you: ' +
    (asks.length ? asks.join(' and ') : 'nothing is needed') +
    '.'
  );
}

/** `HH:MM` of an ISO instant in the given time zone (the viewer's by default). */
export function formatClock(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(iso));
}

/** Footer: «Данные harness на HH:MM; панель ничего не меняет». */
export function footerSentence(generatedAt: string, lang: Lang, timeZone?: string): string {
  const at = formatClock(generatedAt, timeZone);
  return lang === 'ru'
    ? `Данные harness на ${at}; панель ничего не меняет.`
    : `Harness data as of ${at}; the panel changes nothing.`;
}
