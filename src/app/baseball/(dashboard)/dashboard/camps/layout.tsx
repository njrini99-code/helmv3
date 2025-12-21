import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Camps',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
