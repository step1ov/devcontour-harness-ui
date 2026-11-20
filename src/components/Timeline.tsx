// The process of one attempt as a timeline: prepare → writing → checks →
// review → integration → acceptance, each with its state and duration
// (design §5.2). Review is one of the stages; its rounds stand next to it.

import { dict, label, type Dict, type Lang } from '../model/dict.ts';
import { formatDuration } from '../model/format.ts';
import type { TimelineStep } from '../model/tasks.ts';
import { cn } from './ui/cn.ts';

const dot: Record<string, string> = {
  passed: 'hui:bg-ok hui:border-ok',
  failed: 'hui:bg-bad hui:border-bad',
  current: 'hui:bg-primary hui:border-primary',
  ahead: 'hui:bg-card hui:border-muted-foreground',
  skipped: 'hui:bg-track hui:border-track',
  unknown: 'hui:bg-warn-soft hui:border-warn',
};

/** The name of a timeline stage; a newer stage is shown as the stage label or as is. */
export const stageName = (t: Dict, stage: string) =>
  Object.hasOwn(t.timeline.stage, stage) ? t.timeline.stage[stage]! : label(t.stage, stage);

export function Timeline({
  steps,
  lang,
  review,
  compact,
  testid,
}: {
  steps: TimelineStep[];
  lang: Lang;
  /** Text next to the review stage (rounds of the code review). */
  review?: string | undefined;
  /** One line per attempt (earlier attempts). */
  compact?: boolean;
  testid?: string;
}) {
  const t = dict(lang);
  return (
    <ol
      className={cn(
        'hui-timeline hui:grid hui:list-none hui:gap-2',
        compact ? 'hui:sm:grid-cols-6' : 'hui:sm:grid-cols-3 hui:lg:grid-cols-6',
      )}
      data-testid={testid}
    >
      {steps.map((s) => {
        const state = label(t.timeline.state, s.state);
        const duration = s.durationMs !== undefined ? formatDuration(s.durationMs, lang) : '';
        return (
          <li
            key={s.stage}
            data-state={s.state}
            className={cn(
              'hui:flex hui:min-w-0 hui:items-start hui:gap-2 hui:rounded-control hui:border hui:border-border hui:p-2',
              s.state === 'current' && 'hui:border-primary',
              s.state === 'skipped' && 'hui:opacity-80',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'hui:mt-1 hui:inline-block hui:size-3 hui:shrink-0 hui:rounded-full hui:border-2',
                dot[s.state] ?? dot.unknown,
              )}
            />
            <span className="hui:grid hui:min-w-0">
              <span className="hui:text-sm hui:font-medium">{stageName(t, s.stage)}</span>
              <span className="hui:text-xs hui:text-muted-foreground">
                {state}
                {duration ? `, ${duration}` : ''}
              </span>
              {s.stage === 'review' && review ? (
                <span className="hui:text-xs hui:text-muted-foreground">{review}</span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
