'use client';

import Link from 'next/link';
import { IconPlus } from '@/components/icons';

export function CreateQualifierButton() {
  return (
    <Link
      href="/golf/dashboard/qualifiers/new"
      className="inline-flex items-center justify-center gap-2 font-medium rounded-[10px] transition-all duration-200 active:scale-[0.98] bg-primary-600 text-white shadow-sm hover:bg-primary-700 hover:shadow-md hover:-tranwarm-y-0.5 active:shadow-sm px-5 py-2.5 text-sm"
    >
      <IconPlus size={18} />
      Create Qualifier
    </Link>
  );
}
