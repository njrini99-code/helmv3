import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Discover Colleges',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
