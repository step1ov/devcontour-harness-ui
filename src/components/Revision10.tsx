// View revision 10 (harness 0.1.0-alpha.70) on the work card, the work
// detail and the release forecast: the second review pass of an attempt,
// the writer's proposals with the lead's decision, the failure-cause
// reference and the docs step of the release. Read-only: a proposal is
// accepted or rejected in the CLI (`harness proposal`), never here. Every
// value is the harness's; unknown codes of a later harness show as codes.

import { dict, knownLabel, type Dict, type Lang } from '../model/dict.ts';
import {
  failureReferenceAnchor,
  failureReferenceHref,
  type ProposalView,
  type ReleaseDocsView,
  type SecondPassView,
} from '../model/revision10.ts';
import { Badge, type Tone } from './ui/badge.tsx';
import { Tooltip } from './ui/tooltip.tsx';

/**
 * The second review pass of an attempt: what it refuted and whether it
 * lifted the rejection; the mode and what a second pass is — in the
 * tooltip, also read with the line by assistive technology.
 */
export function SecondPass({ pass, t }: { pass: SecondPassView; t: Dict }) {
  const r = t.r12;
  const text =
    pass.status === 'failed'
      ? r.secondPassFailed
      : r.secondPassRan(pass.refuted, pass.missed, pass.overturned === true);
  const mode = knownLabel(r.secondPassMode, pass.mode) ?? pass.mode;
  return (
    <Tooltip content={`${mode}. ${r.secondPassWhy}`} tabIndex={0}>
      <span
        className="hui-second-pass"
        data-testid="second-pass"
        data-status={pass.status}
        data-overturned={pass.overturned ? 'true' : undefined}
      >
        {text}
      </span>
    </Tooltip>
  );
}

const proposalTone = (s: string): Tone =>
  s === 'accepted' ? 'ok' : s === 'rejected' ? 'neutral' : s === 'proposed' ? 'warn' : 'outline';

/**
 * The writer's follow-up tasks and split proposals with the lead's decision
 * («ждёт ведущего», «принято», «отклонено»). Who decides is said once under
 * the list; the panel offers no button.
 */
export function ProposalsList({ proposals, t }: { proposals: ProposalView[]; t: Dict }) {
  if (!proposals.length) return null;
  const r = t.r12;
  return (
    <div className="hui-proposals hui:grid hui:gap-1" data-testid="proposals">
      <h4 className="hui:text-sm hui:font-semibold">{r.proposalsTitle(proposals.length)}</h4>
      <ul className="hui:grid hui:list-none hui:gap-1">
        {proposals.map((p) => (
          <li
            key={p.id}
            className="hui:flex hui:flex-wrap hui:items-center hui:gap-x-2 hui:gap-y-0.5"
            data-testid="proposal"
            data-kind={p.kind}
            data-status={p.status}
          >
            <Badge tone="outline">{knownLabel(r.proposalKind, p.kind) ?? p.kind}</Badge>
            {/* Without a title (the harness sends none for a split): the id. */}
            <span className="hui:min-w-0 hui:break-words">{p.title ?? p.id}</span>
            <span className="hui-muted">{r.proposalAttempt(p.attempt)}</span>
            <Badge tone={proposalTone(p.status)} data-testid="proposal-status">
              {knownLabel(r.proposalStatus, p.status) ?? p.status}
            </Badge>
          </li>
        ))}
      </ul>
      {proposals.some((p) => p.status === 'proposed') ? (
        <p className="hui-muted hui:text-xs" data-testid="proposals-who">
          {r.proposalsWho}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The failure-cause reference of the last failure as a link to the harness
 * document; anything but `docs/failure-causes.md#<anchor>` is not linked.
 */
export function FailureReference({ reference, t }: { reference: string | undefined; t: Dict }) {
  const href = failureReferenceHref(reference);
  if (!href) return null;
  return (
    <a
      className="hui-link"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="failure-reference"
      data-anchor={failureReferenceAnchor(reference)}
    >
      {t.r12.reference}
    </a>
  );
}

const docsTone = (d: ReleaseDocsView): Tone =>
  d.status === 'done'
    ? 'ok'
    : d.status === 'pending'
      ? 'info'
      : d.status === 'off'
        ? 'neutral'
        : d.mode === 'required'
          ? 'bad'
          : 'warn';

/**
 * «Документация выпуска» under the release review: the state in words, the
 * mode (required — the release waits; advisory — it does not), the docs
 * works, the roots they do not follow and the harness line.
 */
export function ReleaseDocs({
  docs,
  lang = 'ru',
  name = (id) => id,
}: {
  docs: ReleaseDocsView;
  lang?: Lang;
  /** A work's display name; the id by default. */
  name?: (id: string) => string;
}) {
  const r = dict(lang).r12;
  return (
    <div
      className="hui-release-docs hui:grid hui:gap-0.5 hui:rounded-md hui:border hui:border-border hui:p-2 hui:text-start"
      data-testid="release-docs"
      data-status={docs.status}
      data-mode={docs.mode}
    >
      <p className="hui:m-0">
        <span className="hui:font-medium">{r.docsTitle}:</span>{' '}
        <Badge tone={docsTone(docs)} data-testid="release-docs-state">
          {knownLabel(r.docsStatus, docs.status) ?? docs.status}
        </Badge>
      </p>
      {docs.status !== 'done' && docs.status !== 'off' ? (
        <p className="hui:m-0 hui:text-sm" data-testid="release-docs-mode">
          {knownLabel(r.docsMode, docs.mode) ?? docs.mode}
        </p>
      ) : null}
      {docs.works.length ? (
        <p className="hui:m-0 hui:text-sm" data-testid="release-docs-works">
          {r.docsWorks(docs.works.map(name).join(', '))}
        </p>
      ) : null}
      {docs.missingRoots?.length ? (
        <p className="hui:m-0 hui:text-sm" data-testid="release-docs-roots">
          {r.docsMissingRoots(docs.missingRoots.map(name).join(', '))}
        </p>
      ) : null}
      {docs.line ? (
        <p
          className="hui:m-0 hui:text-xs hui:text-muted-foreground"
          data-testid="release-docs-line"
        >
          {docs.line}
        </p>
      ) : null}
    </div>
  );
}
