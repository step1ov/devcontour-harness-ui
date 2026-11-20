// Badge (shadcn/ui, adapted): a short status label. Tones map to the panel
// tokens; the text always says the state, the colour only repeats it.
import type { HTMLAttributes } from 'react';
import { cn } from './cn.ts';

export type Tone = 'neutral' | 'info' | 'ok' | 'warn' | 'bad' | 'outline';

const tones: Record<Tone, string> = {
  neutral: 'hui:bg-muted hui:text-foreground hui:border-transparent',
  info: 'hui:bg-muted hui:text-primary hui:border-transparent',
  ok: 'hui:bg-ok-soft hui:text-ok hui:border-transparent',
  warn: 'hui:bg-warn-soft hui:text-warn hui:border-transparent',
  bad: 'hui:bg-bad-soft hui:text-bad hui:border-transparent',
  outline: 'hui:bg-transparent hui:text-foreground hui:border-border',
};

export function Badge({
  tone = 'neutral',
  className,
  ...rest
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        'hui:inline-flex hui:max-w-full hui:items-center hui:gap-1 hui:rounded-full hui:border hui:px-2.5 hui:py-0.5 hui:text-xs hui:leading-5 hui:font-medium',
        tones[tone],
        className,
      )}
      {...rest}
    />
  );
}
