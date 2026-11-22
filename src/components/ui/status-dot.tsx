// StatusDot (shadcn/ui-style variant component): a small coloured mark for a
// step state. The colour only repeats a word said next to it or in its
// accessible text; the shape tells a lead decision (diamond), a person's
// decision (bar) and an end (square) apart, and the state has its own mark
// (failed ✕, waiting ring, current ring, skipped outline) besides colour. `current` pulses unless the viewer asked for less
// motion (`prefers-reduced-motion`, styles.css).
import type { HTMLAttributes } from 'react';
import type { TrackTone } from '../../model/track.ts';
import { cn } from './cn.ts';

export type DotShape = 'round' | 'diamond' | 'square' | 'bar';

export function StatusDot({
  tone,
  shape = 'round',
  className,
  ...rest
}: HTMLAttributes<HTMLSpanElement> & { tone: TrackTone; shape?: DotShape }) {
  return (
    <span
      aria-hidden="true"
      className={cn('hui-dot', className)}
      data-tone={tone}
      data-shape={shape}
      {...rest}
    />
  );
}
