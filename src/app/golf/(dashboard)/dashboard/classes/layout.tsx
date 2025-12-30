import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'My Classes | Helm Golf',
  description: 'View and manage your academic class schedule. Import schedules, add classes, and help coaches plan practices around your commitments.',
};

export default function ClassesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
