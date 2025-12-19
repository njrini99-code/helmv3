import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'College Interest',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
