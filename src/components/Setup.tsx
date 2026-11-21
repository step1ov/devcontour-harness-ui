// The setup state (view revision 5, harness 0.1.0-alpha.65): the panel runs
// before the harness is set up in the project (`--repository`), and the
// harness answers with the setup document — `stage {name: setup, lines}` and
// `setup {waitingFor}`, without works, health or a forecast. The panel shows
// the harness lines («Идёт настройка harness», «Задач пока нет») and keeps
// reading; the normal screens replace this one as soon as an overview comes.
// Not an error: no refusal, no warning banner.

import type { OperatorView, SetupView } from '../model/view.ts';
import { dict, type Lang } from '../model/dict.ts';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card.tsx';

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

export function SetupScreen({
  view,
  lang = 'ru',
}: {
  /** The setup document, or any document without the overview lists. */
  view: SetupView | OperatorView | unknown;
  lang?: Lang;
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
          <p className="hui-muted">{t.setupReadOnly}</p>
        </CardContent>
      </Card>
    </section>
  );
}

/** The overview of a state without works (`stage.name: setup`): the harness lines as a note. */
export function SetupNote({ view, lang = 'ru' }: { view: OperatorView; lang?: Lang }) {
  const t = dict(lang).r5;
  const lines = stageLines(view);
  return (
    <div className="hui hui-panel" data-testid="stage-setup" role="status" lang={lang}>
      {(lines.length ? lines : [t.setupTitle, t.noTasks]).map((l, i) => (
        <p key={i} className={i === 0 ? 'hui:font-medium' : undefined}>
          {l}
        </p>
      ))}
    </div>
  );
}
