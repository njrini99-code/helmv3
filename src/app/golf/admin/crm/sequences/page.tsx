'use client';

import { useState } from 'react';
import { IconArrowLeft } from '@/components/icons';
import { SequencesList } from '../components/sequences/SequencesList';
import { SequenceBuilder } from '../components/sequences/SequenceBuilder';

// ============================================================================
// /golf/admin/crm/sequences — operator UI for building and managing email
// sequences (drip campaigns). The orchestrator will add a "Sequences" tab to
// the main CRM page that links here.
//
// Layout: SequencesList up top; selecting a row renders <SequenceBuilder/>
// inline below.
// ============================================================================
export default function CrmSequencesPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="min-h-dvh bg-[#FFFEF8] p-6">
      <div className="mx-auto max-w-[1280px] space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-warm-500">
          <a
            href="/golf/admin/crm"
            className="flex items-center gap-1 text-warm-500 hover:text-warm-800 transition-colors"
          >
            <IconArrowLeft size={14} /> Back to CRM
          </a>
        </div>

        {/* Header */}
        <header>
          <h1 className="text-3xl font-bold text-warm-900">
            Sequences
          </h1>
          <p className="text-sm text-warm-600 mt-1 max-w-2xl">
            Build multi-step email campaigns. Each step fires after a
            configurable delay, and the system stops automatically when a
            recipient unsubscribes, bounces, or completes the sequence.
          </p>
        </header>

        {/* List */}
        <SequencesList
          selectedId={selectedId}
          onSelect={(id) => setSelectedId(id)}
          refreshKey={refreshKey}
        />

        {/* Inline builder for the selected sequence */}
        {selectedId && (
          <SequenceBuilder
            key={selectedId}
            sequenceId={selectedId}
            onChange={() => setRefreshKey((k) => k + 1)}
          />
        )}
      </div>
    </div>
  );
}
