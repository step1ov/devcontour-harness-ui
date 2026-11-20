// Alert (shadcn/ui, adapted): a notice strip with a tone.
import type { HTMLAttributes } from 'react';
import { cn } from './cn.ts';

const tones = {
  info: 'hui:border-border hui:bg-card',
  warn: 'hui:border-transparent hui:bg-warn-soft hui:text-warn',
  bad: 'hui:border-transparent hui:bg-bad-soft hui:text-bad',
} as const;

export function Alert({
  tone = 'info',
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { tone?: keyof typeof tones }) {
  return (
    <div
      className={cn(
        'hui:flex hui:flex-wrap hui:items-center hui:gap-x-3 hui:gap-y-2 hui:rounded-control hui:border hui:px-3 hui:py-2 hui:text-sm',
        tones[tone],
        className,
      )}
      {...rest}
    />
  );
}
