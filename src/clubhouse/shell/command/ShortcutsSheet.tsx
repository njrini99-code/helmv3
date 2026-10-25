'use client';

import { Keyboard } from 'lucide-react';
import { isNativeApp } from '@/lib/utils/capacitor';
import type { ChRole } from '../nav';
import { Modal } from '../../ui/Modal';
import { Keys } from './Keys';
import { usePageKeysNow } from './page-keys';
import { digitFor, modKey, navLetters } from './shortcuts';

interface Row {
  label: string;
  keys: readonly string[];
}

/** The sheet behind `?`: every shortcut the layer has, grouped, with the platform's own modifier. */
export function ShortcutsSheet({ open, onClose, role, apple }: { open: boolean; onClose: () => void; role: ChRole; apple: boolean }) {
  const mod = modKey(apple);
  const general: Row[] = [
    { label: 'Open the command palette', keys: [mod, 'K'] },
    { label: 'Open Settings', keys: [mod, ','] },
    { label: 'Show these shortcuts', keys: ['?'] },
    { label: 'Search this page', keys: ['/'] },
    { label: 'Fold or open the sidebar', keys: [mod, '\\'] },
    { label: 'Open a row’s menu', keys: ['Shift', 'F10'] },
    { label: 'Close a dialog or menu', keys: ['Esc'] },
  ];
  const goTo = navLetters(role);
  // Drawn only once it is opened, so reading the platform here never differs from the server's HTML.
  const digits = isNativeApp();
  const here = usePageKeysNow();
  return (
    <Modal open={open} onClose={onClose} title="Keyboard shortcuts" description="They work anywhere except while you are typing." icon={Keyboard} width={600}>
      <div className="ch-cmd-sheet">
        <section aria-labelledby="ch-cmd-general">
          <h3 id="ch-cmd-general">Anywhere</h3>
          <dl className="ch-cmd-rows">
            {general.map((r) => (
              <div key={r.label} className="ch-cmd-row">
                <dt>{r.label}</dt>
                <dd>
                  <Keys keys={r.keys} />
                </dd>
              </div>
            ))}
          </dl>
        </section>
        <section aria-labelledby="ch-cmd-goto">
          <h3 id="ch-cmd-goto">Go to a section</h3>
          <dl className="ch-cmd-rows is-two">
            {goTo.map(({ letter, item }) => {
              // In the app, the first nine sidebar sections also answer Cmd or Ctrl and their digit (owner, decision 13); a
              // browser keeps those keys for its tabs, so the sheet doesn't offer them there.
              const digit = digits ? digitFor(role, item.id) : undefined;
              return (
                <div key={item.id} className="ch-cmd-row">
                  <dt>{item.label}</dt>
                  <dd>
                    <span className="ch-cmd-keys" aria-hidden="true">
                      <kbd className="ch-cmd-kbd">G</kbd>
                      <span className="ch-cmd-then">then</span>
                      <kbd className="ch-cmd-kbd">{letter.toUpperCase()}</kbd>
                      {digit !== undefined && (
                        <>
                          <span className="ch-cmd-then">or</span>
                          <kbd className="ch-cmd-kbd">{mod}</kbd>
                          <kbd className="ch-cmd-kbd">{digit}</kbd>
                        </>
                      )}
                    </span>
                  </dd>
                </div>
              );
            })}
          </dl>
        </section>
        {/* B11: the open screen's own keys, as it registered them (shell/command/page-keys.ts). */}
        {here && (
          <section aria-labelledby="ch-cmd-page">
            <h3 id="ch-cmd-page">On {here.page}</h3>
            <dl className="ch-cmd-rows">
              {here.keys.map((r) => (
                <div key={r.label} className="ch-cmd-row">
                  <dt>{r.label}</dt>
                  <dd>
                    <Keys keys={r.keys} />
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </div>
    </Modal>
  );
}
