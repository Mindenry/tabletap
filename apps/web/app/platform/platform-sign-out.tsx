'use client';

import { useRouter } from 'next/navigation';
import { clientApi } from '@/lib/api';

export function PlatformSignOut() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await clientApi('/auth/logout', { method: 'POST' }).catch(() => undefined);
        router.push('/login');
        router.refresh();
      }}
      className="rounded-md border border-white/15 px-2.5 py-1 text-[11px] text-[#e8e2d6] hover:bg-white/5"
    >
      Sign out
    </button>
  );
}
