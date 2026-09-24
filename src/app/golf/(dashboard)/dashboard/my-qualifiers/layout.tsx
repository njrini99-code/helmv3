import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'My Qualifiers',
  description: 'View your qualifier entries, scores, and upcoming qualifying events.',
};

export default function MyQualifiersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
