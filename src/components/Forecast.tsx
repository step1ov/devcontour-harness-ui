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
import { dict, type Dict, type Lang } from '../model/dict.ts';
import { formatRough } from '../model/format.ts';
import { instantMs } from '../model/compat.ts';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card.tsx';

const SIZE = 120;
const STROKE = 12;
const R = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * R;

const clamp = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);

/** One ring: `share` filled solid, `band` (≥ share) a lighter range; no share = unknown. */
function Ring({
  share,
  band,
  tone,
}: {
  share: number | undefined;
  band?: number | undefined;
  tone: 'ok' | 'primary';
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
      {share !== undefined && share > 0 ? (
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap={share >= 1 ? 'butt' : 'round'}
          strokeDasharray={arc(share)}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          data-part="fill"
        />
      ) : null}
    </svg>
  );
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
  const t = dict(lang).forecast;
  const { remaining } = f.time;
  const elapsedMs = sinceMs(f.time.elapsedMs, f.time.startedAt, now);
  const elapsed = elapsedMs === undefined ? t.notStarted : t.elapsed(spanWords(elapsedMs, lang));
  if (f.progress.left === 0)
    return {
      kind: 'done' as const,
      share: 1,
      band: undefined,
      center: '✓',
      sub: t.nothingLeft,
      text: `${elapsed} · ${t.nothingLeft}`,
    };
  if (remaining && elapsedMs === undefined) {
    // A range without an elapsed time: the range stands; only the ring has no share to draw.
    const words = remainingWords(remaining, lang);
    return {
      kind: 'noElapsed' as const,
      share: undefined,
      band: undefined,
      center: words,
      sub: t.leftWord,
      text: `${t.elapsedUnknown} · ${t.left(words)}`,
    };
  }
  if (!remaining || elapsedMs === undefined)
    return {
      kind: 'unknown' as const,
      share: undefined,
      band: undefined,
      center: t.unknownMark,
      sub: t.unknownWord,
      text: `${elapsed} · ${t.leftUnknown}`,
    };
  const words = remainingWords(remaining, lang);
  // Geometry only: the elapsed part of elapsed + remaining (upper end solid, lower end the band).
  const whole = (left: number) => (elapsedMs + left > 0 ? elapsedMs / (elapsedMs + left) : 0);
  return {
    kind: 'known' as const,
    share: whole(remaining.hiMs),
    band: whole(remaining.loMs),
    center: words,
    sub: t.leftWord,
    text: `${elapsed} · ${t.left(words)}`,
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
}: {
  forecast: ForecastView;
  lang?: Lang;
  /** The viewer's clock (ms); elapsed and the wait go on from the harness's start points. */
  now?: number | undefined;
}) {
  const t: Dict = dict(lang);
  const f = t.forecast;
  const p = forecast.progress;
  const time = timeState(forecast, lang, now);
  const wait = forecast.time.humanWait;
  const waitMs = wait.works ? (sinceMs(wait.ms, wait.since, now) ?? wait.ms) : 0;
  const r = forecast.time.remaining;
  const percent = Math.max(0, Math.min(100, Math.round(p.percent)));
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
            ring={<Ring share={percent / 100} tone="ok" />}
            center={f.percent(percent)}
            sub={f.doneWord}
            valueNow={percent}
            valueText={f.releaseText(p.line)}
          >
            <p className="hui:font-medium" data-testid="release-line">
              {p.line}
            </p>
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
