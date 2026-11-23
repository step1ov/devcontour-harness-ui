// Shared pieces of the screens: glossary disclosures, work links, clocks,
// blocker and target lines. Every visible word comes from the dictionary.
// Lines that say "checked", "accepted" or "waiting/stopped" carry
// `data-status` so the markup test can find them and demand the how, the
// where and the who inside the same element (design §5.9).

import type { ReactNode } from 'react';
import { dict, knownLabel, label, type Dict, type GlossaryId, type Lang } from '../model/dict.ts';
import { attemptsLineParts } from '../model/steps.ts';
import { formatClock, remoteFreshness, targetSentence } from '../model/i18n.ts';
import { SLOT_STAGES, formatRange, formatRough } from '../model/format.ts';
import { scopeAbsence, stageLeft } from '../model/scope.ts';
import type {
  Actor,
  BlockerView,
  OperatorQuestion,
  OperatorView,
  WorkView,
} from '../model/view.ts';
import { Badge } from './ui/badge.tsx';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card.tsx';
import { cn } from './ui/cn.ts';

/** Props every screen takes. */
export interface ScreenProps {
  /** Panel language; Russian is first-class and the default. */
  lang?: Lang;
  /** IANA time zone for clocks; defaults to the viewer's. */
  timeZone?: string;
  /** Clock for elapsed times, epoch ms; defaults to the view's `generatedAt` (deterministic). */
  now?: number;
  /** Host navigation to a work order (a button); without it and `workHref`, ids are plain text. */
  onOpenWork?: (workId: string) => void;
  /** Link target of a work order (an anchor); wins over `onOpenWork`. */
  workHref?: (workId: string) => string;
}

/** «что это значит»: a `<details>` disclosure from the glossary (design §12). */
export function Term({ id, t, named }: { id: GlossaryId; t: Dict; named?: boolean }) {
  const g = t.glossary[id];
  return (
    <details className="hui-term">
      <summary>
        {named ? (
          <>
            {g.term}: {t.whatItMeans}
          </>
        ) : (
          <>
            {t.whatItMeans}
            <span className="hui-sr"> — {g.term}</span>
          </>
        )}
      </summary>
      <p>
        <strong>{g.term}</strong>: {g.meaning}
      </p>
    </details>
  );
}

/** Section heading with an optional glossary disclosure beside it. */
export function Heading({
  children,
  term,
  t,
  id,
  level = 3,
}: {
  children: ReactNode;
  term?: GlossaryId;
  t: Dict;
  id?: string;
  level?: 2 | 3;
}) {
  const H = level === 2 ? 'h2' : 'h3';
  return (
    <div className="hui-heading">
      <H className={level === 2 ? 'hui-title' : 'hui-subtitle'} id={id}>
        {children}
      </H>
      {term ? <Term id={term} t={t} /> : null}
    </div>
  );
}

export function WorkRef({
  id,
  onOpenWork,
  workHref,
  suffix,
  children,
}: Pick<ScreenProps, 'onOpenWork' | 'workHref'> & {
  id: string;
  /** Fragment appended to the link, e.g. `#verification`. */
  suffix?: string;
  children?: ReactNode;
}) {
  const text = children ?? <code>{id}</code>;
  if (workHref)
    return (
      <a className="hui-link" href={workHref(id) + (suffix ?? '')}>
        {text}
      </a>
    );
  if (onOpenWork)
    return (
      <button type="button" className="hui-link" onClick={() => onOpenWork(id)}>
        {text}
      </button>
    );
  return <>{text}</>;
}

/** Clock of an instant, or "unknown" — never a guess. */
export function clockOf(
  iso: string | undefined,
  t: Dict,
  timeZone?: string,
  nowMs?: number,
): string {
  if (iso === undefined) return t.unknown;
  return formatClock(iso, timeZone, nowMs) ?? t.unknown;
}

export const actorLabel = (t: Dict, actor: Actor | string | null | undefined): string =>
  actor === null || actor === undefined ? t.unknown : label(t.actor, String(actor));

/** One reason a work waits: the plain text or the code, and who acts. */
export function BlockerLine({ b, t }: { b: BlockerView; t: Dict }) {
  return (
    <li className="hui-item" data-status="blocked">
      <span>{b.plain && b.plain.trim() ? b.plain : t.blocker.noReason(b.code)}</span>
      {' — '}
      <span className="hui-who">
        {b.actor === null ? t.blocker.nobody : t.blocker.whoActs(actorLabel(t, b.actor))}
      </span>{' '}
      <Codes t={t} codes={[b.code]} />
    </li>
  );
}

