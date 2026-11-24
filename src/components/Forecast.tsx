// Release forecast rings (design §5.1 «Прогноз выпуска», alpha.5): two big
// ring indicators at the top of the Overview, from the harness `forecast`
// (view revision 4, harness 0.1.0-alpha.60, proposal P11). «До релиза» —
// the weighted share of the whole scope with the harness line; «Время» —
// elapsed and the remaining range, with the wait for people apart. The
// panel counts nothing: every number is a `forecast` field; only the ring
// geometry (the share of the circle) is drawn from them. An unknown is a
// ring in the «неизвестно» state with its reason, never a zero.

import { useId, type ReactNode } from 'react';
import type { ForecastView } from '../model/view.ts';
import { dict, knownLabel, label, type Dict, type Lang } from '../model/dict.ts';
import { Badge } from './ui/badge.tsx';
import { formatRough } from '../model/format.ts';
import { instantMs } from '../model/compat.ts';
import { formatClock } from '../model/i18n.ts';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card.tsx';
import { Progress } from './ui/progress.tsx';
import { forecastAdditions, type OutlineStageView } from '../model/revision8.ts';
import {
  releaseReviewOf,
  releaseWaitsForReview,
  type ReleaseReviewView,
} from '../model/revision9.ts';

const SIZE = 120;
const STROKE = 12;
const R = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * R;

/** The ring's fill while the lead finishes: a tail of at least 5 % stays visible. */
const FINISH_RING_MAX = 95;

const clamp = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);

/** One ring: `share` filled solid, `band` (≥ share) a lighter range; no share = unknown. */
function Ring({
  share,
  band,
  tone,
  tail = false,
}: {
  share: number | undefined;
  band?: number | undefined;
  tone: 'ok' | 'primary';
  /**
   * The lead finishes the release (code accepted, ui alpha.10, P6-5): the
   * rest of the ring after `share` is a striped, breathing tail.
   */
  tail?: boolean;
}) {
  const color = tone === 'ok' ? 'var(--hui-ok)' : 'var(--hui-accent)';
  const arc = (x: number) => `${clamp(x) * CIRC} ${CIRC}`;
  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="hui-ring-svg hui:size-full"
      aria-hidden="true"
      focusable="false"
    >
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={R}
        fill="none"
        stroke={share === undefined ? 'var(--hui-muted)' : 'var(--hui-track)'}
        strokeWidth={STROKE}
        {...(share === undefined
          ? { strokeDasharray: '3 7', strokeOpacity: 0.6, 'data-unknown': 'true' }
          : {})}
      />
      {share !== undefined && band !== undefined && band > share ? (
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke={color}
          strokeOpacity={0.35}
          strokeWidth={STROKE}
          strokeDasharray={arc(band)}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          data-part="band"
        />
      ) : null}
      {tail && share !== undefined && share < 1 ? (
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeDasharray={tailDashes(share)}
          transform={`rotate(${share * 360 - 90} ${SIZE / 2} ${SIZE / 2})`}
          className="hui-ring-tail"
          data-part="tail"
        />
      ) : null}
      {share !== undefined && share > 0 ? (
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          // Butt caps next to a tail: round ones would cover the finishing gap.
          strokeLinecap={share >= 1 || tail ? 'butt' : 'round'}
          strokeDasharray={arc(share)}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          data-part="fill"
        />
      ) : null}
    </svg>
  );
}

/** Stripes of 4 / gap 4 along the rest of the ring after `share`, then a gap round the rest. */
export function tailDashes(share: number): string {
  const len = (1 - clamp(share)) * CIRC;
  // A small gap after the solid fill, so the tail reads apart from it.
  const out: number[] = [0, 3];
  let used = 3;
  while (used + 4 <= len) {
    out.push(4, 3);
    used += 7;
  }
  // Always at least one stripe, however short the rest is.
  if (out.length === 2 && len > 3) out.push(len - 3, 0);
  out.push(0, CIRC);
  return out.map((x) => Math.round(x * 100) / 100).join(' ');
}

