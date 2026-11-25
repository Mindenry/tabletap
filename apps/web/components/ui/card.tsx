import * as React from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-lg border border-line bg-surface-raised', className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-start justify-between gap-4 px-5 pt-4', className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-[14px] font-semibold tracking-[-0.01em] text-ink', className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-[12.5px] text-muted', className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5', className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex items-center gap-2 border-t border-line px-5 py-3', className)} {...props} />
  );
}

export function Separator({ className }: { className?: string }) {
  return <div role="separator" className={cn('h-px w-full bg-line', className)} />;
}

/**
 * A metric cell for the horizontal metric band. The band owns the dividers, so
 * this component never draws its own card.
 */
export function StatCard({
  label,
  value,
  hint,
  tone = 'default',
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: 'default' | 'brand' | 'olive' | 'gold';
  className?: string;
}) {
  const toneClass = {
    default: 'text-ink',
    brand: 'text-brand',
    olive: 'text-olive',
    gold: 'text-gold',
  }[tone];
  return (
    <div className={cn('metric-cell', className)}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className={cn('money mt-2 text-[24px] font-medium leading-none sm:text-[27px]', toneClass)}>
        {value}
      </p>
      {hint ? <p className="mt-2 text-[11px] leading-snug text-muted">{hint}</p> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse-soft rounded-sm bg-paper-deep', className)} />;
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 border border-dashed border-line-strong bg-surface/60 px-6 py-14 text-center',
        className,
      )}
    >
      {icon ? <div className="text-muted-soft">{icon}</div> : null}
      <div className="space-y-1">
        <p className="font-display text-[19px] text-ink">{title}</p>
        {description ? <p className="mx-auto max-w-sm text-[12.5px] text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function InlineError({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" className="border border-danger/30 bg-danger-soft px-3 py-2 text-[12.5px] text-danger">
      {children}
    </div>
  );
}
