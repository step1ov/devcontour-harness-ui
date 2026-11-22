// Tooltip (shadcn/ui API, adapted without a portal): the content shows on
// hover and on keyboard focus inside the trigger, styled by `.hui-tooltip`.
// No Radix dependency: the content is in the DOM next to its trigger and
// tied to it with `aria-describedby`, so a screen reader reads it with the
// trigger and a printed or zoomed page loses nothing. Escape is not needed:
// the content never covers the focused element.
import { useId, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn.ts';

export function Tooltip({
  content,
  children,
  className,
  side = 'top',
  decorative = false,
  ...rest
}: Omit<HTMLAttributes<HTMLSpanElement>, 'content'> & {
  /** What the tooltip says; the same words must be reachable without hovering. */
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom';
  /**
   * The trigger already carries the same words for assistive technology (a
   * visually hidden text): the tooltip is then for the mouse only and is
   * hidden from the accessibility tree, so nothing is read twice.
   */
  decorative?: boolean;
}) {
  const id = useId();
  return (
    <span
      className={cn('hui-tooltip-root', className)}
      {...(decorative ? {} : { 'aria-describedby': id })}
      {...rest}
    >
      {children}
      <span
        {...(decorative ? { 'aria-hidden': true } : { role: 'tooltip', id })}
        className="hui-tooltip"
        data-side={side}
      >
        {content}
      </span>
    </span>
  );
}
