import type { Metadata } from 'next';

// The page here is a client component and cannot export metadata, so its tab title lives in this layout.
export const metadata: Metadata = { title: 'Program' };

export default function ProgramLayout({ children }: { children: React.ReactNode }) {
  return children;
}
