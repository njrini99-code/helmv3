import { notFound } from 'next/navigation';
import { ClubhouseFrame } from '@/clubhouse/shell/ClubhouseFrame';
import { PREVIEW_COACH, PREVIEW_SHELL } from '@/clubhouse/preview/fixtures';
import { ComponentGallery } from '@/clubhouse/preview/ComponentGallery';
import '@/clubhouse/styles/component-playground.css';

export default function ComponentGalleryPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <ClubhouseFrame userData={PREVIEW_COACH} shell={PREVIEW_SHELL} pathname="/golf/dashboard/settings" forceRebuilt><ComponentGallery /></ClubhouseFrame>;
}
