import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Development Plans',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