/** A whole-minute span, «2 ч 50 мин», «45 мин», «меньше минуты»: seconds would be noise here. */
export function spanWords(ms: number, lang: Lang): string {
  const t = dict(lang);
  if (!Number.isFinite(ms) || ms < 0) return t.unknown;
  const min = Math.floor(ms / 60_000);
  if (min < 1) return t.rough.underMinute;
  return t.forecast.span(Math.floor(min / 60), min % 60);
}

/**
 * The remaining range as words: «~1,5–2,5 ч», «~45 мин», «до 5 мин». The
 * low end is rounded down and the high end up, so the range never looks
 * narrower than the harness numbers.
 */
export function remainingWords(r: { loMs: number; hiMs: number }, lang: Lang): string {
  const t = dict(lang).rough;
  const hi = formatRough(r.hiMs, lang);
  if (r.loMs < 60_000) return r.hiMs < 60_000 ? `~${t.underMinute}` : t.upTo(hi);
  const lo = formatRough(r.loMs, lang, true);
  return lo === hi ? `~${hi}` : `~${t.between(lo, hi)}`;
}

/**
 * A duration that goes on with the clock: the harness puts its start
 * (`startedAt`, `humanWait.since`) into the content token and leaves the
 * duration out of it, so a live page that keeps an unchanged document reads
 * the time since that start on its own clock. Never less than the
 * harness's own figure; without a start, the figure as is.
 */
export function sinceMs(
  ms: number | undefined,
  since: string | undefined,
  now: number | undefined,
) {
  if (since === undefined || now === undefined || !Number.isFinite(now)) return ms;
  const live = now - instantMs(since);
  if (!Number.isFinite(live)) return ms;
  return Math.max(ms ?? 0, Math.max(0, live));
}

/** What the time ring says, from the forecast fields (and the clock for elapsed). */
export function timeState(f: ForecastView, lang: Lang, now?: number) {
  const d = dict(lang);
  const t = d.forecast;
  const { estimate, finishedAt } = f.time;
  // Revision 5: nothing is left (`estimate: nothing`) or the release is
  // finished (`finishedAt`, elapsed fixed up to it).
  const finished = finishedAt !== undefined || estimate === 'nothing';
  // Only a finish time stops the clock: `elapsedMs` then ends there.
  const elapsedMs =
    finishedAt !== undefined ? f.time.elapsedMs : sinceMs(f.time.elapsedMs, f.time.startedAt, now);
  if (finished || f.progress.left === 0) {
    const at = finishedAt !== undefined ? formatClock(finishedAt, undefined, now) : undefined;
    const took = elapsedMs === undefined ? undefined : spanWords(elapsedMs, lang);
    const head =
      finishedAt !== undefined && at
        ? d.r5.finished(at) + (took ? ` · ${d.r5.took(took)}` : '')
        : elapsedMs === undefined
          ? t.notStarted
          : t.elapsed(spanWords(elapsedMs, lang));
    return {
      kind: 'done' as const,
      share: 1,
      band: undefined,
      center: '✓',
      sub: finishedAt !== undefined ? d.r5.finishedWord : t.nothingLeft,
      text: `${head} · ${t.nothingLeft}`,
      range: undefined,
    };
  }
  const elapsed = elapsedMs === undefined ? t.notStarted : t.elapsed(spanWords(elapsedMs, lang));
  // Which range «осталось» stands on: revision 5 names it (`estimate`); before
  // it, `remaining` when present. `unknown` is unknown even with a stale range.
  const rough =
    estimate === 'rough' || (estimate === undefined && !f.time.remaining)
      ? f.time.rough
      : undefined;
  const range =
    estimate === 'unknown'
      ? undefined
      : (rough ?? (estimate === 'rough' ? undefined : f.time.remaining));
  const leftText = (words: string) =>
    rough ? d.r5.leftRough(words, rough.samples) : t.left(words);
  if (range && elapsedMs === undefined) {
    // A range without an elapsed time: the range stands; only the ring has no share to draw.
    const words = remainingWords(range, lang);
    return {
      kind: 'noElapsed' as const,
      share: undefined,
      band: undefined,
      center: words,
      sub: rough ? d.r5.roughWord : t.leftWord,
      text: `${t.elapsedUnknown} · ${leftText(words)}`,
      range,
      rough: rough !== undefined,
    };
  }
  if (!range || elapsedMs === undefined)
    return {
      kind: 'unknown' as const,
      share: undefined,
      band: undefined,
      center: t.unknownMark,
      sub: t.unknownWord,
      text: `${elapsed} · ${t.leftUnknown}`,
      range: undefined,
    };
  const words = remainingWords(range, lang);
  // Geometry only: the elapsed part of elapsed + remaining (upper end solid, lower end the band).
  const whole = (left: number) => (elapsedMs + left > 0 ? elapsedMs / (elapsedMs + left) : 0);
  return {
    kind: 'known' as const,
    share: whole(range.hiMs),
    band: whole(range.loMs),
    center: words,
    sub: rough ? d.r5.roughWord : t.leftWord,
    text: `${elapsed} · ${leftText(words)}`,
    range,
    rough: rough !== undefined,
  };
}

