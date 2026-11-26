import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DemoBanner } from '@/components/demo-banner';
import { serverApi } from '@/lib/api-server';
import { GuestMenu, type PublicItem } from './guest-menu';

export const dynamic = 'force-dynamic';

interface Landing {
  restaurant: { name: string; logoUrl: string | null; branch: string; currency: string; timezone: string };
  table: { id: string; number: string; name: string | null };
  session: { id: string; status: string } | null;
  menu: Array<{
    id: string;
    name: string;
    nameEn: string | null;
    slug: string;
    description: string | null;
    imageUrl: string | null;
    items: PublicItem[];
  }>;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ qrToken: string }>;
}): Promise<Metadata> {
  try {
    const { qrToken } = await params;
    const landing = await serverApi<Landing>(`/public/qr/${qrToken}`);
    return {
      title: `${landing.restaurant.name} · Table ${landing.table.number}`,
      description: `Order from ${landing.restaurant.name}, ${landing.restaurant.branch}.`,
    };
  } catch {
    return { title: 'Menu' };
  }
}

export default async function GuestMenuPage({ params }: { params: Promise<{ qrToken: string }> }) {
  const { qrToken } = await params;
  let landing: Landing;
  try {
    landing = await serverApi<Landing>(`/public/qr/${qrToken}`);
  } catch {
    notFound();
  }

  return (
    <>
      <GuestMenu
        token={qrToken}
        restaurant={landing.restaurant}
        table={landing.table}
        initialMenu={landing.menu}
      />
      <DemoBanner />
    </>
  );
}
