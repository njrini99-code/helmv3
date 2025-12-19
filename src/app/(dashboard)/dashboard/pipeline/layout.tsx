import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Recruiting Pipeline',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
