// Table (shadcn/ui, adapted): a plain HTML table in the panel tokens. On a
// narrow screen the wrapper scrolls the table, never the page.
import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from './cn.ts';

export function Table({
  className,
  label,
  ...rest
}: HTMLAttributes<HTMLTableElement> & {
  /** Accessible name of the scroll region. */ label: string;
}) {
  return (
    // A focusable region: keyboard users can scroll a wide table (axe scrollable-region-focusable).
    <div className="hui-table-wrap" role="region" aria-label={label} tabIndex={0}>
      <table
        className={cn('hui:w-full hui:border-collapse hui:text-sm hui:caption-bottom', className)}
        {...rest}
      />
    </div>
  );
}

export function TableHeader({ className, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('hui:border-b hui:border-border', className)} {...rest} />;
}

export function TableBody({ className, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn(className)} {...rest} />;
}

export function TableRow({ className, ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn('hui:border-b hui:border-border hui:align-top hui:last:border-0', className)}
      {...rest}
    />
  );
}

export function TableHead({ className, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        'hui:px-2 hui:py-1.5 hui:text-start hui:text-xs hui:font-medium hui:text-muted-foreground',
        className,
      )}
      {...rest}
    />
  );
}

export function TableCell({ className, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('hui:px-2 hui:py-1.5', className)} {...rest} />;
}

export function TableCaption({ className, ...rest }: HTMLAttributes<HTMLTableCaptionElement>) {
  return (
    <caption
      className={cn('hui:mt-2 hui:text-start hui:text-xs hui:text-muted-foreground', className)}
      {...rest}
    />
  );
}
