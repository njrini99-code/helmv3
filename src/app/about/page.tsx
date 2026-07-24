import type { Metadata } from 'next';
import AboutClient from './AboutClient';

// The About surface is interactive (demo modal, scroll effects), so the page
// body lives in AboutClient ('use client'); metadata must stay in this server
// wrapper — a client page cannot export it.
export const metadata: Metadata = {
  title: 'About — Helm Sports Labs',
  description:
    'Why we build coaching software for college golf: one coherent system for rounds, players, shots, and coaching intelligence, made by people who live the sport.',
  openGraph: {
    title: 'About — Helm Sports Labs',
    description:
      'Why we build coaching software for college golf: one coherent system for rounds, players, shots, and coaching intelligence.',
    type: 'website',
    url: '/about',
    images: [{ url: '/og/home.png', width: 1200, height: 630, alt: 'Helm Sports Labs' }],
  },
};

export default function AboutPage() {
  return <AboutClient />;
}
