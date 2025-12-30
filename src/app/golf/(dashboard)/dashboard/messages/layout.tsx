import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Messages | Helm Sports',
  description: 'Team communication and messaging for golf programs',
};

export default function MessagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
