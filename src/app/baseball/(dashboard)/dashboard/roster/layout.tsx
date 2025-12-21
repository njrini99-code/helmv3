import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Team Roster',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
