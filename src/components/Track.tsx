// The whole path of a work (`works[].track`, view revision 6): a compact
// line of segments on the task card and the full rows in the work detail.
// Labels, reasons and times are the harness's; the panel only colours the
// state the harness names (planned grey, current green and pulsing, failed
// red ✕, waiting amber ring, lead decision blue diamond, a person's decision
// dark bar, rework solid violet / violet outline ahead, skipped muted) and
// says the same in words. The card line is one focusable button: focus or a
// tap opens the step list. No fetching, no writes.

import { useId, useRef, useState } from 'react';
import { dict, knownLabel, type Dict, type Lang } from '../model/dict.ts';
import {
  decisionActor,
  drawnSteps,
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

/** The state word of a drawn step: the dictionary's, or the harness code as is. */
export function stateWord(d: Pick<DrawnStep, 'state'>, t: Dict): string {
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

function groupWords(g: TrackGroup, t: Dict): string {
  if (g.kind === 'single') return stepWords(g.steps[0]!, t);
  const head = [
    g.attempt !== undefined ? t.r6.trackAttempt(g.attempt) : undefined,
    g.rework !== undefined ? t.r6.trackRework(g.rework) : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
  const parts = g.steps.map(
    (d) => `${d.step.label} — ${stateWord(d, t)}${d.step.reason ? ` (${d.step.reason})` : ''}`,
  );
  return `${head}: ${parts.join('; ')}`;
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

/**
 * The compact path on a task card: one segment per attempt (its steps as
 * cells) and one mark per decision or end, inside one button. Focus, a tap
 * or hovering opens the step list (a tooltip tied with `aria-describedby`);
 * Escape closes it.
 */
export function TrackLine({
  track,
  lang = 'ru',
  name,
}: {
  track: WorkTrack;
  lang?: Lang;
  /** The work's name, for the button label. */
  name: string;
}) {
  const t = dict(lang);
  const id = useId();
  const [open, setOpen] = useState(false);
  // The state before a tap: focus opens first, the click then must not close it.
  const before = useRef<boolean | undefined>(undefined);
  const groups = trackGroups(track);
  if (!groups.length) return null;
  const dropped =
    Number.isSafeInteger(track.truncated) && track.truncated! > 0 ? track.truncated! : 0;
  return (
    <div className="hui-track" data-testid="task-track">
      <span className="hui-track-root" data-open={open ? '' : undefined}>
        <button
          type="button"
          className="hui-track-trigger"
          aria-label={t.r6.trackLabel(name)}
          aria-describedby={id}
          aria-expanded={open}
          onPointerDown={() => (before.current = open)}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onClick={() => {
            const was = before.current;
            before.current = undefined;
            setOpen(was === undefined ? (o) => !o : !was);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
          }}
        >
          <span className="hui-track-line" aria-hidden="true">
            {dropped ? (
              <span className="hui-track-more" data-testid="track-earlier">
                +{dropped}
              </span>
            ) : null}
            {groups.map((g, i) => (
              <span
                key={i}
                className="hui-track-group"
                data-kind={g.kind}
                data-tone={groupTone(g)}
                data-rework={g.rework !== undefined ? '' : undefined}
              >
                <span className="hui-track-cells">
                  {g.steps.map((d, k) => (
                    <StatusDot key={k} tone={d.tone} shape={shapeOf(d)} data-state={d.state} />
                  ))}
                </span>
              </span>
            ))}
          </span>
        </button>
        <span role="tooltip" id={id} className="hui-tooltip hui-track-tip" data-side="bottom">
          <ol className="hui-track-steps">
            {dropped ? <li>{t.r6.trackEarlier(dropped)}</li> : null}
            {groups.map((g, i) => (
              <li key={i}>{groupWords(g, t)}</li>
            ))}
          </ol>
        </span>
      </span>
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
                {d.step.kind === 'accepted' ? `${d.step.label} (${t.r6.trackEnd})` : d.step.label}
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
