// The whole path of a work (`works[].track`, view revision 6): a compact
// line of segments on the task card and the full rows in the work detail.
// Labels, reasons and times are the harness's; the panel only colours the
// state the harness names (planned grey, current green and pulsing, failed
// red ✕, waiting amber ring, lead decision blue diamond, a person's decision
// dark bar, rework solid violet / violet outline ahead, skipped muted) and
// says the same in words. On the card each attempt and each single mark is
// its own button with its own tooltip (ui alpha.10, P6-27), with roving
// focus and a caption «сейчас: …». No fetching, no writes.

import { useId, useRef, useState } from 'react';
import { dict, knownLabel, type Dict, type Lang } from '../model/dict.ts';
import { formatElapsed } from '../model/format.ts';
import {
  decisionActor,
  diagnosisRequired,
  drawnSteps,
  trackNow,
  trackGroups,
  type DrawnStep,
  type TrackGroup,
  type TrackTone,
} from '../model/track.ts';
import type { WorkTrack } from '../model/view.ts';
import { StatusDot, type DotShape } from './ui/status-dot.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table.tsx';
import { clockOf } from './common.tsx';

/** Decision of the lead — diamond; of a person — bar; the end — square; a step — round. */
export const shapeOf = (d: Pick<DrawnStep, 'step'>): DotShape => {
  const who = decisionActor(d.step);
  if (who === 'user') return 'bar';
  if (who !== undefined) return 'diamond';
  return d.step.kind === 'accepted' ? 'square' : 'round';
};

/**
 * The state word of a drawn step: the dictionary's, or the harness code as
 * is. A wait says whom it waits for when the harness names it (`actor`):
 * «ждёт ведущего» (a held check, a diagnosis), «ждёт вас».
 */
export function stateWord(
  d: Pick<DrawnStep, 'state'> & { step?: Pick<DrawnStep['step'], 'actor'> },
  t: Dict,
): string {
  if (d.state === 'waiting' && d.step?.actor === 'lead') return t.r6.trackWaitLead;
  if (d.state === 'waiting' && d.step?.actor === 'user') return t.r6.trackWaitYou;
  return knownLabel(t.r6.trackState, d.state) ?? d.state;
}

/** One line of words for a step: «попытка 2 · проверки — не прошло (проверки не прошли)». */
export function stepWords(d: DrawnStep, t: Dict): string {
  const s = d.step;
  const head = [
    s.attempt !== undefined ? t.r6.trackAttempt(s.attempt) : undefined,
    s.rework !== undefined ? t.r6.trackRework(s.rework) : undefined,
    s.label,
  ]
    .filter(Boolean)
    .join(' · ');
  return `${head} — ${stateWord(d, t)}${s.reason ? ` (${s.reason})` : ''}`;
}

/**
 * The words of a step's label with the diagnosis kind (harness alpha.68,
 * P6-3): a diagnosis still ahead or waiting says whether it is required
 * («обязательный разбор ведущего») or optional («повтор: harness сам,
 * ведущий может разобрать»); a taken one adds «по желанию» / «обязательный».
 * Without the field: the harness label as is.
 */
export function stepLabel(d: Pick<DrawnStep, 'step' | 'state'>, t: Dict): string {
  const required = diagnosisRequired(d.step);
  if (required === undefined) return d.step.label;
  const k = t.r10;
  if (d.state === 'planned' || d.state === 'waiting')
    return required ? k.requiredAhead : k.optionalAhead;
  return `${d.step.label} · ${required ? k.requiredDone : k.optionalDone}`;
}

const upper = (s: string) => s.replace(/^./, (c) => c.toUpperCase());

interface TipContext {
  t: Dict;
  timeZone?: string | undefined;
  now?: number | undefined;
  /** When the current step started (`works[].stage.since`), for «идёт 3 мин». */
  since?: string | undefined;
  lang: Lang;
}

const clockPart = (at: string | undefined, c: TipContext) =>
  at ? ` · ${clockOf(at, c.t, c.timeZone, c.now)}` : '';

/**
 * One tooltip for one segment of the line (owner request P6-27, refined):
 * an attempt — «Попытка 2: код ✓ · проверки ✓ · ревью ✗ — причина · 14:31»,
 * the current one «… · сейчас: ревью, идёт 3 мин», one ahead «Попытка 3:
 * впереди»; a single mark (a diagnosis, a reset, a person's decision, the
 * end) — its label, reason, state and time.
 */
