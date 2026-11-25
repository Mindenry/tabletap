import type { Metadata, Viewport } from 'next';
import { Toaster } from 'sonner';
import { PwaBridge } from '@/components/pwa-bridge';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'TableTap — restaurant operations, connected',
    template: '%s · TableTap',
  },
  description:
    'QR ordering, kitchen display, POS, billing, inventory and analytics for Thai restaurants. Built as a multi-tenant platform.',
  applicationName: 'TableTap',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'TableTap', statusBarStyle: 'default' },
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/icon.svg' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#b8532e',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>
        {children}
        <PwaBridge />
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: '#1a1814',
              color: '#f6f2ea',
              border: '1px solid #3a352b',
              borderRadius: '10px',
              fontSize: '13px',
            },
          }}
        />
      </body>
    </html>
  );
}
