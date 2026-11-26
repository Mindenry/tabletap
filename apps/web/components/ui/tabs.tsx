'use client';

import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';

export const Tabs = TabsPrimitive.Root;

/**
 * A segmented control in the ledger language: one hairline frame, equal cells,
 * the active cell filled with ink. No floating pills, no shadows.
 */
export function TabsList({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn('inline-flex flex-wrap items-center border border-line bg-surface-raised', className)}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'border-r border-line px-3 py-1.5 text-[11.5px] font-medium text-ink-soft transition-colors last:border-r-0',
        'hover:bg-paper-deep hover:text-ink',
        'data-[state=active]:bg-ink data-[state=active]:text-paper data-[state=active]:hover:bg-ink',
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn('mt-4 focus:outline-none', className)} {...props} />;
}
