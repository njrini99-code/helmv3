import { notFound } from 'next/navigation';
import { ComponentPlayground } from '@/clubhouse/preview/ComponentPlayground';
import '@/clubhouse/styles/tokens.css';
import '@/clubhouse/styles/base.css';
import '@/clubhouse/styles/ui.css';
import '@/clubhouse/styles/controls.css';
import '@/clubhouse/styles/component-playground.css';

export default function ComponentPlaygroundPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <ComponentPlayground />;
}
