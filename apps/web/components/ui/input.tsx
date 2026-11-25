import * as React from 'react';
import { cn } from '@/lib/utils';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        'flex h-10 w-full rounded-md border border-line bg-surface-raised px-3 py-2 text-sm text-ink shadow-[0_1px_0_rgba(25,23,18,0.02)] transition-colors',
        'placeholder:text-muted/70 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15',
        'disabled:cursor-not-allowed disabled:bg-paper-deep disabled:text-muted',
        'aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/10',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'flex min-h-[84px] w-full rounded-md border border-line bg-surface-raised px-3 py-2 text-sm text-ink transition-colors',
      'placeholder:text-muted/70 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15',
      'disabled:cursor-not-allowed disabled:bg-paper-deep',
      className,
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'flex h-10 w-full appearance-none rounded-md border border-line bg-surface-raised px-3 pr-8 text-sm text-ink',
        'bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2712%27 height=%2712%27 viewBox=%270 0 12 12%27%3E%3Cpath d=%27M2.5 4.5 6 8l3.5-3.5%27 fill=%27none%27 stroke=%27%23726c5f%27 stroke-width=%271.4%27 stroke-linecap=%27round%27/%3E%3C/svg%3E")] bg-[position:right_0.7rem_center] bg-no-repeat',
        'focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15 disabled:bg-paper-deep',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = 'Select';

export function Label({
  className,
  children,
  hint,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement> & { hint?: string }) {
  return (
    <label
      className={cn(
        'flex items-baseline justify-between gap-2 text-[13px] font-medium text-ink-soft',
        className,
      )}
      {...props}
    >
      <span>{children}</span>
      {hint ? <span className="text-[11px] font-normal text-muted">{hint}</span> : null}
    </label>
  );
}

export function FieldError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-[12px] text-danger">
      {children}
    </p>
  );
}

export function Checkbox({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="checkbox"
      className={cn(
        'h-4 w-4 rounded border-line-strong text-brand accent-[var(--color-brand)] focus:ring-brand/20',
        className,
      )}
      {...props}
    />
  );
}
