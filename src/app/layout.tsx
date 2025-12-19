import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Helm Sports Labs',
    template: '%s | Helm Sports Labs',
  },
  description: 'The modern platform for athletic development and college recruiting',
  keywords: ['baseball', 'recruiting', 'college', 'athletics', 'sports'],
  authors: [{ name: 'Helm Sports Labs' }],
  icons: {
    icon: '/favicon.svg',
  },
  openGraph: {
    title: 'Helm Sports Labs',
    description: 'The modern platform for athletic development and college recruiting',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">{children}</body>
    </html>
  );
}
