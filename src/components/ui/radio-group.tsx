// Radio group (shadcn/ui over Radix RadioGroup): arrow keys move, Space picks.
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { cn } from './cn.ts';

export function RadioGroup<V extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: V;
  onChange: (v: V) => void;
  options: { value: V; label: string }[];
  label: string;
  className?: string;
}) {
  return (
    <RadioGroupPrimitive.Root
      value={value}
      onValueChange={(v) => onChange(v as V)}
      aria-label={label}
      className={cn('hui:flex hui:flex-wrap hui:gap-2', className)}
    >
      {options.map((o) => (
        <label
          key={o.value}
          className="hui:inline-flex hui:cursor-pointer hui:items-center hui:gap-2 hui:rounded-control hui:border hui:border-border hui:bg-card hui:px-3 hui:py-1.5 hui:text-sm"
        >
          <RadioGroupPrimitive.Item
            value={o.value}
            className="hui:flex hui:size-4 hui:shrink-0 hui:cursor-pointer hui:items-center hui:justify-center hui:rounded-full hui:border hui:border-muted-foreground hui:bg-card hui:p-0"
          >
            <RadioGroupPrimitive.Indicator className="hui:block hui:size-2 hui:rounded-full hui:bg-primary" />
          </RadioGroupPrimitive.Item>
          {o.label}
        </label>
      ))}
    </RadioGroupPrimitive.Root>
  );
}
