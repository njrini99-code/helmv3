import type { Metadata } from 'next';
import { JoinClient } from './join-client';
import '@/components/marketing/first-light/first-light.css';

export const metadata: Metadata = {
  title: 'Join your team | Helm Sports Labs',
  description: 'Enter your team invite code to join your program on Helm — golf or baseball.',
};

export default function JoinPage() {
  return <JoinClient />;
}
