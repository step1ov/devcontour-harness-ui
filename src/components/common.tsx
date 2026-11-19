// Shared pieces of the screens: glossary disclosures, work links, clocks,
// blocker and target lines. Every visible word comes from the dictionary.
// Lines that say "checked", "accepted" or "waiting/stopped" carry
// `data-status` so the markup test can find them and demand the how, the
// where and the who inside the same element (design §5.9).

import type { ReactNode } from 'react';
import { dict, label, type Dict, type GlossaryId, type Lang } from '../model/dict.ts';
import { formatClock, targetSentence } from '../model/i18n.ts';
import type { Actor, BlockerView, WorkView } from '../model/view.ts';

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
      <code className="hui-muted hui-code">{b.code}</code>
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
}: {
  w: Pick<WorkView, 'id' | 'target' | 'resultSha'>;
  lang: Lang;
  linkProps: Pick<ScreenProps, 'onOpenWork' | 'workHref'>;
  /** In-page link to the rows (work detail); otherwise the work link with `#verification`. */
  verificationHref?: string;
}) {
  const t = dict(lang);
  const where = w.target
    ? targetSentence(w.target, lang)
    : w.resultSha
      ? t.target.noTarget(w.resultSha)
      : t.target.noLocation;
  return (
    <div data-status="accepted" className="hui-accepted">
      <span>{where}</span>{' '}
      {verificationHref ? (
        <a className="hui-link" href={verificationHref}>
          {t.target.seeChecks}
        </a>
      ) : (
        <WorkRef id={w.id} suffix="#verification" {...linkProps}>
          {t.target.seeChecks}
        </WorkRef>
      )}
    </div>
  );
}

/** A note that a list was clipped by the projection. */
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
    const b = w.blockers[0];
    const reason = b
      ? b.plain && b.plain.trim()
        ? b.plain
        : t.blocker.noReason(b.code)
      : w.stage.needs
        ? w.stage.needs.action
        : t.blocker.stoppedNoReason;
    const actor = b ? b.actor : w.stage.needs ? w.stage.needs.actor : undefined;
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
