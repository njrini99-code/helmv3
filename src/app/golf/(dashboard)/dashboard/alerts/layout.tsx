import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Alerts | GolfHelm',
  description: 'View coaching alerts and notifications for your golf team.',
};

export default function AlertsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
