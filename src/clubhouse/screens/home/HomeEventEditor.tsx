'use client';

import { EventEditor, type EditorSeed } from '../calendar/editor';
import type { ChEventEditorInputs } from '../../data/event-editor-inputs';
// The editor's own looks, loaded with this chunk only when a coach opens it from Home (MAC-03); Calendar's route loads them itself.
import '../../styles/calendar.css';
import '../../styles/qualifiers.css';
import '../../styles/tournament-fields.css';

/** Calendar's event editor, opened on Home: the same sheet, writes and checks, with the week's events and roster it was given. */
export function HomeEventEditor({ seed, inputs, onClose, onSaved }: { seed: EditorSeed | null; inputs: ChEventEditorInputs; onClose: () => void; onSaved: () => void }) {
  return (
    <EventEditor
      seed={seed}
      onClose={onClose}
      onSaved={onSaved}
      events={inputs.events}
      people={inputs.people}
      peopleError={inputs.peopleError}
      timezone={inputs.timezone}
      today={inputs.today}
      nowHour={inputs.nowHour}
      tournamentsEnabled={inputs.tournamentsEnabled}
      teamId={inputs.teamId}
    />
  );
}