/**
 * Where an accepted work is, with a link to its verification rows. Only for
 * works the harness reports as accepted (`stage.name: done` or a target).
 */
export function AcceptedLine({
  w,
  lang,
  linkProps,
  verificationHref,
  timeZone,
  now,
  explain = true,
}: {
  w: Pick<WorkView, 'id' | 'target' | 'resultSha' | 'restoredFrom' | 'restoredLine'>;
  lang: Lang;
  linkProps: Pick<ScreenProps, 'onOpenWork' | 'workHref'>;
  /** In-page link to the rows (work detail); otherwise the work link with `#verification`. */
  verificationHref?: string;
  timeZone?: string | undefined;
  /** Viewer's clock for the remote check time («вчера 14:02»), epoch ms. */
  now?: number | undefined;
  /** Show the «что это значит» disclosure of the remote line (once per list is enough). */
  explain?: boolean;
}) {
  const t = dict(lang);
  const where = w.target
    ? targetSentence(w.target, lang)
    : w.resultSha
      ? t.target.noTarget(w.resultSha)
      : t.target.noLocation;
  const fresh = w.target ? remoteFreshness(w.target, lang, timeZone, now) : undefined;
  return (
    <div data-status="accepted" className="hui-accepted">
      {w.restoredFrom || w.restoredLine ? (
        // Revision 6: a rework an older harness cancelled; the work stays accepted.
        <span className="hui:me-1 hui:block" data-testid="restored-line">
          <Badge tone="outline">{t.r6.restoredBadge}</Badge> {w.restoredLine ?? ''}
        </span>
      ) : null}
      <span data-testid="remote-line">{where}</span>{' '}
      {fresh ? (
        <span className="hui-muted" data-testid="remote-checked">
          {fresh}
        </span>
      ) : null}{' '}
      {verificationHref ? (
        <a className="hui-link" href={verificationHref}>
          {t.target.seeChecks}
        </a>
      ) : (
        <WorkRef id={w.id} suffix="#verification" {...linkProps}>
          {t.target.seeChecks}
        </WorkRef>
      )}
      {explain && w.target ? <Term id="remote" t={t} named /> : null}
    </div>
  );
}

/** A note that a list was clipped by the projection. */
/**
 * Why the view has no run slice to list: dropped for size, not read from the
 * tracker yet (`scopeReason: no-snapshot`), a slice without tasks, an
 * unreadable snapshot, a reason this panel does not know, an older empty
 * state (neutral words), or an older harness that does not report it.
 */
export function scopeMissingText(view: OperatorView, t: Dict): string {
  if (view.truncated?.scope) return t.r4.scopeDropped(view.truncated.scope);
  const absence = scopeAbsence(view);
  if (absence === 'not-read') return t.overview.scopeNotRead;
  if (absence === 'unreadable') return t.overview.scopeUnreadable;
  if (absence === 'empty') return t.overview.scopeEmpty;
  if (absence === 'unknown') return t.overview.scopeNone;
  if (absence === 'other') return t.overview.scopeAbsent(String(view.scopeReason));
  return t.overview.scopeMissing;
}

export function Clipped({ n, t }: { n: number | undefined; t: Dict }) {
  return n ? <p className="hui-muted hui-clipped">{t.listClipped(n)}</p> : null;
}

/**
 * A stage badge that keeps the wording rules: an accepted stage says where
 * the result is and links to its checks; a stopped or waiting-on-conditions
 * stage says why and who acts. Other stages are a plain badge.
 */
