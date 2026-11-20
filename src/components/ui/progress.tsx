// Progress (shadcn/ui over Radix Progress). `segments` draws a stacked bar
// (done, in work, …) inside one progressbar whose value is the first
// segment; the text next to it always carries the same numbers.
import * as ProgressPrimitive from '@radix-ui/react-progress';
import { cn } from './cn.ts';

export interface Segment {
  value: number;
  /** A `hui:bg-*` utility. */
  className: string;
}

export function Progress({
  value,
  max,
  segments,
  label,
  className,
}: {
  value: number;
  max: number;
  /** Extra segments drawn after the value (e.g. works in progress). */
  segments?: Segment[];
  /** Accessible name and value text («1 of 4 accepted»). */
  label: string;
  className?: string;
}) {
  const safeMax = max > 0 ? max : 1;
  const pct = (n: number) => `${Math.max(0, Math.min(100, (n / safeMax) * 100))}%`;
  return (
    <ProgressPrimitive.Root
      value={Math.max(0, Math.min(value, safeMax))}
      max={safeMax}
      aria-label={label}
      getValueLabel={() => label}
      className={cn(
        'hui:relative hui:flex hui:h-2.5 hui:w-full hui:overflow-hidden hui:rounded-full hui:bg-track',
        className,
      )}
    >
      <ProgressPrimitive.Indicator
        className="hui:h-full hui:bg-ok"
        style={{ width: pct(value), flex: 'none' }}
      />
      {segments?.map((s, i) => (
        <div
          key={i}
          aria-hidden="true"
          className={cn('hui:h-full', s.className)}
          style={{ width: pct(s.value), flex: 'none' }}
        />
      ))}
    </ProgressPrimitive.Root>
  );
}