export function groupTip(g: TrackGroup, c: TipContext): string {
  const { t } = c;
  const k = t.r10;
  if (g.kind === 'single') {
    const d = g.steps[0]!;
    const words = [stepLabel(d, t), d.step.reason].filter(Boolean).join(' · ');
    const state =
      d.state === 'decision' || (d.state === 'passed' && d.step.kind === 'accepted')
        ? ''
        : ` — ${stateWord(d, t)}`;
    return upper(`${words}${state}${clockPart(d.step.at, c)}`);
  }
  const head = k.groupHead(g.attempt, g.rework);
  const parts: string[] = [];
  let last: string | undefined;
  for (const d of g.steps) {
    const s = d.step;
    if (s.at) last = s.at;
    if (d.state === 'passed') parts.push(`${s.label} ${k.passedMark}`);
    else if (d.state === 'failed')
      parts.push(`${s.label} ${k.failedMark}${s.reason ? ` — ${s.reason}` : ''}`);
    else if (d.state === 'current')
      parts.push(
        k.current(
          s.label,
          c.since && c.now !== undefined ? formatElapsed(c.since, c.now, c.lang) : '',
        ),
      );
    else if (d.state === 'planned' || d.state === 'skipped') continue;
    else parts.push(`${s.label} — ${stateWord(d, t)}${s.reason ? ` (${s.reason})` : ''}`);
  }
  return `${head || upper(k.ahead)}: ${parts.length ? parts.join(' · ') : k.ahead}${clockPart(last, c)}`;
}

/** The caption beside the line: «сейчас: ревью (попытка 3)», or the step that waits. */
export function trackCaption(track: WorkTrack, t: Dict): string | undefined {
  const d = trackNow(track);
  if (!d) return undefined;
  if (d.state === 'current') return t.r10.caption(stepLabel(d, t), d.step.attempt);
  return t.r10.captionWait(stepLabel(d, t), stateWord(d, t));
}

/** The strongest tone of a group, for its outline: what the eye should catch first. */
const RANK: TrackTone[] = [
  'failed',
  'current',
  'waiting',
  'decision',
  'human',
  'rework',
  'passed',
  'rework-planned',
  'planned',
  'skipped',
];
const groupTone = (g: TrackGroup): TrackTone =>
  RANK.find((r) => g.steps.some((d) => d.tone === r)) ?? 'planned';

/** The segment focused first: the current one, else the one that waits, else the last reached. */
function firstFocus(groups: TrackGroup[]): number {
  const has = (st: string) => groups.findIndex((g) => g.steps.some((d) => d.state === st));
  const cur = has('current');
  if (cur >= 0) return cur;
  const wait = has('waiting');
  if (wait >= 0) return wait;
  for (let i = groups.length - 1; i >= 0; i--)
    if (groups[i]!.steps.some((d) => d.state !== 'planned')) return i;
  return 0;
}

/**
 * The compact path on a task card: one segment per attempt (its steps as
 * cells) and one mark per decision or end. Each segment is a button with its
 * own tooltip (focus, hover or a tap opens it; Escape closes it); the arrow
 * keys, Home and End move between segments (one tab stop, roving focus). A
 * caption beside the line says what goes on now. The full step list stays in
 * the work detail (`TrackTable`).
 */
export function TrackLine({
  track,
  lang = 'ru',
  name,
  since,
  now,
  timeZone,
}: {
  track: WorkTrack;
  lang?: Lang;
  /** The work's name, for the line label. */
  name: string;
  /** When the current stage started (`works[].stage.since`): «идёт 3 мин». */
  since?: string | undefined;
  now?: number | undefined;
  timeZone?: string | undefined;
}) {
  const t = dict(lang);
  const base = useId();
  const groups = trackGroups(track);
  const [focus, setFocus] = useState(() => firstFocus(groups));
  const [open, setOpen] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  // The state before a tap: focus opens first, the click then must not close it.
  const before = useRef<boolean | undefined>(undefined);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  if (!groups.length) return null;
  const dropped =
    Number.isSafeInteger(track.truncated) && track.truncated! > 0 ? track.truncated! : 0;
  const ctx: TipContext = { t, timeZone, now, since, lang };
  const caption = trackCaption(track, t);
  const tab = Math.min(focus, groups.length - 1);
  const shown = hover ?? open;
  const move = (to: number) => {
    const i = Math.max(0, Math.min(groups.length - 1, to));
    setFocus(i);
    buttons.current[i]?.focus();
  };
  return (
    <div className="hui-track" data-testid="task-track">
      <div
        className="hui-track-root"
        role="toolbar"
        aria-label={t.r6.trackLabel(name)}
        aria-describedby={`${base}-keys`}
        onMouseLeave={() => setHover(null)}
      >
        {dropped ? (
          <span className="hui-track-more" data-testid="track-earlier">
            <span aria-hidden="true">+{dropped}</span>
            <span className="hui-sr"> {t.r6.trackEarlier(dropped)}</span>
          </span>
        ) : null}
        {groups.map((g, i) => (
          <button
            key={i}
            ref={(el) => {
              buttons.current[i] = el;
            }}
            type="button"
            className="hui-track-group hui-track-trigger"
            data-kind={g.kind}
            data-tone={groupTone(g)}
            data-rework={g.rework !== undefined ? '' : undefined}
            data-testid="track-group"
            tabIndex={i === tab ? 0 : -1}
            aria-label={
              g.kind === 'attempt'
                ? t.r10.groupHead(g.attempt, g.rework) || upper(t.r10.ahead)
                : upper(stepLabel(g.steps[0]!, t))
            }
            aria-describedby={`${base}-${i}`}
            aria-expanded={shown === i}
            onMouseEnter={() => setHover(i)}
            onPointerDown={() => (before.current = open === i)}
            onFocus={() => {
              setFocus(i);
              setOpen(i);
            }}
            onBlur={() => setOpen((o) => (o === i ? null : o))}
            onClick={() => {
              const was = before.current;
              before.current = undefined;
              // A tap or click decides: the pointer resting on the segment does not keep it open.
              setHover(null);
              setOpen((o) => (was === undefined ? (o === i ? null : i) : was ? null : i));
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setOpen(null);
                setHover(null);
              } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault();
                move(i + 1);
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault();
                move(i - 1);
              } else if (e.key === 'Home') {
                e.preventDefault();
                move(0);
              } else if (e.key === 'End') {
                e.preventDefault();
                move(groups.length - 1);
              }
            }}
          >
            <span className="hui-track-cells" aria-hidden="true">
              {g.steps.map((d, k) => (
                <StatusDot
                  key={k}
                  tone={d.tone}
                  shape={shapeOf(d)}
                  data-state={d.state}
                  data-optional={diagnosisRequired(d.step) === false ? '' : undefined}
                />
              ))}
            </span>
          </button>
        ))}
        {groups.map((g, i) => (
          <span
            key={i}
            role="tooltip"
            id={`${base}-${i}`}
            className="hui-tooltip hui-track-tip"
            data-side="bottom"
            data-open={shown === i ? '' : undefined}
          >
            {groupTip(g, ctx)}
          </span>
        ))}
        <span id={`${base}-keys`} className="hui-sr">
          {t.r10.keys}
        </span>
      </div>
      {caption ? (
        <span className="hui-track-caption" data-testid="track-caption">
          {caption}
        </span>
      ) : null}
    </div>
  );
}