export function StageStatus({
  w,
  lang,
  linkProps,
  verificationHref,
}: {
  w: Pick<WorkView, 'id' | 'stage' | 'blockers' | 'target'>;
  lang: Lang;
  linkProps: Pick<ScreenProps, 'onOpenWork' | 'workHref'>;
  verificationHref?: string;
}) {
  const t = dict(lang);
  const name = w.stage.name;
  const text = label(t.stage, name);
  if (name === 'done') {
    const remote = w.target
      ? Object.hasOwn(t.target.short, w.target.remote.state)
        ? t.target.short[w.target.remote.state]!
        : t.target.shortUnknown
      : t.target.shortUnknown;
    return (
      <span className="hui-badge hui-status" data-status="accepted">
        {text}; {remote};{' '}
        {verificationHref ? (
          <a className="hui-link" href={verificationHref}>
            {t.target.seeChecks}
          </a>
        ) : (
          <WorkRef id={w.id} suffix="#verification" {...linkProps}>
            {t.target.seeChecks}
          </WorkRef>
        )}
      </span>
    );
  }
  if (name === 'stopped' || name === 'blocked') {
    // The reason that names someone first; a stage need names who acts when
    // the reasons name nobody — never "nobody" while the view names someone.
    const named = w.blockers.find((x) => x.actor !== null);
    const b = named ?? w.blockers[0];
    const reason = b
      ? b.plain && b.plain.trim()
        ? b.plain
        : t.blocker.noReason(b.code)
      : w.stage.needs
        ? label(t.action, w.stage.needs.action)
        : t.blocker.stoppedNoReason;
    const needs = w.stage.needs && w.stage.needs.actor !== null ? w.stage.needs.actor : undefined;
    const actor = named ? named.actor : needs !== undefined ? needs : b ? b.actor : undefined;
    const who =
      actor === null
        ? t.blocker.nobody
        : actor === undefined
          ? t.blocker.whoActs(t.unknown)
          : t.blocker.whoActs(actorLabel(t, actor));
    return (
      <span className="hui-badge hui-status hui-warn" data-status="blocked">
        {text}: {reason} — <span className="hui-who">{who}</span>
      </span>
    );
  }
  return <span className="hui-badge">{text}</span>;
}

/**
 * Who answered a question and on what grounds: the harness line
 * (`answerBasis.line`, «ответил ведущий (технический вопрос): <причина>»)
 * with the answer time. A view without `answerBasis` (harness alpha.55)
 * names only who answered, when it says so; nothing is shown otherwise.
 */
export function AnswerBasisLine({
  q,
  t,
  timeZone,
  now,
}: {
  q: Pick<OperatorQuestion, 'answerBasis' | 'answeredBy'>;
  t: Dict;
  timeZone?: string | undefined;
  now?: number | undefined;
}) {
  const b = q.answerBasis;
  if (b)
    return (
      <div className="hui-muted" data-testid="answer-basis">
        {t.question.basis(
          clockOf(b.at, t, timeZone, now),
          b.line.trim() ? b.line : t.question.answeredBy(actorLabel(t, b.by)),
        )}
      </div>
    );
  if (q.answeredBy)
    return (
      <div className="hui-muted" data-testid="answer-basis">
        {t.question.answeredBy(actorLabel(t, q.answeredBy))}
      </div>
    );
  return null;
}

/**
 * The harness attempts line with its failure groups in plain words
 * («incomplete 2» → «работа не доделана 2»); a group this build does not
 * know stays as its key in a code tag.
 */
export function AttemptsText({ line, t }: { line: string; t: Dict }) {
  return (
    <>
      {attemptsLineParts(line).map((p, i) => {
        if ('text' in p) return <span key={i}>{p.text}</span>;
        const known = knownLabel(t.bucket, p.bucket);
        return (
          <span key={i} data-bucket={p.bucket}>
            {known ?? <code>{p.bucket}</code>} {p.count}
          </span>
        );
      })}
    </>
  );
}

/**
 * A section of a screen as a card: a title with an optional glossary
 * disclosure, and the content. `testid` names it for tests.
 */
