// Panel language. Russian is first-class; English is the fallback. The
// scaffold localizes the Overview header sentence and footer only; the
// remaining labels follow in slice S2 (docs/design.md, "Language").
// Pure: no node:*, no React. Sentences are phrasing over the view's own
// counts; no number is derived here.

import type { TargetView } from './view.ts';

export type Lang = 'ru' | 'en';

/** `ru` for a Russian locale tag (`ru`, `ru-RU`, `ru_RU.UTF-8`), else `en`. */
export function langOf(locale: string | undefined | null): Lang {
  return typeof locale === 'string' && /^ru(?:[-_.]|$)/i.test(locale.trim()) ? 'ru' : 'en';
}

/**
 * Panel language from the address parameter and the browser locales: an
 * explicit `ru` or `en` parameter wins; an empty or unknown parameter falls
 * back to the first browser locale, never silently to English.
 */
export function pickLang(param: string | null | undefined, locales: readonly string[]): Lang {
  const p = typeof param === 'string' ? param.trim().toLowerCase() : '';
  if (p === 'ru' || p === 'en') return p;
  return langOf(locales.find((l) => typeof l === 'string' && l.trim() !== ''));
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
  /** `progress.waitingOperator`: works waiting for the operator, over all works. */
  waitingOperator: number;
  /** The questions or escalations list was clipped (`truncated`), so the counts are a floor. */
  incomplete: boolean;
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
    let from: string;
    if (asks.length)
      from = asks.join(' и ') + (c.incomplete ? ' и, возможно, ещё (список обрезан)' : '');
    else if (c.waitingOperator)
      from = `${c.waitingOperator} ${ruPlural(c.waitingOperator, ['работа ждёт', 'работы ждут', 'работ ждут'])} вашего действия`;
    else if (c.incomplete) from = 'неизвестно — список обрезан';
    else from = 'ничего не нужно';
    return (
      (now.length ? `Сейчас: ${now.join(', ')}.` : 'Сейчас ничего не выполняется.') +
      ' От вас: ' +
      from +
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
  let from: string;
  if (asks.length)
    from = asks.join(' and ') + (c.incomplete ? ' and possibly more (the list is clipped)' : '');
  else if (c.waitingOperator)
    from = `${c.waitingOperator} work order${c.waitingOperator === 1 ? ' waits' : 's wait'} for your action`;
  else if (c.incomplete) from = 'unknown — the list is clipped';
  else from = 'nothing is needed';
  return (
    (now.length ? `Now: ${now.join(', ')}.` : 'Nothing is running now.') +
    ' From you: ' +
    from +
    '.'
  );
}

function parts(ms: number, timeZone?: string): Record<string, string> | undefined {
  try {
    const out: Record<string, string> = {};
    for (const p of new Intl.DateTimeFormat('en-GB', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      ...(timeZone ? { timeZone } : {}),
    }).formatToParts(new Date(ms)))
      out[p.type] = p.value;
    return out;
  } catch {
    // Invalid instant or time zone: the caller shows "unknown", never a guess.
    return undefined;
  }
}

/**
 * `HH:MM` of an ISO instant in the given time zone (the viewer's by default);
 * `DD.MM.YYYY HH:MM` when `nowMs` falls on another day, so that stale data
 * never reads as fresh. `undefined` for an invalid instant or time zone.
 */
export function formatClock(iso: string, timeZone?: string, nowMs?: number): string | undefined {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return undefined;
  const at = parts(ms, timeZone);
  if (!at) return undefined;
  const time = `${at.hour}:${at.minute}`;
  if (nowMs === undefined || !Number.isFinite(nowMs)) return time;
  const today = parts(nowMs, timeZone);
  const sameDay =
    today && today.year === at.year && today.month === at.month && today.day === at.day;
  return sameDay ? time : `${at.day}.${at.month}.${at.year} ${time}`;
}

/** Footer: «Данные harness на HH:MM; панель ничего не меняет». */
export function footerSentence(
  generatedAt: string,
  lang: Lang,
  timeZone?: string,
  nowMs?: number,
): string {
  const at = formatClock(generatedAt, timeZone, nowMs);
  if (lang === 'ru')
    return `Данные harness на ${at ?? 'неизвестное время'}; панель ничего не меняет.`;
  return `Harness data as of ${at ?? 'an unknown time'}; the panel changes nothing.`;
}

/**
 * Where an accepted result is (`works[].target`), in one sentence. The remote
 * state is read by the harness from the local remote-tracking ref without a
 * fetch, so the sentence says "as of the last git update on this machine".
 * `unknown` or any state this build does not know reads as unknown, never as
 * "not pushed" or "pushed"; the harness `reason` follows as is.
 */
export function targetSentence(target: Pick<TargetView, 'remote'>, lang: Lang): string {
  const { state, reason } = target.remote;
  const why = typeof reason === 'string' && reason.trim() ? `: ${reason.trim()}` : '';
  if (lang === 'ru') {
    const asOf = ' (по последнему обновлению git на этой машине)';
    if (state === 'pushed') return 'Принято локально; в удалённом репозитории — да' + asOf + '.';
    if (state === 'not-pushed')
      return 'Принято локально; в удалённом репозитории — ещё нет' + asOf + '.';
    return 'Принято локально; в удалённом репозитории — неизвестно' + why + '.';
  }
  const asOf = ' (as of the last git update on this machine)';
  if (state === 'pushed') return 'Accepted locally; on the remote' + asOf + '.';
  if (state === 'not-pushed') return 'Accepted locally; not on the remote yet' + asOf + '.';
  return 'Accepted locally; remote state unknown' + why + '.';
}
