import { describe, expect, it } from 'vitest';
import { typeAhead } from '../Menu';

function menu(labels: string[], disabled: string[] = []) {
  const list = document.createElement('div');
  const els = labels.map((l) => {
    const b = document.createElement('button');
    b.setAttribute('role', 'menuitem');
    const s = document.createElement('span');
    s.textContent = l;
    b.append(s);
    b.disabled = disabled.includes(l);
    list.append(b);
    return b;
  });
  return { list, els };
}

/** S7 (premium plan 2026-11-19): typing in a menu moves to the row that starts with what was typed. */
describe('menu type-ahead', () => {
  it('a letter goes to the next row that starts with it, and cycles', () => {
    const { list, els } = menu(['Handicap', 'Name', 'Rounds', 'Remove']);
    expect(typeAhead(list, els, -1, 'r', 0)?.textContent).toBe('Rounds');
    expect(typeAhead(list, els, 2, 'r', 1000)?.textContent).toBe('Remove');
    expect(typeAhead(list, els, 3, 'r', 2000)?.textContent).toBe('Rounds');
  });

  it('letters typed quickly build one prefix; a slow letter starts again', () => {
    const { list, els } = menu(['Rounds', 'Remove', 'Name']);
    expect(typeAhead(list, els, -1, 'r', 0)?.textContent).toBe('Rounds');
    expect(typeAhead(list, els, 0, 'e', 200)?.textContent).toBe('Remove');
    expect(typeAhead(list, els, 1, 'n', 2000)?.textContent).toBe('Name');
  });

  it('skips a disabled row and finds nothing for a letter no row starts with', () => {
    const { list, els } = menu(['Rounds', 'Remove'], ['Rounds']);
    expect(typeAhead(list, els, -1, 'r', 0)?.textContent).toBe('Remove');
    expect(typeAhead(list, els, 1, 'z', 5000)).toBeNull();
  });
});
