// The whole path of a work (`works[].track`, view revision 6): a compact
// line of segments on the task card and the full rows in the work detail.
// Labels, reasons and times are the harness's; the panel only colours the
// state the harness names (planned grey, current green and pulsing, failed
// red, waiting amber, lead decision blue, rework violet, skipped muted) and
// says the same in words. Pure render; no fetching, no writes.

import { dict, knownLabel, type Dict, type Lang } from '../model/dict.ts';
import {
  DECISION_KINDS,
  drawnSteps,
  trackGroups,
  type DrawnStep,
  type TrackGroup,
  type TrackTone,
} from '../model/track.ts';
import type { WorkTrack } from '../model/view.ts';
import { StatusDot, type DotShape } from './ui/status-dot.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table.tsx';
import { Tooltip } from './ui/tooltip.tsx';
import { clockOf } from './common.tsx';

const shapeOf = (d: DrawnStep): DotShape =>
  DECISION_KINDS.has(d.step.kind) ? 'diamond' : d.step.kind === 'accepted' ? 'square' : 'round';

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
  'rework',
  'passed',
  'planned',
  'skipped',
];
const groupTone = (g: TrackGroup): TrackTone =>
  RANK.find((r) => g.steps.some((d) => d.tone === r)) ?? 'planned';

/**
 * The compact path on a task card: one segment per attempt (its steps as
 * cells) and one mark per decision or end. Every segment carries its words
 * for assistive technology; the tooltip repeats them for the mouse.
 */
export function TrackLine({
  track,
  lang = 'ru',
  name,
}: {
  track: WorkTrack;
  lang?: Lang;
  /** The work's name, for the list label. */
  name: string;
}) {
  const t = dict(lang);
  const groups = trackGroups(track);
  if (!groups.length) return null;
  const dropped =
    Number.isSafeInteger(track.truncated) && track.truncated! > 0 ? track.truncated! : 0;
  return (
    <div className="hui-track" data-testid="task-track">
      <ol className="hui-track-line" aria-label={t.r6.trackLabel(name)}>
        {dropped ? (
          <li className="hui-track-more" data-testid="track-earlier">
            <span aria-hidden="true">+{dropped}</span>
            <span className="hui-sr">{t.r6.trackEarlier(dropped)}</span>
          </li>
        ) : null}
        {groups.map((g, i) => {
          const words = groupWords(g, t);
          return (
            <li
              key={i}
              className="hui-track-group"
              data-kind={g.kind}
              data-tone={groupTone(g)}
              data-rework={g.rework !== undefined ? '' : undefined}
            >
              <Tooltip content={words} decorative>
                <span className="hui-track-cells">
                  {g.steps.map((d, k) => (
                    <StatusDot key={k} tone={d.tone} shape={shapeOf(d)} data-state={d.state} />
                  ))}
                </span>
              </Tooltip>
              <span className="hui-sr">{words}</span>
            </li>
          );
        })}
      </ol>
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
    ['rework', 'round'],
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
