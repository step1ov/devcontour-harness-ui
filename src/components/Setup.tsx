// The setup state (view revision 5, harness 0.1.0-alpha.65): the panel runs
// before the harness is set up in the project (`--repository`), and the
// harness answers with the setup document — `stage {name: setup, lines}` and
// `setup {waitingFor}`, without works, health or a forecast. The panel shows
// the harness lines («Идёт настройка harness», «Задач пока нет») and keeps
// reading; the normal screens replace this one as soon as an overview comes.
// Not an error: no refusal, no warning banner.
//
// Revision 7 (harness 0.1.0-alpha.67): `stage.progress` — the setup steps
// (profile, init, doctor, smoke, writer probe, gates on HEAD, connector)
// with their state and time, the setup time against a soft budget, and
// «превышен бюджет настройки» when setup runs longer. Its line is not one of
// `stage.lines`, so the block shows it itself.

import type { OperatorView, SetupView } from '../model/view.ts';
import { dict, label, type Lang } from '../model/dict.ts';
import { formatDuration } from '../model/format.ts';
import { formatWhen } from '../model/i18n.ts';
import {
  setupElapsed,
  setupProgressOf,
  setupStepTone,
  type SetupProgressRead,
} from '../model/setup.ts';
import { Alert } from './ui/alert.tsx';
import { Badge } from './ui/badge.tsx';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card.tsx';
import { StatusDot } from './ui/status-dot.tsx';

type Obj = Record<string, unknown>;
const isObject = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * The document has the overview lists the screens read (`works`, `health`,
 * `progress`…). A setup document, or anything a host passes before the
 * harness has a state, does not: the screens then show the setup state
 * instead of reading fields that are not there.
 */
export function hasOverview(view: unknown): view is OperatorView {
  return (
    isObject(view) &&
    Array.isArray(view.works) &&
    Array.isArray(view.questions) &&
    Array.isArray(view.escalations) &&
    Array.isArray(view.reviews) &&
    Array.isArray(view.drift) &&
    isObject(view.health) &&
    isObject(view.progress) &&
    isObject(view.history) &&
    isObject(view.settings)
  );
}

/** Harness stage lines of a document, when it carries any (strings only). */
export function stageLines(view: unknown): string[] {
  const stage = isObject(view) && isObject(view.stage) ? view.stage : undefined;
  const lines = stage && Array.isArray(stage.lines) ? stage.lines : [];
  return lines.filter((l): l is string => typeof l === 'string' && l.trim() !== '');
}

/** The overview says the project is still at the setup stage (no works yet). */
export function inSetup(view: unknown): boolean {
  return isObject(view) && isObject(view.stage) && view.stage.name === 'setup';
}

/**
 * The setup progress block (revision 7): the harness line, the time against
 * the budget, «превышен бюджет настройки» when over, and the steps with a
 * state dot each. `steps: false` keeps it to the line and the time (the note
 * above screens other than the overview). Nothing without `stage.progress`.
 */