/** What each colour means, in words (the detail shows it under the rows). */
export function TrackLegend({ lang = 'ru' }: { lang?: Lang }) {
  const t = dict(lang);
  const items: [TrackTone, DotShape][] = [
    ['passed', 'round'],
    ['current', 'round'],
    ['failed', 'round'],
    ['waiting', 'round'],
    ['decision', 'diamond'],
    ['human', 'bar'],
    ['rework', 'round'],
    ['rework-planned', 'round'],
    ['planned', 'round'],
    ['skipped', 'round'],
  ];
  return (
    <div className="hui:text-xs hui:text-muted-foreground" data-testid="track-legend">
      <span className="hui-sr">{t.r6.trackLegend}: </span>
      <ul className="hui:flex hui:list-none hui:flex-wrap hui:gap-x-3 hui:gap-y-1">
        {items.map(([tone, shape]) => (
          <li key={tone} className="hui:inline-flex hui:items-center hui:gap-1.5">
            <StatusDot tone={tone} shape={shape} />
            {t.r6.trackLegendItems[tone]}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The full rows of the path in the work detail: step, attempt, label, state, time, reason. */
export function TrackTable({
  track,
  lang = 'ru',
  timeZone,
  now,
}: {
  track: WorkTrack;
  lang?: Lang;
  timeZone?: string | undefined;
  now?: number | undefined;
}) {
  const t = dict(lang);
  const c = t.r6.trackCols;
  const rows = drawnSteps(track);
  const dropped =
    Number.isSafeInteger(track.truncated) && track.truncated! > 0 ? track.truncated! : 0;
  return (
    <div className="hui:grid hui:gap-2" data-testid="track-table">
      {dropped ? (
        <p className="hui-muted" data-testid="track-earlier">
          {t.r6.trackEarlier(dropped)}
        </p>
      ) : null}
      <Table label={t.r6.trackTitle}>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">{c.n}</TableHead>
            <TableHead scope="col">{c.attempt}</TableHead>
            <TableHead scope="col">{c.step}</TableHead>
            <TableHead scope="col">{c.state}</TableHead>
            <TableHead scope="col">{c.at}</TableHead>
            <TableHead scope="col">{c.reason}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((d) => (
            <TableRow key={d.n} data-tone={d.tone} data-state={d.state}>
              <TableCell className="hui:tabular-nums hui:text-muted-foreground">{d.n}</TableCell>
              <TableCell>{d.step.attempt ?? '—'}</TableCell>
              <TableCell>
                {d.step.kind === 'accepted'
                  ? `${d.step.label} (${t.r6.trackEnd})`
                  : stepLabel(d, t)}
                {d.step.rework !== undefined ? (
                  <span className="hui-track-rework"> · {t.r6.trackRework(d.step.rework)}</span>
                ) : null}
              </TableCell>
              <TableCell>
                <span className="hui:inline-flex hui:items-center hui:gap-1.5">
                  <StatusDot tone={d.tone} shape={shapeOf(d)} />
                  {stateWord(d, t)}
                </span>
              </TableCell>
              <TableCell className="hui:whitespace-nowrap">
                {d.step.at ? clockOf(d.step.at, t, timeZone, now) : '—'}
              </TableCell>
              <TableCell>{d.step.reason ?? ''}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <TrackLegend lang={lang} />
    </div>
  );
}
