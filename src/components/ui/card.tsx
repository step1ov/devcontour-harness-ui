// Card (shadcn/ui, adapted): a bordered block on the panel surface. Every
// class carries the `hui:` prefix, so nothing styles the host page.
import type { HTMLAttributes } from 'react';
import { cn } from './cn.ts';

type Props = HTMLAttributes<HTMLElement> & { as?: 'section' | 'div' | 'article' | 'li' };

export function Card({ as: As = 'section', className, ...rest }: Props) {
  return (
    <As
      className={cn(
        'hui-card-ui hui:min-w-0 hui:rounded-panel hui:border hui:border-border hui:bg-card hui:text-card-foreground hui:shadow-card',
        className,
      )}
      {...rest}
    />
  );
}

export function CardHeader({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'hui:flex hui:flex-wrap hui:items-baseline hui:gap-x-3 hui:gap-y-1 hui:px-4 hui:pt-4 hui:pb-2',
        className,
      )}
      {...rest}
    />
  );
}

export function CardTitle({
  className,
  level = 3,
  ...rest
}: HTMLAttributes<HTMLHeadingElement> & { level?: 2 | 3 | 4 }) {
  const H = level === 2 ? 'h2' : level === 4 ? 'h4' : 'h3';
  return (
    <H
      className={cn('hui:m-0 hui:text-base hui:leading-snug hui:font-semibold', className)}
      {...rest}
    />
  );
}

export function CardDescription({ className, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('hui:m-0 hui:text-sm hui:text-muted-foreground', className)} {...rest} />;
}

export function CardContent({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('hui:grid hui:gap-3 hui:px-4 hui:pb-4', className)} {...rest} />;
}
