import * as React from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-lg border border-line bg-surface-raised shadow-[0_1px_2px_rgba(25,23,18,0.03)]',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-start justify-between gap-4 px-5 pt-5', className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-[15px] font-semibold tracking-tight text-ink', className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-[13px] text-muted', className)} {...props} />;
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
    brand: 'text-brand-deep',
    olive: 'text-olive',
    gold: 'text-gold',
  }[tone];
  return (
    <Card className={cn('p-4 sm:p-5', className)}>
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted sm:text-[12px]">{label}</p>
      <p
        className={cn(
          'mt-2 text-[22px] font-semibold leading-none tracking-tight tabular sm:text-[26px]',
          toneClass,
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-2 text-[11px] leading-snug text-muted sm:text-[12px]">{hint}</p> : null}
    </Card>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse-soft rounded-md bg-paper-deep', className)} />;
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
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-line-strong bg-surface/60 px-6 py-14 text-center',
        className,
      )}
    >
      {icon ? <div className="text-muted">{icon}</div> : null}
      <div className="space-y-1">
        <p className="text-sm font-semibold text-ink">{title}</p>
        {description ? <p className="max-w-sm text-[13px] text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function InlineError({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-md border border-danger/25 bg-danger-soft px-3 py-2 text-[13px] text-danger"
    >
      {children}
    </div>
  );
}
