// Small display helpers shared by components. Pure; words come from the
// dictionary (dict.ts). These helpers default to English for API stability;
// the components default to Russian. Unknown values from a newer producer get
// the conservative reading: an unknown bound is "unknown", an unknown answer
// rule is "only you".

import { instantMs } from './compat.ts';
import { dict, label, type Lang } from './dict.ts';
import type { Bounded, OperatorQuestion, TypicalDuration } from './view.ts';

/** `$1.50`, `≥ $3.40` for a lower bound, "unknown" for anything else — never `$0.00`. */
export function formatUsd(amount: Bounded | undefined, lang: Lang = 'en'): string {
  if (
    !amount ||
    (amount.bound !== 'exact' && amount.bound !== 'lower') ||
    !Number.isFinite(amount.value)
  )
    return dict(lang).usdUnknown;
  const text = '$' + amount.value.toFixed(2);
  return amount.bound === 'lower' ? '≥ ' + text : text;
}

/** A plain dollar amount the producer gave as a number (limits, budgets). */
export const usd = (n: number): string => '$' + n.toFixed(2);

/** A duration as `1h 05m`, `4m 12s`, `9s` (en) or `1 ч 05 мин`, `4 мин 12 с` (ru). */
export function formatDuration(ms: number, lang: Lang = 'en'): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (!Number.isFinite(s)) return dict(lang).unknown;
  return dict(lang).duration(Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60);
}

/**
 * The usual stage time as an honest range, `обычно 5–12 мин` / `usually
 * 5–12 min`: the low end rounded down, the high end up, so the range never
 * looks narrower than observed. `undefined` (show nothing) when the harness
 * sent no observation or an inconsistent one — never a made-up number.
 */
export function formatTypical(
  typical: TypicalDuration | undefined,
  lang: Lang = 'en',
): string | undefined {
  if (!typical) return undefined;
  const { p50Ms: lo, p90Ms: hi } = typical;
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo < 0 || hi < lo) return undefined;
  const t = dict(lang);
  if (hi < 60_000)
    return t.typicalRange(t.range(Math.floor(lo / 1000), Math.ceil(hi / 1000), t.unitSec));
  if (hi < 3_600_000)
    return t.typicalRange(t.range(Math.floor(lo / 60_000), Math.ceil(hi / 60_000), t.unitMin));
  const minute = 60_000;
  const a = formatDuration(Math.floor(lo / minute) * minute, lang);
  const b = formatDuration(Math.ceil(hi / minute) * minute, lang);
  return t.typicalRange(a === b ? b : `${a}–${b}`);
}

/** A window length: `24 ч`, `7 дней` (ru) or `24 h`, `7 days` (en); other lengths as a duration. */
export function formatWindow(ms: number, lang: Lang = 'en'): string {
  const t = dict(lang);
  if (Number.isFinite(ms) && ms > 0 && ms % 3_600_000 === 0 && ms <= 48 * 3_600_000)
    return t.hours(ms / 3_600_000);
  if (Number.isFinite(ms) && ms > 0 && ms % 86_400_000 === 0) return t.days(ms / 86_400_000);
  return formatDuration(ms, lang);
}

/** Elapsed time between an ISO instant and `nowMs`. */
export function formatElapsed(fromIso: string, nowMs: number, lang: Lang = 'en'): string {
  const ms = nowMs - instantMs(fromIso);
  if (!Number.isFinite(ms)) return dict(lang).unknown;
  return formatDuration(ms, lang);
}

/** Label for a stage; an unknown stage from a newer harness is shown as is. */
export const stageLabel = (stage: string, lang: Lang = 'en'): string =>
  label(dict(lang).stage, stage);

/** Stages that hold a worker slot. */
export const SLOT_STAGES: ReadonlySet<string> = new Set([
  'prepare',
  'writer',
  'gates',
  'review',
  'integration',
]);

export interface QuestionStatus {
  /** Whether the question waits for a new answer from a person. */
  needsAnswer: boolean;
  text: string;
}

/**
 * What a question's lifecycle state means for the operator. Only
 * `awaiting-answer` asks for an answer; the other states name who acts.
 */
/** Question states this build knows; any other state makes the header's count unknown. */
export const KNOWN_QUESTION_STATES: ReadonlySet<string> = new Set([
  'awaiting-answer',
  'answered-not-applied',
  'applied-awaiting-claim',
  'delivered',
  'carry-stale',
  'cancelled',
  'superseded',
]);

/**
 * Whether the lead may answer (design §3.4): `answerableBy: operator-or-lead`
 * and `impact: technical`. An absent, unknown or `user-visible` impact reads
 * as user-visible, which only the operator answers, whatever the severity.
 */
export function leadMayAnswer(q: Pick<OperatorQuestion, 'answerableBy' | 'impact'>): boolean {
  return q.answerableBy === 'operator-or-lead' && q.impact === 'technical';
}

export function questionStatus(
  q: Pick<OperatorQuestion, 'state' | 'answerableBy' | 'impact'>,
  lang: Lang = 'en',
): QuestionStatus {
  const t = dict(lang).question;
  switch (q.state) {
    case 'awaiting-answer':
      return { needsAnswer: true, text: leadMayAnswer(q) ? t.youOrLead : t.onlyYou };
    case 'answered-not-applied':
      return { needsAnswer: false, text: t.answeredNotApplied };
    case 'carry-stale':
      return { needsAnswer: false, text: t.carryStale };
    case 'applied-awaiting-claim':
      return { needsAnswer: false, text: t.appliedAwaitingClaim };
    case 'delivered':
      return { needsAnswer: false, text: t.delivered };
    // Questions of a closed work (detail only, harness alpha.56): the request lifecycle.
    case 'cancelled':
      return { needsAnswer: false, text: t.cancelled };
    case 'superseded':
      return { needsAnswer: false, text: t.superseded };
    default:
      return { needsAnswer: false, text: t.unknownState(String(q.state)) };
  }
}

/**
 * A rough length for an estimate: under a minute; whole minutes up to 30;
 * then 5-minute steps; from an hour on, half hours; from 10 h on, hours.
 * Rounded up (the high end of a range, a single figure), or down (`down`:
 * the low end), so a range never looks narrower than the numbers.
 */
export function formatRough(ms: number, lang: Lang = 'en', down = false): string {
  const r = dict(lang).rough;
  if (!Number.isFinite(ms) || ms < 0) return dict(lang).unknown;
  const round = down ? Math.floor : Math.ceil;
  const min = ms / 60_000;
  if (min < 1) return r.underMinute;
  if (min <= 30) return r.minutes(Math.max(1, round(min)));
  if (min < 60) return r.minutes(Math.max(30, Math.min(60, round(min / 5) * 5)));
  const h = min / 60;
  if (h < 10) return r.hours(Math.max(1, round(h * 2) / 2));
  return r.hours(Math.max(10, round(h)));
}

/** A rough range: «около 15 мин», «до 5 мин», «50 мин – 2,5 ч» (never a bare 0). */
export function formatRange(range: { loMs: number; hiMs: number }, lang: Lang = 'en'): string {
  const r = dict(lang).rough;
  const hi = formatRough(range.hiMs, lang);
  if (range.loMs < 60_000) return range.hiMs < 60_000 ? r.underMinute : r.upTo(hi);
  const lo = formatRough(range.loMs, lang, true);
  return lo === hi ? r.about(hi) : r.between(lo, hi);
}
