// Planned tasks (`planned[]`, view revision 6): «ещё не утверждена» cards on
// the Tasks screen and a short list on the Overview — the same split
// (`plannedSplit`) on both, so a task is listed once. A task that is also
// not ready in the run slice keeps its reason. Who approves the plan is said
// only from the policy (`settings.approvalMode`), never assumed.
import { dict, type Lang } from '../model/dict.ts';
import { workName } from '../model/steps.ts';
import type { PlannedItem } from '../model/tasks.ts';
import type { OperatorView } from '../model/view.ts';
import { Badge } from './ui/badge.tsx';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card.tsx';
import { Block, Codes } from './common.tsx';

/** Who approves the plan of a planned task, from the policy's approval mode. */
export function plannedApproval(
  view: Pick<OperatorView, 'settings'>,
  lang: Lang,
): string | undefined {
  const t = dict(lang);
  const mode = view.settings.approvalMode;
  return mode === 'operator'
    ? t.r6.plannedByOperator
    : mode === 'agent'
      ? t.r6.plannedByLead
      : undefined;
}

const nameOf = (p: PlannedItem['task']) => [p.key, p.title].filter(Boolean).join(' · ') || p.id;

export function PlannedBlock({
  view,
  items,
  lang = 'ru',
  compact = false,
  testid,
}: {
  view: OperatorView;
  items: PlannedItem[];
  lang?: Lang;
  /** The Overview's short list instead of cards. */
  compact?: boolean;
  testid: string;
}) {
  const t = dict(lang);
  const clipped = view.truncated?.planned ?? 0;
  if (!items.length && !clipped) return null;
  const approval = plannedApproval(view, lang);
  const body = (p: PlannedItem) => (
    <>
      <p>{p.task.line}</p>
      {p.notReady ? (
        <p data-testid="planned-not-ready">
          {t.r6.plannedNotReady(p.notReady.replace(/[.\s]+$/, ''))}
        </p>
      ) : null}
      {p.task.dependsOn?.length ? (
        <p className="hui-muted">
          {t.r6.plannedAfter(p.task.dependsOn.map((id) => workName(view, id)).join(', '))}
        </p>
      ) : null}
    </>
  );
  const intro = (
    <p className="hui-muted">
      {t.r6.plannedIntro}
      {approval ? ` ${approval}` : ''}
    </p>
  );
  if (compact)
    return (
      <div data-testid={testid}>
        <h4 className="hui:text-sm hui:font-semibold">
          {t.r6.plannedTitle(items.length + clipped)}
        </h4>
        {intro}
        <ul className="hui:mt-1 hui:grid hui:list-none hui:gap-1">
          {items.map((p) => (
            <li
              key={p.task.connector + ':' + p.task.id}
              className="hui:grid hui:gap-0.5 hui:text-sm"
            >
              <span className="hui:flex hui:flex-wrap hui:items-center hui:gap-2">
                <strong>{nameOf(p.task)}</strong>
                <Badge tone="outline">{t.r6.plannedBadge}</Badge>
              </span>
              <span className="hui:text-muted-foreground">{body(p)}</span>
            </li>
          ))}
        </ul>
        {clipped ? <p className="hui-muted">{t.r6.plannedClipped(clipped)}</p> : null}
      </div>
    );
  return (
    <Block t={t} title={t.r6.plannedTitle(items.length + clipped)} testid={testid}>
      {intro}
      <ul className="hui:grid hui:list-none hui:gap-3 hui:lg:grid-cols-2">
        {items.map((p) => (
          <Card
            as="li"
            key={p.task.connector + ':' + p.task.id}
            data-testid={`planned-${p.task.id}`}
          >
            <CardHeader>
              <CardTitle>{nameOf(p.task)}</CardTitle>
              <Badge tone="outline" data-testid="planned-badge">
                {t.r6.plannedBadge}
              </Badge>
            </CardHeader>
            <CardContent className="hui:gap-1 hui:text-sm">
              {body(p)}
              <Codes t={t} codes={[p.task.id, p.task.taskId, p.task.connector]} />
            </CardContent>
          </Card>
        ))}
      </ul>
      {clipped ? <p className="hui-muted">{t.r6.plannedClipped(clipped)}</p> : null}
    </Block>
  );
}
