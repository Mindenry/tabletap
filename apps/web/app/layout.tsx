import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { Toaster } from 'sonner';
import { PwaBridge } from '@/components/pwa-bridge';
import './globals.css';

/**
 * Fonts are vendored in ./fonts (SIL Open Font License) so builds never depend
 * on a network fetch. Latin and Thai subsets are separate families; the CSS
 * stack falls back per glyph, which mirrors Google's unicode-range splitting.
 */
const plexLatin = localFont({
  src: [
    { path: './fonts/plex-thai-latin-400.woff2', weight: '400', style: 'normal' },
    { path: './fonts/plex-thai-latin-500.woff2', weight: '500', style: 'normal' },
    { path: './fonts/plex-thai-latin-600.woff2', weight: '600', style: 'normal' },
    { path: './fonts/plex-thai-latin-700.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-plex-latin',
  display: 'swap',
  fallback: ['system-ui', 'Segoe UI', 'Helvetica Neue', 'Arial', 'sans-serif'],
});

const plexThai = localFont({
  src: [
    { path: './fonts/plex-thai-thai-400.woff2', weight: '400', style: 'normal' },
    { path: './fonts/plex-thai-thai-500.woff2', weight: '500', style: 'normal' },
    { path: './fonts/plex-thai-thai-600.woff2', weight: '600', style: 'normal' },
    { path: './fonts/plex-thai-thai-700.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-plex-thai',
  display: 'swap',
  fallback: ['Leelawadee UI', 'Tahoma', 'sans-serif'],
});

const fraunces = localFont({
  src: [{ path: './fonts/fraunces-latin-variable.woff2', weight: '400 700', style: 'normal' }],
  variable: '--font-fraunces',
  display: 'swap',
  fallback: ['Iowan Old Style', 'Palatino Linotype', 'Georgia', 'serif'],
});

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
  openGraph: {
    title: 'TableTap — restaurant operations, connected',
    description: 'QR ordering, kitchen display, POS and analytics for Thai restaurants.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#b4512c',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${plexLatin.variable} ${plexThai.variable} ${fraunces.variable}`}>
      <body>
        <noscript>
          <style>{`.reveal,.reveal-scale{opacity:1!important;transform:none!important;filter:none!important}`}</style>
        </noscript>
        {children}
        <PwaBridge />
        <Toaster
          position="bottom-right"
          closeButton
          toastOptions={{
            style: {
              background: '#16140f',
              color: '#f7f3ec',
              border: '1px solid #353128',
              borderRadius: '12px',
              fontSize: '13px',
              padding: '12px 14px',
              boxShadow: '0 18px 40px -18px rgba(0,0,0,0.6)',
            },
          }}
        />
      </body>
    </html>
  );
}
