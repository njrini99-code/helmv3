import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Discover Players',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
