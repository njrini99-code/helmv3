import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Settings | Helm Golf',
  description: 'Manage your account settings, notifications, team preferences, and personal information.',
};

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
