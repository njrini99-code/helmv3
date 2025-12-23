import type { Metadata } from 'next';
import './globals.css';

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
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://helmlab.com'),
  icons: {
    icon: '/favicon.svg',
    apple: '/apple-touch-icon.png',
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">{children}</body>
    </html>
  );
}