const ringBox =
  'hui-ring hui:relative hui:mx-auto hui:size-32 hui:shrink-0 hui:sm:size-40 hui:rounded-full hui:outline-offset-4';

function Tile({
  title,
  ring,
  center,
  sub,
  valueNow,
  valueText,
  children,
  testid,
}: {
  title: string;
  ring: ReactNode;
  center: string;
  sub: string;
  valueNow: number | undefined;
  valueText: string;
  children: ReactNode;
  testid: string;
}) {
  const id = useId();
  return (
    <div className="hui:grid hui:min-w-0 hui:content-start hui:gap-3" data-testid={testid}>
      <h3 className="hui:text-center hui:text-base hui:font-semibold" id={id}>
        {title}
      </h3>
      <div
        className={ringBox}
        role="progressbar"
        aria-labelledby={id}
        aria-valuemin={0}
        aria-valuemax={100}
        {...(valueNow !== undefined ? { 'aria-valuenow': valueNow } : {})}
        aria-valuetext={valueText}
        data-state={valueNow === undefined ? 'unknown' : 'known'}
      >
        {ring}
        <div
          className="hui:absolute hui:inset-0 hui:flex hui:flex-col hui:items-center hui:justify-center hui:px-4 hui:text-center"
          aria-hidden="true"
        >
          <span className="hui-ring-center hui:text-xl hui:leading-tight hui:font-semibold hui:sm:text-2xl">
            {center}
          </span>
          <span className="hui:text-xs hui:text-muted-foreground">{sub}</span>
        </div>
      </div>
      <div className="hui:grid hui:gap-1 hui:text-center hui:text-sm">{children}</div>
    </div>
  );
}