export function Block({
  title,
  term,
  t,
  testid,
  id,
  className,
  aside,
  children,
}: {
  title: ReactNode;
  term?: GlossaryId;
  t: Dict;
  testid?: string;
  id?: string;
  className?: string;
  /** Short text at the end of the header line (a count, a time). */
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card data-testid={testid} className={cn('hui-block', className)}>
      <CardHeader>
        <CardTitle id={id}>{title}</CardTitle>
        {aside ? <span className="hui:text-sm hui:text-muted-foreground">{aside}</span> : null}
        {term ? <Term id={term} t={t} /> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/**
 * Technical codes behind a plain line (F-AA): never in the main text, only
 * inside the «подробности» disclosure.
 */
export function Codes({ t, codes }: { t: Dict; codes: (string | undefined)[] }) {
  const list = [...new Set(codes.filter((c): c is string => Boolean(c)))];
  if (!list.length) return null;
  return (
    <details className="hui-term hui-codes" data-testid="codes">
      <summary>{t.overview.details}</summary>
      <p>
        {list.map((c, i) => (
          <span key={c}>
            {i ? ', ' : ''}
            <code>{c}</code>
          </span>
        ))}
      </p>
    </details>
  );
}

/** Rough time of one work for the scope list: the rest of its stage, or one usual attempt. */
export function WorkEta({
  w,
  t,
  lang,
  clock,
  average,
  forecast,
}: {
  w: WorkView;
  t: Dict;
  lang: Lang;
  clock: number;
  average: { ms: number } | undefined;
  /**
   * The view has the harness forecast (revision 4): the panel's own attempt
   * average (the alpha.4 exception until P11) is not shown for waiting works.
   */
  forecast?: boolean;
}) {
  const e = t.eta;
  let text: string | undefined;
  if (w.stage.name === 'done' || w.target !== undefined || w.stage.name === 'cancelled')
    text = undefined;
  else if (SLOT_STAGES.has(w.stage.name)) {
    const left = stageLeft(w, clock);
    text = left
      ? left.kind === 'over'
        ? e.stageOver(formatRough(left.usualMaxMs, lang))
        : e.stageLeft(formatRange(left.range, lang))
      : e.stageUnknown;
  } else if (forecast) text = undefined;
  else text = average ? e.attempt(formatRough(average.ms, lang)) : e.unknown;
  return text ? (
    <span className="hui:text-xs hui:text-muted-foreground" data-testid="work-eta">
      {text}
    </span>
  ) : null;
}

/** «Этап, скорее всего, закончится через 2–9 мин» for a running work. */
export function StageLeftLine({
  w,
  t,
  lang,
  clock,
}: {
  w: WorkView;
  t: Dict;
  lang: Lang;
  clock: number;
}) {
  const left = stageLeft(w, clock);
  if (!left) return null;
  return (
    <div className="hui:text-sm" data-testid="stage-left">
      {left.kind === 'over'
        ? t.eta.stageOver(formatRough(left.usualMaxMs, lang))
        : t.eta.stageLeft(formatRange(left.range, lang))}
    </div>
  );
}

/**
 * The rest of a writer question in revision 4 (harness alpha.60): its answer
 * options with the recommended one, the writer's rationale, and where the
 * applied answer is (`line`). Nothing for an older document.
 */
export function QuestionExtras({
  q,
  t,
}: {
  q: Pick<OperatorQuestion, 'options' | 'rationale' | 'line'>;
  t: Dict;
}) {
  const r = t.r4;
  return (
    <>
      {q.options?.length ? (
        <div data-testid="question-options">
          <p className="hui:mt-1">{r.options}</p>
          <ul className="hui:mt-1 hui:grid hui:list-disc hui:gap-1 hui:ps-5">
            {q.options.map((o) => (
              <li key={o.id} data-recommended={o.recommended ? 'true' : undefined}>
                {o.label.trim() || o.id}
                {o.recommended ? (
                  <span className="hui:ms-2 hui:rounded-full hui:bg-ok-soft hui:px-2 hui:text-xs hui:font-medium hui:text-ok">
                    {r.recommended}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {q.rationale?.trim() ? (
        <p className="hui:mt-1" data-testid="question-rationale">
          {r.rationale} {q.rationale}
        </p>
      ) : null}
      {q.line?.trim() ? (
        <p className="hui-muted hui:mt-1" data-testid="question-line">
          {q.line}
        </p>
      ) : null}
    </>
  );
}

/** A link only to an http(s) page of the task tracker; anything else is shown as text. */
export function safeHttpUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Revision 7 (harness alpha.67): «инфраструктура» on a harness infrastructure
 * work (`kind: 'infra'`); nothing for a product work or an older harness.
 * Otherwise such a work is a normal task.
 */
export function InfraBadge({ kind, lang = 'ru' }: { kind?: string; lang?: Lang }) {
  if (kind !== 'infra') return null;
  const r7 = dict(lang).r7;
  return (
    <Badge tone="outline" data-testid="infra-badge" title={r7.infraWhy}>
      {r7.infraBadge}
    </Badge>
  );
}
