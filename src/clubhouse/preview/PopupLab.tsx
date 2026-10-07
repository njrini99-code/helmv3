'use client';

import { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Menu } from '../ui/Menu';
import { Button } from '../ui/Button';
import { FormSheet, ListSheet, PickerSheet, ActionSheet } from '../screens/settings/phone/sheets';
import { RecFormSheet, RecPickSheet, RecActionSheet } from '../screens/recruiting/RecSheet';

const KINDS = [
  'Modal', 'FormSheet', 'ListSheet', 'PickerSheet', 'ActionSheet',
  'RecFormSheet', 'RecPickSheet', 'RecActionSheet',
] as const;
const LONG = 'PinehurstChampionshipInvitationalWithAnUnbrokenImportedCourseName';
/** Stress the real shared primitives without submitting data or changing app settings. */
export function PopupLab() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [kind, setKind] = useState<string | null>(null);
  const [stress, setStress] = useState(false);
  const close = () => setKind(null);
  const title = stress ? LONG : 'Popup layout check';
  const fields = (
    <>
      {Array.from({ length: stress ? 24 : 3 }, (_, i) => (
        <label className="ch-field" key={i}>
          <span>Field {i + 1}</span>
          <input className="ch-input" aria-label={`Field ${i + 1}`}
            defaultValue={stress ? LONG : 'Sample value'} />
        </label>
      ))}
    </>
  );
  const menu = (
    <Menu label="Nested actions"
      items={Array.from({ length: stress ? 20 : 3 }, (_, i) => ({ label: `Action ${i + 1}` }))}
      trigger={(props) => <button type="button" className="ch-btn" {...props}>Actions</button>} />
  );
  const message = stress ? LONG : 'Confirm this diagnostic action.';
  const options = Array.from({ length: stress ? 24 : 3 }, (_, i) => ({
    value: String(i),
    label: stress ? `${LONG} ${i + 1}` : `Option ${i + 1}`,
  }));
  return (
    <main className="ch-popup-lab" data-ready={ready}>
      <h1>Popup diagnostics</h1>
      <label>
        <input type="checkbox" checked={stress} onChange={(e) => setStress(e.target.checked)} />
        Long content
      </label>
      <div className="ch-popup-lab__actions">
        {KINDS.map((name) => (
          <Button key={name} onClick={() => setKind(name)}>{name}</Button>
        ))}
      </div>
      <Menu
        label="Page actions"
        items={Array.from({ length: 20 }, (_, i) => ({ label: `Action ${i + 1}` }))}
        trigger={(props) => <button type="button" className="ch-btn" {...props}>Tall menu</button>}
      />
      <Modal
        open={kind === 'Modal'} onClose={close} title={title}
        description={stress ? LONG : 'A labelled, scrollable popup.'}
        footer={<>
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" onClick={close}>Done</Button>
        </>}
      >
        {menu}{fields}
      </Modal>
      <FormSheet open={kind === 'FormSheet'} onClose={close} title={title} onAction={close} full>
        {menu}{fields}
      </FormSheet>
      <ListSheet
        open={kind === 'ListSheet'} onClose={close} title={title}
        subtitle={stress ? LONG : 'Choose a value'}
      >
        {menu}{fields}
      </ListSheet>
      <PickerSheet
        open={kind === 'PickerSheet'} onClose={close} title={title}
        options={options} value="0" onPick={close}
      />
      <ActionSheet
        open={kind === 'ActionSheet'} onClose={close} title={title} message={message}
        actions={[{ label: 'Confirm', onClick: close }]}
      />
      <RecFormSheet open={kind === 'RecFormSheet'} onClose={close} title={title} onAction={close}>
        {menu}{fields}
      </RecFormSheet>
      <RecPickSheet
        open={kind === 'RecPickSheet'} onClose={close} title={title}
        note={stress ? LONG : 'Changes in this fixture are local.'}
      >
        {menu}{fields}
      </RecPickSheet>
      <RecActionSheet
        open={kind === 'RecActionSheet'} onClose={close} title={title}
        message={message} actionLabel="Confirm" onAction={close}
      />
    </main>
  );
}
