// Panel language. Russian is first-class; English is the fallback. Every
// visible word comes from the dictionary (dict.ts). Pure: no node:*, no
// React. Sentences are phrasing over the view's own counts; no number is
// derived here.

import { instantMs } from './compat.ts';
import { dict, type Lang } from './dict.ts';
import type { TargetView } from './view.ts';

export { ruPlural } from './dict.ts';
export type { Lang } from './dict.ts';

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
  const h = dict(lang).header;
  const now: string[] = [];
  if (c.paused) now.push(h.paused);
  if (c.running) now.push(h.running(c.running));
  if (c.queued) now.push(h.queued(c.queued));
  if (c.stopped) now.push(h.stopped(c.stopped));
  const asks: string[] = [];
  if (c.questions) asks.push(h.answer(c.questions));
  if (c.decisions) asks.push(h.decide(c.decisions));
  let from: string;
  if (asks.length) from = asks.join(h.and) + (c.incomplete ? h.maybeMore : '');
  else if (c.waitingOperator) from = h.waiting(c.waitingOperator);
  else if (c.incomplete) from = h.unknownClipped;
  else from = h.nothing;
  return (now.length ? h.now(now.join(', ')) : h.idle) + h.fromYou(from);
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
  const ms = instantMs(iso);
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

/**
 * When an event happened, for lists that span more than a day (the activity
 * feed, the remote check time): `HH:MM` on the viewer's day of `nowMs`,
 * «вчера HH:MM» / `yesterday HH:MM` on the calendar day before it, else
 * `DD.MM.YYYY HH:MM`. Without `nowMs` the date is always shown, so an old
 * event never reads as today's. `undefined` for an invalid instant or zone.
 */
export function formatWhen(
  iso: string,
  lang: Lang,
  timeZone?: string,
  nowMs?: number,
): string | undefined {
  const ms = instantMs(iso);
  if (Number.isNaN(ms)) return undefined;
  const at = parts(ms, timeZone);
  if (!at) return undefined;
  const time = `${at.hour}:${at.minute}`;
  const dated = `${at.day}.${at.month}.${at.year} ${time}`;
  if (nowMs === undefined || !Number.isFinite(nowMs)) return dated;
  const today = parts(nowMs, timeZone);
  if (!today) return dated;
  if (today.year === at.year && today.month === at.month && today.day === at.day) return time;
  // The calendar day before the viewer's today, by date arithmetic (no DST guess).
  const y = new Date(Date.UTC(Number(today.year), Number(today.month) - 1, Number(today.day) - 1));
  const two = (n: number) => String(n).padStart(2, '0');
  if (
    String(y.getUTCFullYear()).padStart(4, '0') === at.year &&
    two(y.getUTCMonth() + 1) === at.month &&
    two(y.getUTCDate()) === at.day
  )
    return dict(lang).yesterday(time);
  return dated;
}

/** Footer: «Данные harness на HH:MM; панель ничего не меняет». */
export function footerSentence(
  generatedAt: string,
  lang: Lang,
  timeZone?: string,
  nowMs?: number,
): string {
  return dict(lang).footer(formatClock(generatedAt, timeZone, nowMs));
}

/**
 * Where an accepted result is (`works[].target`), in one sentence. The remote
 * state is read by the harness from the local remote-tracking ref without a
 * fetch. From view revision 2 (harness alpha.57) a definite state carries the
 * harness `line` («в удалённой ветке origin/main ещё нет»), shown as written
 * after «Принято локально»; before, the sentence says "as of the last git
 * update on this machine". `unknown` or any state this build does not know
 * reads as unknown with the harness `reason`, never as "not pushed" or
 * "pushed", whatever its line says.
 */
export function targetSentence(target: Pick<TargetView, 'remote'>, lang: Lang): string {
  const { state, reason, line } = target.remote;
  const t = dict(lang).target;
  if (state === 'pushed' || state === 'not-pushed') {
    const l = typeof line === 'string' ? line.trim() : '';
    if (!l) return state === 'pushed' ? t.pushed : t.notPushed;
    // The harness not-pushed line already starts with «принято локально»
    // (in the view language, which may differ from the panel's): say it once.
    const head = [dict('ru').target.acceptedLocally, dict('en').target.acceptedLocally].find((h) =>
      l.toLowerCase().startsWith(h.toLowerCase()),
    );
    const body = head ? l.slice(head.length).replace(/^[\s;,:]+/, '') : l;
    const text = t.withLine(body || l);
    return /[.!?]$/.test(text) ? text : text + '.';
  }
  return t.unknown(typeof reason === 'string' && reason.trim() ? `: ${reason.trim()}` : '');
}

/**
 * How fresh the remote state is (revision 2): the harness compared the
 * accepted commit with this machine's copy of the remote branch, and
 * `checkedAt` is when git last updated that copy. `undefined` (say nothing)
 * for a document without a harness line, which already says "as of the last
 * git update", and for an unknown state without a check time.
 */
export function remoteFreshness(
  target: Pick<TargetView, 'remote'>,
  lang: Lang,
  timeZone?: string,
  nowMs?: number,
): string | undefined {
  const { state, checkedAt, line } = target.remote;
  const t = dict(lang).target;
  const when =
    typeof checkedAt === 'string' ? formatWhen(checkedAt, lang, timeZone, nowMs) : undefined;
  if (when) return t.checkedAt(when);
  const definite = state === 'pushed' || state === 'not-pushed';
  if (definite && typeof line === 'string' && line.trim()) return t.checkedAtUnknown;
  return undefined;
}
