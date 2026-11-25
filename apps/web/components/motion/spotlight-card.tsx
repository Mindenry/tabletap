'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Card with a pointer-following highlight. The effect is a single radial
 * gradient driven by CSS variables, so it stays cheap and works on touch.
 */
export function SpotlightCard({
  children,
  className,
  as: Tag = 'div',
}: {
  children: React.ReactNode;
  className?: string;
  as?: React.ElementType;
}) {
  const ref = React.useRef<HTMLElement | null>(null);

  function onPointerMove(event: React.PointerEvent<HTMLElement>) {
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    node.style.setProperty('--mx', `${event.clientX - rect.left}px`);
    node.style.setProperty('--my', `${event.clientY - rect.top}px`);
  }

  return (
    <Tag
      ref={ref as never}
      onPointerMove={onPointerMove}
      className={cn(
        'group/spot relative overflow-hidden rounded-lg border border-line bg-surface-raised transition-[border-color,box-shadow,transform] duration-500',
        'hover:-translate-y-1 hover:border-line-strong hover:shadow-[var(--shadow-lift)]',
        className,
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover/spot:opacity-100"
        style={{
          background:
            'radial-gradient(220px circle at var(--mx, 50%) var(--my, 50%), rgba(180,81,44,0.10), transparent 70%)',
        }}
      />
      <span className="relative">{children}</span>
    </Tag>
  );
}
