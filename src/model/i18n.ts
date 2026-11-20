// Panel language. Russian is first-class; English is the fallback. Every
// visible word comes from the dictionary (dict.ts). Pure: no node:*, no
// React. Sentences are phrasing over the view's own counts; no number is
// derived here.

import { instantMs, isInstant } from './compat.ts';
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
  if (!isInstant(iso)) return undefined;
  const at = parts(instantMs(iso), timeZone);
  if (!at) return undefined;
  const time = `${at.hour}:${at.minute}`;
  const dated = `${at.day}.${at.month}.${at.year!.padStart(4, '0')} ${time}`;
  if (nowMs === undefined || !Number.isFinite(nowMs)) return dated;
  const today = parts(nowMs, timeZone);
  if (!today) return dated;
  const day = (p: Record<string, string>) => [Number(p.year), Number(p.month), Number(p.day)];
  const [ay, am, ad] = day(at);
  const [ty, tm, td] = day(today);
  if (ay === ty && am === tm && ad === td) return time;
  // The calendar day before the viewer's today, by date arithmetic (no 24 h
  // guess across DST); setUTCFullYear keeps years 0-99 as they are.
  const y = new Date(0);
  y.setUTCFullYear(ty!, tm! - 1, td! - 1);
  if (y.getUTCFullYear() === ay && y.getUTCMonth() + 1 === am && y.getUTCDate() === ad)
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
 * state is read by the harness from this machine's copy of the remote branch
 * (the remote-tracking ref) without a fetch. `pushed` and `not-pushed` are
 * said from the state itself, with the branch from `trackingRef`, in the
 * words of the harness line («принято локально; в удалённой ветке
 * origin/main ещё нет»). The harness `line` is not quoted: it is clipped to
 * 200 characters, and a long branch name can cut off the state word («ещё
 * нет»), so the panel would show a negative state as an affirmative one.
 * `unknown` or any state this build does not know reads as unknown with the
 * harness `reason`, never as "not pushed" or "pushed".
 */
export function targetSentence(target: Pick<TargetView, 'remote'>, lang: Lang): string {
  const { state, reason, trackingRef } = target.remote;
  const t = dict(lang).target;
  const ref =
    typeof trackingRef === 'string' && trackingRef.trim() ? trackingRef.trim() : undefined;
  if (state === 'pushed') return t.pushedOn(ref);
  if (state === 'not-pushed') return t.notPushedOn(ref);
  return t.unknown(typeof reason === 'string' && reason.trim() ? `: ${reason.trim()}` : '');
}

/**
 * How fresh the remote state is: the harness compared the accepted commit
 * with this machine's copy of the remote branch, and `checkedAt` (revision 2)
 * is when git last updated that copy. A definite state without `checkedAt`
 * says the time is unknown; an unknown state without it says nothing more.
 */
export function remoteFreshness(
  target: Pick<TargetView, 'remote'>,
  lang: Lang,
  timeZone?: string,
  nowMs?: number,
): string | undefined {
  const { state, checkedAt } = target.remote;
  const t = dict(lang).target;
  const when =
    typeof checkedAt === 'string' ? formatWhen(checkedAt, lang, timeZone, nowMs) : undefined;
  if (when) return t.checkedAt(when);
  if (state === 'pushed' || state === 'not-pushed') return t.checkedAtUnknown;
  return undefined;
}
