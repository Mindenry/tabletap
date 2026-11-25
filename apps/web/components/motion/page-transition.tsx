'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';

/** Fades and lifts page content on route change without blocking interaction. */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="page-enter">
      {children}
    </div>
  );
}
