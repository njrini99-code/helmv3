import type { Metadata } from 'next';

// The page here is a client component and cannot export metadata, so its tab title lives in this layout.
export const metadata: Metadata = { title: 'Travel' };

export default function TravelLayout({ children }: { children: React.ReactNode }) {
  return children;
}
