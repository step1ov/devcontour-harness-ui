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
 * fetch, so the sentence says "as of the last git update on this machine".
 * `unknown` or any state this build does not know reads as unknown, never as
 * "not pushed" or "pushed"; the harness `reason` follows as is.
 */
export function targetSentence(target: Pick<TargetView, 'remote'>, lang: Lang): string {
  const { state, reason } = target.remote;
  const t = dict(lang).target;
  if (state === 'pushed') return t.pushed;
  if (state === 'not-pushed') return t.notPushed;
  return t.unknown(typeof reason === 'string' && reason.trim() ? `: ${reason.trim()}` : '');
}
