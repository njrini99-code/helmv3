import type { Metadata, Viewport } from 'next';
import { Playfair_Display, DM_Sans } from 'next/font/google';
import './globals.css';
// Client instrumentation is auto-loaded via instrumentation-client.ts
import { ToastContainer } from '@/components/ui/toast';
import { DatadogProvider } from '@/components/providers/DatadogProvider';
import { Analytics } from '@vercel/analytics/next';
import { AdminErrorHandler } from '@/components/providers/AdminErrorHandler';
import { ChunkLoadErrorHandler } from '@/components/providers/ChunkLoadErrorHandler';
import { CapacitorProvider } from '@/components/providers/CapacitorProvider';

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-serif',
  display: 'swap',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Helm Sports Labs',
    template: '%s | Helm Sports Labs',
  },
  description: 'The modern platform for athletic development and college recruiting. Connect players with coaches, track progress, and manage your athletic journey.',
  keywords: [
    'baseball recruiting',
    'golf recruiting',
    'college athletics',
    'sports recruiting platform',
    'athletic development',
    'player showcase',
    'college coaches',
    'recruiting software',
  ],
  authors: [{ name: 'Helm Sports Labs' }],
  creator: 'Helm Sports Labs',
  publisher: 'Helm Sports Labs',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://helmsportslabs.com'),
  icons: {
    icon: '/Helm-Logo-New-Main.png',
    apple: '/Helm-Logo-New-Main.png',
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'GolfHelm',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
  openGraph: {
    title: 'Helm Sports Labs',
    description: 'The modern platform for athletic development and college recruiting',
    type: 'website',
    locale: 'en_US',
    siteName: 'Helm Sports Labs',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Helm Sports Labs',
    description: 'The modern platform for athletic development and college recruiting',
    creator: '@helmlab',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

// Viewport settings - allows zoom for accessibility (WCAG 2.1 Level AA compliance)
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${playfair.variable} ${dmSans.variable}`} suppressHydrationWarning>
      <body className="font-sans antialiased" suppressHydrationWarning>
        <DatadogProvider>
          {children}
        </DatadogProvider>
        <ToastContainer />
        <Analytics />
        <AdminErrorHandler />
        <ChunkLoadErrorHandler />
        <CapacitorProvider />
      </body>
    </html>
  );
}
