import type { Metadata, Viewport } from 'next';
import { Playfair_Display, DM_Sans } from 'next/font/google';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { fraunces, fragmentMono, spaceGrotesk } from '@/lib/fonts';
import './globals.css';
// Fairway design-system tokens (ADDITIVE — imported AFTER globals.css so it
// only introduces new --fw-* custom properties; it overrides nothing). The
// existing app's appearance is unchanged; only opted-in Fairway components and
// the `.fairway-ds` scope consume these tokens.
import '@/styles/design-tokens.css';
// Client instrumentation is auto-loaded via instrumentation-client.ts
import { Toaster } from '@/components/ui/sonner';
import { DatadogProvider } from '@/components/providers/DatadogProvider';
import { AdminErrorHandler } from '@/components/providers/AdminErrorHandler';
import { ChunkLoadErrorHandler } from '@/components/providers/ChunkLoadErrorHandler';
import { GlobalErrorHandlerSetup } from '@/components/providers/GlobalErrorHandlerSetup';
import { CapacitorProvider } from '@/components/providers/CapacitorProvider';
import { StaleDeploymentRecoveryScript } from '@/components/providers/StaleDeploymentRecoveryScript';
import { VercelAnalyticsProvider } from '@/components/providers/VercelAnalyticsProvider';
import { PostHogProvider } from '@/components/providers/PostHogProvider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeScript } from '@/components/golf/theme/ThemeScript';
import { MarketingAnimGate } from '@/components/landing/MarketingAnimGate';

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
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${GeistSans.variable} ${GeistMono.variable} ${playfair.variable} ${dmSans.variable} ${fraunces.variable} ${fragmentMono.variable} ${spaceGrotesk.variable}`}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
        <MarketingAnimGate />
        <meta name="x-deployment-id" content={process.env.VERCEL_DEPLOYMENT_ID ?? 'dev'} />
      </head>
      <body className="font-sans antialiased" suppressHydrationWarning>
        <StaleDeploymentRecoveryScript />
        <DatadogProvider>
          <TooltipProvider delayDuration={300} skipDelayDuration={150}>
            {children}
          </TooltipProvider>
        </DatadogProvider>
        <Toaster />
        <VercelAnalyticsProvider />
        <PostHogProvider />
        <AdminErrorHandler />
        <ChunkLoadErrorHandler />
        <GlobalErrorHandlerSetup />
        <CapacitorProvider />
      </body>
    </html>
  );
}
