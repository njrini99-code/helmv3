'use client';

import { Download } from 'lucide-react';
import { Button } from '@/components/fairway';

/**
 * BR-1303: the pack as a `.md` file with its JSON block. Built in the browser from the string the server rendered, so
 * nothing is fetched again and nothing is stored.
 */
export function DownloadPack({ markdown, fileName, code }: { markdown: string; fileName: string; code: string }) {
  return (
    <span data-br={code}>
      <Button
        variant="secondary"
        size="sm"
        leftIcon={<Download size={14} aria-hidden />}
        onClick={() => {
          const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
          const a = document.createElement('a');
          a.href = url;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 0);
        }}
      >
        Download .md
      </Button>
    </span>
  );
}
