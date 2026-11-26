import * as React from 'react';
import { cn } from '@/lib/utils';

const STATUS_TONES: Record<string, string> = {
  // generic
  ACTIVE: 'bg-success-soft text-success',
  INACTIVE: 'bg-paper-deep text-muted',
  ARCHIVED: 'bg-paper-deep text-muted',
  DEACTIVATED: 'bg-danger-soft text-danger',
  SUSPENDED: 'bg-danger-soft text-danger',
  CANCELLED: 'bg-danger-soft text-danger',
  TRIAL: 'bg-gold-soft text-gold',
  PAST_DUE: 'bg-warning-soft text-warning',
  EXPIRED: 'bg-paper-deep text-muted',
  REVOKED: 'bg-danger-soft text-danger',
  PENDING: 'bg-gold-soft text-gold',
  // tables
  AVAILABLE: 'bg-success-soft text-success',
  OCCUPIED: 'bg-brand-soft text-brand-deep',
  ORDERING: 'bg-brand-soft text-brand-deep',
  BILL_REQUESTED: 'bg-gold-soft text-gold',
  PAYMENT_PENDING: 'bg-olive-soft text-olive',
  CLEANING: 'bg-paper-deep text-muted',
  OPEN: 'bg-gold-soft text-gold',
  CLOSED: 'bg-paper-deep text-muted',
  // orders / kitchen
  ACCEPTED: 'bg-olive-soft text-olive',
  PREPARING: 'bg-gold-soft text-gold',
  READY: 'bg-success-soft text-success',
  SERVED: 'bg-paper-deep text-ink-soft',
  REJECTED: 'bg-danger-soft text-danger',
  // bills / payments
  DRAFT: 'bg-paper-deep text-muted',
  PARTIALLY_PAID: 'bg-gold-soft text-gold',
  PAID: 'bg-success-soft text-success',
  REFUNDED: 'bg-olive-soft text-olive',
  PARTIALLY_REFUNDED: 'bg-olive-soft text-olive',
  AWAITING_CONFIRMATION: 'bg-gold-soft text-gold',
  FAILED: 'bg-danger-soft text-danger',
  // requests / stock
  ACKNOWLEDGED: 'bg-gold-soft text-gold',
  IN_PROGRESS: 'bg-gold-soft text-gold',
  RESOLVED: 'bg-success-soft text-success',
  OPEN_REQUEST: 'bg-gold-soft text-gold',
  LOW: 'bg-danger-soft text-danger',
};

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: string;
  label?: string;
  className?: string;
}) {
  const tone = STATUS_TONES[status] ?? 'bg-paper-deep text-muted';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.04em]',
        tone,
        className,
      )}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {label ?? status.replace(/_/g, ' ').toLowerCase()}
    </span>
  );
}

export function Badge({
  children,
  variant = 'default',
  className,
}: {
  children: React.ReactNode;
  variant?: 'default' | 'brand' | 'olive' | 'gold' | 'outline';
  className?: string;
}) {
  const variants = {
    default: 'bg-paper-deep text-ink-soft',
    brand: 'bg-brand-soft text-brand-deep',
    olive: 'bg-olive-soft text-olive',
    gold: 'bg-gold-soft text-gold',
    outline: 'border border-line-strong text-muted',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10.5px] font-medium',
        variants[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
