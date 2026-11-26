'use client';

import * as React from 'react';
import { DEMO_MODE } from '@/lib/demo/config';
import { resetDemo } from '@/lib/demo/client';

/**
 * A small mark for the public demo. It sits above the app chrome and offers a
 * reset for the local guest state.
 */
export function DemoBanner() {
  const [reset, setReset] = React.useState(false);

  if (!DEMO_MODE) return null;

  return (
    <div className="fixed bottom-3 left-3 z-[80] flex items-center gap-2 rounded-full border border-white/15 bg-[#16130e]/95 px-3 py-1.5 text-[10px] text-[#f3ede2] shadow-lg backdrop-blur">
      <span className="font-semibold uppercase tracking-[0.16em] text-[#9a7733]">Demo</span>
      <span className="text-[#f3ede2]/70">sample data</span>
      <button
        type="button"
        onClick={() => {
          resetDemo();
          setReset(true);
          window.location.reload();
        }}
        className="underline underline-offset-2 transition-colors hover:text-[#9a7733]"
      >
        {reset ? 'Resetting…' : 'Reset'}
      </button>
    </div>
  );
}
