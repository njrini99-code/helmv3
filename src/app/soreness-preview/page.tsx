'use client';

// THROWAWAY preview route for visual QA of the Lift Lab soreness body map.
// DELETE after visual verification — not part of the product.

import { useState } from 'react';
import { SorenessBodyMap, type SorenessMapState } from '@/components/lifting/soreness';

export default function SorenessPreviewPage() {
  const [value, setValue] = useState<SorenessMapState>({
    right_shoulder: { severity: 6, tags: ['Tight', 'Sharp'], note: 'Felt it after long toss' },
    right_hip: { severity: 4, tags: [], note: '' },
  } as SorenessMapState);

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#FFFEFA',
        padding: '24px 20px',
        maxWidth: 430,
        margin: '0 auto',
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <p
          style={{
            letterSpacing: '0.18em',
            fontSize: 11,
            color: '#78716c',
            textTransform: 'uppercase',
            fontWeight: 600,
          }}
        >
          Helm Lifting Lab
        </p>
        <h1 style={{ fontSize: 28, fontWeight: 600, color: '#1c1917', margin: '4px 0' }}>
          Soreness Check
        </h1>
        <p style={{ fontSize: 13, color: '#78716c' }}>Due before 10:00 AM</p>
      </div>
      <SorenessBodyMap value={value} onChange={setValue} />
    </main>
  );
}