export function ForecastRings({
  forecast,
  lang = 'ru',
  now,
  truncatedWorks,
}: {
  forecast: ForecastView;
  lang?: Lang;
  /** `truncated.forecastWorks` (revision 5): unfinished works not listed. */
  truncatedWorks?: number | undefined;
  /** The viewer's clock (ms); elapsed and the wait go on from the harness's start points. */
  now?: number | undefined;
}) {
  const t: Dict = dict(lang);
  const f = t.forecast;
  const p = forecast.progress;
  const time = timeState(forecast, lang, now);
  const wait = forecast.time.humanWait;
  const waitMs = wait.works ? (sinceMs(wait.ms, wait.since, now) ?? wait.ms) : 0;
  const r = time.range;
  const added = p.added ?? [];
  const works = p.works ?? [];
  const percent = Math.max(0, Math.min(100, Math.round(p.percent)));
  // Revision 6: the release state, the approved-plan figure and the lead's share — as sent.
  const release = p.release;
  // ui alpha.10 (P6-5): the code is accepted and the lead finishes — the ring
  // stays below 100 with a tail; only `release done` closes it.
  const finishing = release?.state === 'code-accepted';
  // Review P1: while the lead finishes, the figure, its accessible value and
  // the ring stay below 100 together; only `release done` reaches 100.
  // Revision 9: a required release review not approved yet holds the release
  // below 100 too (the harness caps it; the panel never contradicts it).
  const review = releaseReviewOf(forecast);
  const waitsReview = releaseWaitsForReview(forecast);
  const shown = finishing || waitsReview ? Math.min(percent, 99) : percent;
  // Review P3: under the review cap the visible line and the accessible value
  // say the capped figure and why, never the harness's «100 %».
  const line =
    waitsReview && (shown < percent || /100\s?%/.test(p.line)) ? t.r11.cappedLine(shown) : p.line;
  // alpha.68: plan growth, the conditional figure, the infra share, the outline, the lead's stretch.
  const more = forecastAdditions(forecast);
  const finishMs = more.finishing
    ? sinceMs(more.finishing.elapsedMs, more.finishing.since, now)
    : undefined;
  // Never show a lead estimate the lead has already exceeded (P6-5).
  const leadOver =
    more.finishing?.exceeded === true ||
    (finishMs !== undefined &&
      forecast.time.lead !== undefined &&
      finishMs > forecast.time.lead.ms);
  const num = (x: number) =>
    new Intl.NumberFormat(lang === 'en' ? 'en' : 'ru', { maximumFractionDigits: 1 }).format(x);
  return (
    <Card data-testid="forecast" className="hui-forecast">
      <CardHeader>
        <CardTitle>{f.label}</CardTitle>
      </CardHeader>
      <CardContent className="hui:gap-4">
        <div className="hui:grid hui:grid-cols-1 hui:gap-6 hui:sm:grid-cols-2">
          <Tile
            title={f.release}
            testid="ring-release"
            ring={
              <Ring
                share={(finishing ? Math.min(shown, FINISH_RING_MAX) : shown) / 100}
                tone="ok"
                tail={finishing}
              />
            }
            center={f.percent(shown)}
            sub={release?.state === 'code-accepted' ? t.r6.codeAccepted : f.doneWord}
            valueNow={shown}
            valueText={f.releaseText(line)}
          >
            <p className="hui:font-medium" data-testid="release-line">
              {line}
            </p>
            {finishing ? (
              <p data-testid="release-finishing">
                {t.r10.leadFinishing}
                {finishMs !== undefined
                  ? ` (${t.r10.finishingFor(spanWords(finishMs, lang))})`
                  : ''}
              </p>
            ) : null}
            {more.conditional ? (
              <p className="hui:text-xs hui:text-muted-foreground" data-testid="release-if">
                {t.r10.conditional}
              </p>
            ) : null}
            {more.growth ? (
              <p className="hui:text-sm" data-testid="forecast-growth" data-by={more.growth.by}>
                {more.growth.line}
                {more.growth.reason ? (
                  <span className="hui:block hui:text-xs hui:text-muted-foreground">
                    {t.r10.growthWhy(more.growth.reason)}
                  </span>
                ) : null}
              </p>
            ) : null}
            {p.approved ? (
              <div className="hui:grid hui:gap-0.5" data-testid="forecast-figures">
                <span className="hui-sr">{t.r6.twoFigures}: </span>
                <span data-testid="figure-approved">
                  {t.r6.approvedFigure(
                    waitsReview ? Math.min(p.approved.percent, 99) : p.approved.percent,
                  )}
                </span>
                <span data-testid="figure-planned">
                  {t.r6.plannedFigure(waitsReview ? shown : p.percent)}
                </span>
                {p.planned ? (
                  <span className="hui:text-xs hui:text-muted-foreground">{p.planned.line}</span>
                ) : null}
              </div>
            ) : null}
            {release ? (
              <p data-testid="forecast-release" data-release={release.state}>
                <Badge
                  tone={
                    release.state === 'done'
                      ? 'ok'
                      : release.state === 'code-accepted'
                        ? 'warn'
                        : 'info'
                  }
                >
                  {knownLabel(t.r6.releaseState, release.state) ?? release.state}
                </Badge>{' '}
                {release.line !== knownLabel(t.r6.releaseState, release.state) ? (
                  <span className="hui:text-xs hui:text-muted-foreground">{release.line}</span>
                ) : null}
              </p>
            ) : null}
            {review ? (
              <ReleaseReview
                review={review}
                lang={lang}
                capped={waitsReview && (finishing || percent >= 99)}
              />
            ) : null}
            {p.lead ? (
              <details className="hui-term" data-testid="forecast-lead">
                <summary>
                  {t.r6.leadShare(
                    `${num(p.lead.weighted * 100)} %`,
                    `${num(p.lead.total * 100)} %`,
                  )}
                </summary>
                <ul className="hui:mt-1 hui:grid hui:list-none hui:gap-0.5 hui:text-start">
                  {p.lead.steps.map((x) => (
                    <li key={x.step} data-done={x.done ? '' : undefined}>
                      {x.done ? '✓ ' : '○ '}
                      {knownLabel(t.r6.leadStep, x.step) ?? x.step} —{' '}
                      {x.done ? t.r6.stepDone : t.r6.stepLeft}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
            <p className="hui:text-xs hui:text-muted-foreground">
              {p.basis === 'scope'
                ? f.basisScope
                : p.basis === 'works'
                  ? f.basisWorks
                  : f.basisOther(String(p.basis))}
            </p>
          </Tile>
          <Tile
            title={f.time}
            testid="ring-time"
            ring={<Ring share={time.share} band={time.band} tone="primary" />}
            center={time.center}
            sub={time.sub}
            valueNow={time.share === undefined ? undefined : Math.round(time.share * 100)}
            valueText={f.timeText(time.text)}
          >
            <p className="hui:font-medium" data-testid="time-line">
              {time.text}
            </p>
            {time.kind === 'unknown' ? (
              <p className="hui:text-xs hui:text-muted-foreground" data-testid="time-unknown">
                {f.leftUnknownWhy}
              </p>
            ) : time.kind === 'noElapsed' ? (
              <p className="hui:text-xs hui:text-muted-foreground" data-testid="time-unknown">
                {f.elapsedUnknownWhy}
              </p>
            ) : null}
            {time.kind !== 'unknown' && time.kind !== 'done' && time.rough ? (
              <p className="hui:text-xs hui:text-muted-foreground" data-testid="time-rough">
                {t.r5.roughWhy}
              </p>
            ) : null}
            {forecast.time.chain !== undefined &&
            forecast.time.chain > 0 &&
            time.kind !== 'done' ? (
              <p className="hui:text-xs hui:text-muted-foreground" data-testid="time-chain">
                {t.r6.chain(forecast.time.chain, num(forecast.time.chain))}
              </p>
            ) : null}
            {forecast.time.lead && !leadOver ? (
              <p className="hui:text-xs hui:text-muted-foreground" data-testid="time-lead">
                {forecast.time.lead.line}
              </p>
            ) : null}
            {more.outlineTime ? (
              <p className="hui:text-xs hui:text-muted-foreground" data-testid="time-outline">
                {more.outlineTime.line}
              </p>
            ) : null}
            {r && (time.kind === 'known' || time.kind === 'noElapsed') ? (
              <p className="hui:text-xs hui:text-muted-foreground">
                {f.basis(
                  r.samples,
                  String(r.attemptsPerTask).replace('.', lang === 'ru' ? ',' : '.'),
                )}
              </p>
            ) : null}
          </Tile>
        </div>
        {more.infraShare || more.outline ? (
          <ReleaseStages infra={more.infraShare} outline={more.outline} t={t} />
        ) : null}
        {added.length ? (
          <div className="hui:text-sm" data-testid="forecast-added">
            <p className="hui:font-medium">{t.r5.added}</p>
            <ul className="hui:mt-1 hui:grid hui:list-disc hui:gap-1 hui:ps-5">
              {added.map((a, i) => (
                <li key={a.key + i}>{a.line}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {works.length ? (
          <div className="hui:text-sm" data-testid="forecast-works">
            <p className="hui:font-medium">{t.r5.worksTitle}</p>
            <ul className="hui:mt-1 hui:grid hui:gap-2">
              {works.map((w) => {
                const pc = Math.max(0, Math.min(100, Math.round(w.percent)));
                return (
                  <li key={w.workId} className="hui:grid hui:gap-1" data-retry={w.retry}>
                    <span>{w.line}</span>
                    <Progress value={pc} max={100} label={w.line} className="hui:h-1.5" />
                  </li>
                );
              })}
            </ul>
            {truncatedWorks ? (
              <p className="hui:text-xs hui:text-muted-foreground">
                {t.r5.worksClipped(truncatedWorks)}
              </p>
            ) : null}
          </div>
        ) : null}
        <p
          className="hui:rounded-control hui:bg-muted hui:px-3 hui:py-2 hui:text-sm"
          data-testid="human-wait"
          data-status={wait.works ? 'blocked' : undefined}
        >
          {wait.works ? f.humanWait(wait.works, spanWords(waitMs, lang)) : f.noHumanWait}
        </p>
        <details className="hui-term" data-testid="forecast-assumptions">
          <summary>{t.whatItMeans}</summary>
          <ul className="hui:mt-1 hui:grid hui:list-disc hui:gap-1 hui:ps-5">
            {forecast.assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
          <p>{f.notPromise}</p>
          <p>{f.timeRing}</p>
          <p className="hui:text-muted-foreground">
            {f.harnessSays} {p.line}; {forecast.time.line}
          </p>
        </details>
      </CardContent>
    </Card>
  );
}

const STAGE_TONE: Record<string, string> = {
  infra: 'hui:bg-series-1',
  product: 'hui:bg-ok',
  deploy: 'hui:bg-wait',
  other: 'hui:bg-muted-foreground',
};

/**
 * The release by stages (alpha.68, P6-8/P6-9): the lead's outline, one row
 * per stage with the harness percent and whether its works are registered;
 * without an outline, when all works are infrastructure, the estimated infra
 * share against «продукт — ещё не спланирован»; and the hint that there is
 * no outline. Every number and line is the harness's.
 */
function ReleaseStages({
  infra,
  outline,
  t,
}: {
  infra: { share: number; line: string } | undefined;
  outline: { state: string; stages?: OutlineStageView[]; line: string } | undefined;
  t: Dict;
}) {
  const k = t.r10;
  const stages = outline?.state === 'recorded' ? (outline.stages ?? []) : [];
  const units = stages.reduce((n, s) => n + s.units, 0);
  const infraPct = infra ? Math.round(infra.share * 100) : 0;
  return (
    <div className="hui:grid hui:gap-2 hui:text-sm" data-testid="forecast-stages">
      <p className="hui:font-medium">{k.stagesTitle}</p>
      {stages.length && units > 0 ? (
        <>
          <div
            className="hui-stage-bar"
            role="img"
            aria-label={stages
              .map((s) =>
                k.stageRow(
                  s.title ?? label(k.stageKind, s.kind),
                  s.percent,
                  label(k.stageState, s.state),
                ),
              )
              .join('; ')}
          >
            {stages.map((s) => (
              <span
                key={s.id}
                className="hui-stage-seg"
                data-state={s.state}
                style={{ flexGrow: s.units, flexBasis: 0 }}
              >
                <span
                  className={'hui-stage-fill ' + (STAGE_TONE[s.kind] ?? STAGE_TONE.other)}
                  style={{ width: `${Math.max(0, Math.min(100, s.percent))}%` }}
                />
              </span>
            ))}
          </div>
          <ul className="hui:grid hui:list-none hui:gap-0.5">
            {stages.map((s) => (
              <li key={s.id} data-testid="forecast-stage" data-kind={s.kind} data-state={s.state}>
                {k.stageRow(
                  s.title ?? label(k.stageKind, s.kind),
                  s.percent,
                  label(k.stageState, s.state),
                )}
              </li>
            ))}
          </ul>
        </>
      ) : infra ? (
        <>
          <div className="hui-stage-bar" role="img" aria-label={infra.line}>
            <span className="hui-stage-seg" style={{ flexGrow: infraPct, flexBasis: 0 }}>
              <span className="hui-stage-fill hui:bg-series-1" style={{ width: '100%' }} />
            </span>
            <span
              className="hui-stage-seg"
              data-state="unregistered"
              style={{ flexGrow: 100 - infraPct, flexBasis: 0 }}
            />
          </div>
          <ul className="hui:grid hui:list-none hui:gap-0.5">
            <li data-testid="forecast-infra-share">{k.infraShare(infraPct)}</li>
            <li data-state="unregistered">{k.productUnplanned}</li>
          </ul>
          <p className="hui:text-xs hui:text-muted-foreground">{infra.line}</p>
        </>
      ) : null}
      {outline ? (
        <p
          className="hui:text-xs hui:text-muted-foreground"
          data-testid="forecast-outline"
          data-state={outline.state}
        >
          {outline.line}
        </p>
      ) : null}
    </div>
  );
}

/** Tone of the release review state: approved — ok, blocking findings — bad, else warn. */
const reviewTone = (r: ReleaseReviewView) =>
  r.status === 'approved'
    ? 'ok'
    : r.status === 'findings' && (r.blocking ?? 0) > 0
      ? 'bad'
      : r.status === 'not-run' && !r.required
        ? 'neutral'
        : 'warn';

/**
 * «Ревью выпуска» (revision 9, harness 0.1.0-alpha.69): the acceptance review
 * of the release — its state (не запускалось / устарело / замечания N /
 * одобрено), the round, whether `release done` waits for it, the release
 * base and the harness line. Every value is the harness's.
 */
export function ReleaseReview({
  review,
  lang = 'ru',
  capped = false,
}: {
  review: ReleaseReviewView;
  lang?: Lang;
  /** The code is accepted and only the review holds the release: say why it is not 100 %. */
  capped?: boolean;
}) {
  const r = dict(lang).r11;
  const state =
    review.status === 'findings'
      ? r.releaseFindings(review.open ?? review.blocking ?? 0, review.blocking)
      : (knownLabel(r.releaseReview, review.status) ?? review.status);
  const base = review.base
    ? r.releaseBase(
        review.base,
        review.baseSource ? (knownLabel(r.baseSource, review.baseSource) ?? review.baseSource) : '',
      )
    : undefined;
  return (
    <div
      className="hui-release-review hui:grid hui:gap-0.5 hui:rounded-md hui:border hui:border-border hui:p-2 hui:text-start"
      data-testid="release-review"
      data-status={review.status}
      data-required={review.required ? 'true' : 'false'}
    >
      <p className="hui:m-0">
        <span className="hui:font-medium">{r.releaseReviewTitle}:</span>{' '}
        <Badge tone={reviewTone(review)} data-testid="release-review-state">
          {state}
        </Badge>
        {review.round !== undefined ? (
          <span className="hui:text-xs hui:text-muted-foreground">
            {' '}
            · {r.releaseRound(review.round)}
          </span>
        ) : null}
      </p>
      {review.status !== 'approved' ? (
        <p className="hui:m-0 hui:text-sm" data-testid="release-review-required">
          {review.required ? r.releaseRequired : r.releaseAdvisory}
        </p>
      ) : null}
      {capped ? (
        <p className="hui:m-0 hui:text-sm" data-testid="release-review-capped">
          {r.releaseCapped}
        </p>
      ) : null}
      <p
        className="hui:m-0 hui:text-xs hui:text-muted-foreground"
        data-testid="release-review-line"
      >
        {review.line}
      </p>
      {base ? (
        <p
          className="hui:m-0 hui:text-xs hui:text-muted-foreground"
          data-testid="release-review-base"
        >
          {base}
        </p>
      ) : null}
    </div>
  );
}