export function SetupProgress({
  view,
  progress: given,
  lang = 'ru',
  now,
  timeZone,
  steps: withSteps = true,
}: {
  /** Any document with `stage.progress`; or pass `progress` read already. */
  view?: unknown;
  progress?: SetupProgressRead;
  lang?: Lang;
  /** The viewer's clock (ms): the elapsed time goes on from `since`. */
  now?: number;
  timeZone?: string;
  steps?: boolean;
}) {
  const p = given ?? setupProgressOf(view, lang);
  if (!p) return null;
  const d = dict(lang);
  const t = d.r7;
  const elapsed = setupElapsed(p, now);
  const since = p.since ? formatWhen(p.since, lang, timeZone, now) : undefined;
  return (
    <div
      className="hui-setup-progress hui:grid hui:gap-2"
      data-testid="setup-progress"
      data-over-budget={p.overBudget ? '' : undefined}
    >
      <div className="hui:flex hui:flex-wrap hui:items-center hui:gap-x-3 hui:gap-y-1">
        <h3 className="hui:m-0 hui:text-sm hui:font-semibold">{t.progressTitle}</h3>
        <span className="hui:text-sm" data-testid="setup-progress-time">
          {elapsed !== undefined ? t.elapsed(formatDuration(elapsed, lang)) : t.elapsedUnknown}
          {since ? ` (${t.since(since)})` : ''}
        </span>
        {p.budgetMs ? (
          <Badge tone={p.overBudget ? 'warn' : 'neutral'} data-testid="setup-budget">
            {t.budget(formatDuration(p.budgetMs, lang))}
          </Badge>
        ) : null}
      </div>
      {p.line ? (
        <p className="hui:m-0 hui:font-medium" data-testid="setup-progress-line">
          {p.line}
        </p>
      ) : null}
      {p.overBudget ? (
        <Alert tone="warn" role="note" data-testid="setup-over-budget">
          <strong>{t.overBudget}</strong>
          <span>{t.overBudgetWhy}</span>
        </Alert>
      ) : null}
      {withSteps ? (
        p.steps.length ? (
          <ol
            className="hui-setup-steps hui:m-0 hui:grid hui:list-none hui:gap-x-4 hui:gap-y-1 hui:p-0 hui:sm:grid-cols-2"
            aria-label={t.stepsTitle}
            data-testid="setup-steps"
          >
            {p.steps.map((s, i) => {
              const name = label(t.step, s.id);
              const state = label(t.stepState, s.state);
              const at = s.at ? formatWhen(s.at, lang, timeZone, now) : undefined;
              return (
                <li
                  key={s.id + i}
                  className="hui:flex hui:min-w-0 hui:items-baseline hui:gap-2 hui:text-sm"
                  data-testid="setup-step"
                  data-step={s.id}
                  data-state={s.state}
                >
                  <StatusDot tone={setupStepTone(s.state)} className="hui:translate-y-px" />
                  <span className="hui:min-w-0 hui:break-words">
                    {s.line ?? (
                      <>
                        {name}: {state}
                        {s.elapsedMs !== undefined ? `, ${formatDuration(s.elapsedMs, lang)}` : ''}
                      </>
                    )}
                    {/* The state in words for a reader of the harness line too. */}
                    {s.line ? <span className="hui-sr"> ({state})</span> : null}
                    {at ? (
                      <span className="hui:text-muted-foreground"> · {t.stepAt(at)}</span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="hui-muted hui:m-0">{t.noSteps}</p>
        )
      ) : null}
    </div>
  );
}

export function SetupScreen({
  view,
  lang = 'ru',
  now,
  timeZone,
}: {
  /** The setup document, or any document without the overview lists. */
  view: SetupView | OperatorView | unknown;
  lang?: Lang;
  /** The viewer's clock (ms) for the setup time; without it the harness figure. */
  now?: number;
  timeZone?: string;
}) {
  const t = dict(lang).r5;
  const lines = stageLines(view);
  // The harness lines in the view language; the panel's own words only when it sent none.
  const [title, ...rest] = lines.length ? lines : [t.setupTitle, t.noTasks];
  const setup = isObject(view) && isObject(view.setup) ? view.setup : undefined;
  const waiting = typeof setup?.waitingFor === 'string' ? setup.waitingFor : undefined;
  return (
    <section className="hui hui-setup hui:grid hui:gap-4" lang={lang} aria-label={t.setupTitle}>
      <Card data-testid="setup" data-waiting={waiting}>
        <CardHeader>
          <CardTitle>
            <span role="status">{title}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="hui:gap-2">
          {rest.map((l, i) => (
            <p key={i} className="hui:font-medium" data-testid="setup-line">
              {l}
            </p>
          ))}
          <p className="hui-muted" data-testid="setup-waiting">
            {waiting === 'project'
              ? t.waitProject
              : waiting === 'policy'
                ? t.waitPolicy
                : waiting !== undefined
                  ? t.waitOther(waiting)
                  : t.waitAny}
          </p>
          <SetupProgress view={view} lang={lang} now={now} timeZone={timeZone} />
          <p className="hui-muted">{t.setupReadOnly}</p>
        </CardContent>
      </Card>
    </section>
  );
}

/** The overview of a state without works (`stage.name: setup`): the harness lines as a note. */
export function SetupNote({
  view,
  lang = 'ru',
  now,
  timeZone,
  steps = true,
}: {
  view: OperatorView;
  lang?: Lang;
  now?: number;
  timeZone?: string;
  /** Revision 7: the setup steps too (the home); `false` — the line and the time only. */
  steps?: boolean;
}) {
  const t = dict(lang).r5;
  const lines = stageLines(view);
  return (
    <div className="hui hui-panel hui:grid hui:gap-2" data-testid="stage-setup" lang={lang}>
      <div role="status">
        {(lines.length ? lines : [t.setupTitle, t.noTasks]).map((l, i) => (
          <p key={i} className={i === 0 ? 'hui:font-medium' : undefined}>
            {l}
          </p>
        ))}
      </div>
      <SetupProgress view={view} lang={lang} now={now} timeZone={timeZone} steps={steps} />
    </div>
  );
}
