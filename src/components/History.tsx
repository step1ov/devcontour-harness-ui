// History screen: load, attempts started and failed per hour, checks passed
// and failed, cumulative spend against the budget — inline SVG without a
// chart library. Every chart has a text summary and a data table for screen
// readers. Regrouping buckets into hours is display work over the view's own
// series, not new data (design §3.7). Window totals come from the harness
// (`history.totals`, revision 1); a view without them (alpha.55) says so and
// its chart summaries add up the series on screen, as before.

import type { ReactNode } from 'react';
import { instantMs } from '../model/compat.ts';
import { dict, label, type Dict, type GlossaryId, type Lang } from '../model/dict.ts';
import { formatDuration, formatUsd, formatWindow, usd } from '../model/format.ts';
import type { HistoryTotals, OperatorView, ViewHistory } from '../model/view.ts';
import { Heading, Term, clockOf, type ScreenProps } from './common.tsx';
import { hasOverview, SetupScreen } from './Setup.tsx';

export interface HistoryProps extends Pick<ScreenProps, 'lang' | 'timeZone' | 'now'> {
  view: OperatorView;
}

const W = 600;
const H = 160;
const HOUR = 3_600_000;

interface Series {
  name: string;
  values: number[];
  /** CSS class of the marks: `hui-s1` (accent) or `hui-s2` (failure). */
  cls: 'hui-s1' | 'hui-s2';
}

/**
 * Sums groups of buckets into hours when the bucket divides an hour and the
 * window holds whole hours; otherwise keeps the buckets (a partial last hour
 * would be drawn as wide as a full one).
 */
export function perHour(h: Pick<ViewHistory, 'bucketMs'>, values: number[]) {
  if (!(
    h.bucketMs > 0 &&
    h.bucketMs < HOUR &&
    HOUR % h.bucketMs === 0 &&
    values.length % (HOUR / h.bucketMs) === 0
  ))
    return { values, hourly: h.bucketMs === HOUR, groupMs: h.bucketMs };
  const k = HOUR / h.bucketMs;
  const out: number[] = [];
  for (let i = 0; i < values.length; i += k)
    out.push(values.slice(i, i + k).reduce((a, b) => a + b, 0));
  return { values: out, hourly: true, groupMs: HOUR };
}

/**
 * Cumulative spend at the bucket boundaries: `values[0]` is the opening
 * balance (`spendOpeningUsd`) at `from`, `values[i]` the total at the end of
 * bucket i. The end is exact only when both the window and the opening are
 * exact; an unknown window bound (or one this build does not know) makes it
 * unknown, never a number.
 */
export function cumulativeSpend(h: ViewHistory) {
  const openingKnown = h.spendOpeningUsd.bound === 'exact' || h.spendOpeningUsd.bound === 'lower';
  // The window totals (revision 1) carry the finer bound: `unknown` when no
  // call of the window has a known cost, which `spendBound` reads as `lower`.
  // The more cautious of the two wins; an unrecognized bound reads as unknown.
  const rank = (b: string) => (b === 'exact' ? 0 : b === 'lower' ? 1 : 2);
  const worst = Math.max(rank(h.spendBound), h.totals ? rank(h.totals.spendUsd.bound) : 0);
  const windowBound = (['exact', 'lower', 'unknown'] as const)[worst]!;
  const windowKnown = windowBound === 'exact' || windowBound === 'lower';
  let sum = openingKnown ? h.spendOpeningUsd.value : 0;
  const values = [sum, ...h.spendUsd.map((x) => (sum += x))];
  const lower = windowBound !== 'exact' || h.spendOpeningUsd.bound !== 'exact';
  const bound: 'exact' | 'lower' | 'unknown' = !windowKnown ? 'unknown' : lower ? 'lower' : 'exact';
  return { values, openingKnown, lower, end: { value: sum, bound } };
}

const maxOf = (xs: number[]) => xs.reduce((a, b) => (b > a ? b : a), 0);

