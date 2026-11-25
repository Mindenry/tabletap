'use client';

import * as React from 'react';

type TickerFormat = 'number' | 'currency' | 'decimal';

/**
 * Counts up to the target once it becomes visible. Reduced-motion users see the
 * final value immediately. Formatting is described with serializable props so a
 * Server Component can render this client component safely.
 */
export function NumberTicker({
  value,
  format = 'number',
  locale = 'th-TH',
  currency = 'THB',
  decimals = 0,
  duration = 900,
  className,
}: {
  value: number;
  format?: TickerFormat;
  locale?: string;
  currency?: string;
  decimals?: number;
  duration?: number;
  className?: string;
}) {
  const ref = React.useRef<HTMLSpanElement | null>(null);
  const [display, setDisplay] = React.useState(value);
  const started = React.useRef(false);

  const formatValue = React.useCallback(
    (input: number) => {
      if (format === 'currency') {
        return new Intl.NumberFormat(locale, {
          style: 'currency',
          currency,
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(input);
      }
      if (format === 'decimal') {
        return new Intl.NumberFormat(locale, {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        }).format(input);
      }
      return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.round(input));
    },
    [format, locale, currency, decimals],
  );

  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || value === 0) {
      setDisplay(value);
      return;
    }

    const run = () => {
      if (started.current) return;
      started.current = true;
      const start = performance.now();
      const tick = (now: number) => {
        const progress = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - progress, 4);
        setDisplay(value * eased);
        if (progress < 1) requestAnimationFrame(tick);
        else setDisplay(value);
      };
      requestAnimationFrame(tick);
    };

    if (typeof IntersectionObserver === 'undefined') {
      run();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          run();
          observer.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [value, duration]);

  return (
    <span ref={ref} className={className} aria-label={formatValue(value)}>
      {formatValue(display)}
    </span>
  );
}
