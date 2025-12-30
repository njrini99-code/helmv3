import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'New Round | Helm Sports',
  description: 'Track your golf round shot-by-shot with comprehensive statistics including driving distance, approach accuracy, and putting performance',
};

export default function NewRoundLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
