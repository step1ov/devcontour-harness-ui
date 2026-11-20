// The process of one attempt as a timeline: prepare → writing → checks →
// review → integration → acceptance, each with its state and duration
// (design §5.2). Review is one of the stages; its rounds stand next to it.

import { dict, label, type Dict, type Lang } from '../model/dict.ts';
import { formatDuration } from '../model/format.ts';
import type { TimelineStep } from '../model/tasks.ts';
import { Codes } from './common.tsx';
import { cn } from './ui/cn.ts';

const dot: Record<string, string> = {
  passed: 'hui:bg-ok hui:border-ok',
  failed: 'hui:bg-bad hui:border-bad',
  current: 'hui:bg-primary hui:border-primary',
  ahead: 'hui:bg-card hui:border-muted-foreground',
  skipped: 'hui:bg-track hui:border-track',
  next: 'hui:bg-card hui:border-muted-foreground',
  'not-needed': 'hui:bg-track hui:border-track',
  unknown: 'hui:bg-warn-soft hui:border-warn',
};

/**
 * A recorded harness stage in words: «хранилище зависимостей», «подготовка
 * зависимостей (prepare)», «проверка lint»; an unknown one as is.
 */
export function partName(t: Dict, stage: string): string | undefined {
  const p = t.timeline.part;
  if (Object.hasOwn(p.fixed, stage)) return p.fixed[stage]!;
  const at = (phase: string, text: string) =>
    phase === 'integration' ? p.atIntegration(text) : text;
  let m = /^(candidate|integration)-(test|recheck):(.+)$/.exec(stage);
  if (m) return at(m[1]!, m[2] === 'recheck' ? p.recheck(m[3]!) : p.check(m[3]!));
  m = /^(candidate|integration)-consumer:([^:]+):(.+)$/.exec(stage);
  if (m) return at(m[1]!, p.consumerCheck(m[3]!, m[2]!));
  m = /^(candidate|integration)-environment:(.+)$/.exec(stage);
  if (m) return at(m[1]!, environmentStep(t, m[2]!));
  m = /^integration-consumer-environment:([^:]+):(.+)$/.exec(stage);
  if (m) return p.atIntegration(p.inRepo(environmentStep(t, m[2]!), m[1]!));
  m = /^integration-prepare:(.+)$/.exec(stage);
  if (m) return p.atIntegration(p.inRepo(p.fixed.prepare!, m[1]!));
  m = /^(integration-)?generate:(.+)$/.exec(stage);
  if (m) return m[1] ? p.atIntegration(p.generate(m[2]!)) : p.generate(m[2]!);
  return undefined;
}

/** `setup`, `ready`, `cleanup`, `port-shared:3000` of an environment, in words. */
function environmentStep(t: Dict, step: string): string {
  const p = t.timeline.part;
  const port = /^port-shared:(.+)$/.exec(step);
  if (port) return p.port(port[1]!);
  return Object.hasOwn(p.environment, step) ? p.environment[step]! : p.environmentOther;
}

/** The name of a timeline stage; a newer stage is shown as the stage label or as is. */
export const stageName = (t: Dict, stage: string): string | undefined =>
  Object.hasOwn(t.timeline.stage, stage)
    ? t.timeline.stage[stage]!
    : Object.hasOwn(t.stage, stage)
      ? t.stage[stage]!
      : partName(t, stage);

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
      {steps.map((s, i) => {
        const state = label(t.timeline.state, s.state);
        const duration = s.durationMs !== undefined ? formatDuration(s.durationMs, lang) : '';
        return (
          <li
            key={i}
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
              <span className="hui:text-sm hui:font-medium">
                {stageName(t, s.stage) ?? t.timeline.part.other}
              </span>
              {stageName(t, s.stage) === undefined ? <Codes t={t} codes={[s.stage]} /> : null}
              <span className="hui:text-xs hui:text-muted-foreground">
                {state}
                {duration ? `, ${duration}` : ''}
              </span>
              {s.stage === 'review' && review ? (
                <span className="hui:text-xs hui:text-muted-foreground">{review}</span>
              ) : null}
              {s.parts && (s.parts.length > 1 || s.parts.some((p) => p.unused)) ? (
                <ul className="hui:mt-1 hui:grid hui:list-none hui:gap-0.5 hui:text-xs hui:text-muted-foreground">
                  {s.parts.map((p, j) => (
                    <li key={j} data-part={p.stage}>
                      {partName(t, p.stage) ?? t.timeline.part.other}
                      {': '}
                      {p.unused
                        ? t.timeline.unused
                        : label(
                            t.timeline.state,
                            p.outcome ?? (s.state === 'current' ? 'current' : 'unknown'),
                          )}
                      {p.durationMs !== undefined ? `, ${formatDuration(p.durationMs, lang)}` : ''}
                      {partName(t, p.stage) === undefined ? (
                        <Codes t={t} codes={[p.stage]} />
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
