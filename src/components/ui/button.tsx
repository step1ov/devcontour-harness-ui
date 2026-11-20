// Button (shadcn/ui, adapted). `asChild` renders the child element (a link)
// with the button look through Radix Slot.
import { Slot } from '@radix-ui/react-slot';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from './cn.ts';

type Variant = 'default' | 'outline' | 'ghost';

const variants: Record<Variant, string> = {
  default: 'hui:bg-primary hui:text-primary-foreground hui:border-transparent',
  outline: 'hui:bg-card hui:text-foreground hui:border-border hui:hover:bg-muted',
  ghost: 'hui:bg-transparent hui:text-foreground hui:border-transparent hui:hover:bg-muted',
};

export function Button({
  variant = 'default',
  asChild,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; asChild?: boolean }) {
  const C = asChild ? Slot : 'button';
  return (
    <C
      className={cn(
        'hui:inline-flex hui:min-h-9 hui:cursor-pointer hui:items-center hui:justify-center hui:gap-2 hui:rounded-control hui:border hui:px-3 hui:py-1.5 hui:text-sm hui:font-medium hui:no-underline',
        variants[variant],
        className,
      )}
      {...rest}
    />
  );
}