function Chart({
  id,
  title,
  summary,
  series,
  stacked,
  line,
  guide,
  guideLabel,
  times,
  axis,
  t,
  format = String,
  legend,
  unknown,
}: {
  id: string;
  title: string;
  summary: ReactNode;
  series: Series[];
  stacked?: boolean;
  /** Draw the first series as a line (cumulative), dashed when `line.dashed`. */
  line?: { dashed: boolean };
  /** The values are not known: no marks, and the data table says "unknown" (never $0.00). */
  unknown?: boolean;
  /** Horizontal dashed guide: concurrency or budget. */
  guide?: number;
  guideLabel?: string;
  times: string[];
  axis: [string, string, string];
  t: Dict;
  format?: (n: number) => string;
  legend?: ReactNode;
}) {
  const n = series[0]?.values.length ?? 0;
  const tops = Array.from({ length: n }, (_, i) =>
    stacked
      ? series.reduce((a, s) => a + (s.values[i] ?? 0), 0)
      : maxOf(series.map((s) => s.values[i] ?? 0)),
  );
  const max = Math.max(1, guide ?? 0, maxOf(tops)) * 1.08;
  const y = (v: number) => H - (v / max) * H;
  const slot = n ? W / n : W;
  const marks: ReactNode[] = [];
  if (unknown) {
    // Nothing to draw: a flat line at zero would claim a cost.
  } else if (line) {
    // Boundary values: the first point is the opening balance at the window start.
    const step = n > 1 ? W / (n - 1) : W;
    const pts = series[0]!.values.map((v, i) => `${i * step},${y(v)}`);
    marks.push(
      <polyline
        key="line"
        className={'hui-line ' + series[0]!.cls + (line.dashed ? ' hui-dashed' : '')}
        points={pts.join(' ')}
        fill="none"
        vectorEffect="non-scaling-stroke"
      />,
    );
  } else {
    const bw = Math.max(1, (stacked ? slot : slot / series.length) - 2);
    for (let i = 0; i < n; i++) {
      let base = 0;
      series.forEach((s, j) => {
        const v = s.values[i] ?? 0;
        if (v <= 0) return;
        const x = stacked ? i * slot + 1 : i * slot + 1 + j * (slot / series.length);
        const top = stacked ? base + v : v;
        marks.push(
          <rect
            key={`${i}-${j}`}
            className={'hui-bar ' + s.cls}
            x={x}
            y={y(top)}
            width={bw}
            height={Math.max(0, y(base) - y(top) - (stacked && base > 0 ? 1 : 0))}
          >
            <title>{`${times[i]}: ${s.name} ${format(v)}`}</title>
          </rect>,
        );
        if (stacked) base += v;
      });
    }
  }
  return (
    <figure
      className="hui-panel hui-chart"
      data-testid={`chart-${id}`}
      aria-labelledby={`hui-${id}-title`}
    >
      <figcaption>
        <h3 className="hui-subtitle" id={`hui-${id}-title`}>
          {title}
        </h3>
        <p className="hui-chart-summary" data-testid={`summary-${id}`}>
          {summary}
        </p>
      </figcaption>
      {legend ? <div className="hui-legend">{legend}</div> : null}
      <svg
        className="hui-svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-labelledby={`hui-${id}-title`}
        focusable="false"
      >
        <line className="hui-axis" x1="0" y1={H} x2={W} y2={H} vectorEffect="non-scaling-stroke" />
        {marks}
        {guide !== undefined ? (
          <line
            className="hui-guide"
            x1="0"
            x2={W}
            y1={y(guide)}
            y2={y(guide)}
            vectorEffect="non-scaling-stroke"
          >
            <title>{guideLabel}</title>
          </line>
        ) : null}
      </svg>
      <div className="hui-axis-labels" aria-hidden="true">
        <span>{axis[0]}</span>
        <span>{axis[1]}</span>
        <span>{axis[2]}</span>
      </div>
      <div className="hui-sr">
        <table>
          <caption>{t.history.dataTable(title)}</caption>
          <thead>
            <tr>
              <th scope="col">{t.history.time}</th>
              {series.map((s) => (
                <th scope="col" key={s.name}>
                  {s.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {times.map((time, i) => (
              <tr key={i}>
                <th scope="row">{time}</th>
                {series.map((s) => (
                  <td key={s.name}>{unknown ? t.unknown : format(s.values[i] ?? 0)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

const Key = ({ cls, children, dashed }: { cls: string; children: ReactNode; dashed?: boolean }) => (
  <span className="hui-key">
    <span
      className={'hui-swatch ' + cls + (dashed ? ' hui-swatch-dashed' : '')}
      aria-hidden="true"
    />
    {children}
  </span>
);

/**
 * Window totals from the harness (`history.totals`). Every row is a number
 * the harness sent, with a «что это значит» disclosure; without totals the
 * panel says the harness version has none instead of showing zeros.
 */
export function HistoryTotalsPanel({
  totals,
  slots,
  lang,
}: {
  totals: HistoryTotals | undefined;
  slots: number;
  lang: Lang;
}) {
  const t = dict(lang);
  const v = t.history;
  if (!totals)
    return (
      <div className="hui-panel" data-testid="history-totals">
        <Heading t={t}>{v.totals}</Heading>
        <p className="hui-muted" data-testid="history-totals-missing">
          {v.totalsMissing}
        </p>
      </div>
    );
  const buckets = Object.entries(totals.failuresByBucket).filter(([, n]) => n > 0);
  const r = totals.reviewRounds;
  // The spend row explains the window spend, and its bound when not exact.
  const boundTerm: GlossaryId | undefined =
    totals.spendUsd.bound === 'exact'
      ? undefined
      : totals.spendUsd.bound === 'lower'
        ? 'lowerBound'
        : 'unknown';
  const rows: [string, string, GlossaryId[], string][] = [
    ['started', v.tStarted, ['attempt'], String(totals.attemptsStarted)],
    [
      'failed',
      v.tFailed,
      ['failureBucket'],
      String(totals.attemptsFailed) +
        (buckets.length
          ? ` (${v.tByBucket(buckets.map(([b, n]) => v.tBucket(label(t.bucket, b), n)).join(', '))})`
          : ''),
    ],
    [
      'gates',
      v.tGates,
      ['gates'],
      v.tGatesValue(totals.gatesPassed, totals.gatesFailed, totals.gatesReused),
    ],
    ['rounds', v.tRounds, ['reviewRound'], v.tRoundsValue(r.plan, r.contract, r.code, r.attempt)],
    [
      'spend',
      v.tSpend,
      boundTerm ? ['windowSpend', boundTerm] : ['windowSpend'],
      formatUsd(totals.spendUsd, lang),
    ],
    ['wall', v.tWall, ['wallTime'], formatDuration(totals.wallMs, lang)],
    ['attempt-ms', v.tAttemptMs, ['attemptTime'], formatDuration(totals.attemptMs, lang)],
    ['peak', v.tPeak, ['loadPeak'], v.tPeakValue(totals.loadPeak, slots)],
  ];
  return (
    <div className="hui-panel" data-testid="history-totals">
      <Heading t={t}>{v.totals}</Heading>
      <dl className="hui-grid hui-totals">
        {rows.map(([id, name, terms, value]) => (
          <div key={id} data-testid={`total-${id}`}>
            <dt>{name}</dt>
            <dd>
              <span className="hui-total-value">{value}</span>
              {terms.map((term) => (
                <Term key={term} id={term} t={t} />
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function History({ view, lang = 'ru', timeZone, now: nowProp }: HistoryProps) {
  const t = dict(lang);
  // A document without the overview lists (revision 5 setup): the setup state, not a throw.
  if (!hasOverview(view)) return <SetupScreen view={view} lang={lang} />;
  // Clocks of another day than the view's carry a date, so a 24 h window reads unambiguously.
  const now = nowProp ?? instantMs(view.generatedAt);
  const v = t.history;
  const h = view.history;
  const from = instantMs(h.from);
  // A finite number can still be outside the Date range: unknown, never a crash.
  const clock = (ms: number) =>
    Number.isFinite(ms) && Math.abs(ms) <= 8.64e15
      ? clockOf(new Date(ms).toISOString(), t, timeZone, now)
      : t.unknown;
  const series = [
    h.load,
    h.attemptsStarted,
    h.attemptsFailed,
    h.gatesPassed,
    h.gatesFailed,
    h.gatesReused,
    h.spendUsd,
  ];
  const n = h.load.length;
  const aligned = n > 0 && series.every((s) => s.length === n);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const timesOf = (count: number, stepMs: number) =>
    Array.from({ length: count }, (_, i) => clock(from + i * stepMs));
  const axis: [string, string, string] = [
    clockOf(h.from, t, timeZone, now),
    clock((instantMs(h.from) + instantMs(h.to)) / 2),
    clockOf(h.to, t, timeZone, now),
  ];
  const times = timesOf(n, h.bucketMs);
  const started = perHour(h, h.attemptsStarted);
  const failed = perHour(h, h.attemptsFailed);
  const hourTimes = timesOf(started.values.length, started.groupMs);
  const spend = cumulativeSpend(h);
  const slots = view.settings.concurrency;
  const tot = h.totals;
  return (
    <section className="hui hui-history" aria-labelledby="hui-history-title" lang={lang}>
      <Heading t={t} level={2} id="hui-history-title">
        {v.label}
      </Heading>
      <p className="hui-muted" data-testid="history-window">
        {v.window(
          clockOf(h.from, t, timeZone, now),
          clockOf(h.to, t, timeZone, now),
          formatWindow(h.bucketMs, lang),
        )}
      </p>
      <HistoryTotalsPanel totals={tot} slots={slots} lang={lang} />
      {!aligned ? (
        <p className="hui-panel hui-bad" data-testid="history-misaligned">
          {v.misaligned}
        </p>
      ) : (
        <div className="hui-charts">
          <Chart
            id="load"
            title={v.load}
            t={t}
            times={times}
            axis={axis}
            series={[{ name: v.peak, values: h.load, cls: 'hui-s1' }]}
            guide={slots}
            guideLabel={v.slotsLine(slots)}
            summary={v.loadSummary(tot ? tot.loadPeak : maxOf(h.load), slots)}
            legend={
              <>
                <Key cls="hui-s1">{v.peak}</Key>
                <Key cls="hui-guide-key" dashed>
                  {v.slotsLine(slots)}
                </Key>
              </>
            }
          />
          <Chart
            id="attempts"
            title={started.hourly ? v.attempts : v.attemptsBucket}
            t={t}
            times={hourTimes}
            axis={axis}
            series={[
              { name: v.started, values: started.values, cls: 'hui-s1' },
              { name: v.failed, values: failed.values, cls: 'hui-s2' },
            ]}
            summary={(started.hourly ? v.attemptsSummary : v.attemptsSummaryBucket)(
              tot ? tot.attemptsStarted : sum(h.attemptsStarted),
              tot ? tot.attemptsFailed : sum(h.attemptsFailed),
              maxOf(started.values),
            )}
            legend={
              <>
                <Key cls="hui-s1">{v.started}</Key>
                <Key cls="hui-s2">{v.failed}</Key>
              </>
            }
          />
          <Chart
            id="gates"
            title={v.gates}
            t={t}
            times={times}
            axis={axis}
            stacked
            series={[
              { name: v.passed, values: h.gatesPassed, cls: 'hui-s1' },
              { name: v.gateFailed, values: h.gatesFailed, cls: 'hui-s2' },
            ]}
            summary={
              <>
                {tot
                  ? v.gatesSummary(tot.gatesPassed, tot.gatesFailed, tot.gatesReused)
                  : v.gatesSummary(sum(h.gatesPassed), sum(h.gatesFailed), sum(h.gatesReused))}{' '}
              </>
            }
            legend={
              <>
                <Key cls="hui-s1">{v.passed}</Key>
                <Key cls="hui-s2">{v.gateFailed}</Key>
              </>
            }
          />
          <Chart
            id="spend"
            title={v.spend}
            t={t}
            axis={axis}
            line={{ dashed: spend.lower }}
            unknown={spend.end.bound === 'unknown'}
            times={timesOf(n + 1, h.bucketMs)}
            series={[
              {
                name: v.cumulative + (spend.lower ? ` (${v.lowerBound})` : ''),
                values: spend.values,
                cls: 'hui-s1',
              },
            ]}
            format={(x) => usd(x)}
            {...(h.budgetUsd !== undefined
              ? { guide: h.budgetUsd, guideLabel: v.budgetLine(usd(h.budgetUsd)) }
              : {})}
            summary={
              <>
                {v.spendSummary(
                  formatUsd(spend.end, lang),
                  h.budgetUsd !== undefined ? usd(h.budgetUsd) : undefined,
                )}{' '}
                {spend.openingKnown
                  ? v.spendOpening(formatUsd(h.spendOpeningUsd, lang))
                  : v.spendOpeningUnknown}
                {h.budgetUsd === undefined ? ` ${v.noBudgetLine}.` : ''}
              </>
            }
            legend={
              <>
                <Key cls="hui-s1" dashed={spend.lower}>
                  {v.cumulative}
                  {spend.lower ? ` — ${v.lowerBound}` : ''}
                </Key>
                {h.budgetUsd !== undefined ? (
                  <Key cls="hui-guide-key" dashed>
                    {v.budgetLine(usd(h.budgetUsd))}
                  </Key>
                ) : null}
              </>
            }
          />
        </div>
      )}
      <div className="hui-terms">
        <Term id="gates" t={t} named />
        <Term id="lowerBound" t={t} named />
        <Term id="attempt" t={t} named />
      </div>
    </section>
  );
}
