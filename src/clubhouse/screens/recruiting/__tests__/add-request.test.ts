import { describe, expect, it } from 'vitest';
import { addIdentity, addRequestFor, type ChAddAttempt } from '../add-request';

/**
 * P014 CH-14915: the request id an Add sends. A field corrected after a lost reply used to be a new id, so the server
 * added the prospect a second time; it is now the same prospect, and only another name or another opening is new.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ids = () => {
  let n = 0;
  return () => `id-${++n}`;
};

describe('addRequestFor (CH-14915)', () => {
  it('the first Add gets a fresh version 4 UUID', () => {
    expect(addRequestFor(null, 1, { first_name: 'Ellie' }).id).toMatch(UUID);
  });

  it('Retry and Save pressed again keep the id', () => {
    const make = ids();
    const a = addRequestFor(null, 1, { first_name: 'Ellie', last_name: 'Morrow' }, make);
    expect(addRequestFor(a, 1, { first_name: 'Ellie', last_name: 'Morrow' }, make).id).toBe('id-1');
  });

  it('a field corrected after a lost reply keeps the id: it is the same prospect', () => {
    const make = ids();
    const a = addRequestFor(null, 1, { first_name: 'Ellie', last_name: 'Morrow' }, make);
    const corrected = { first_name: 'Ellie', last_name: 'Morrow', hometown: 'Wilmington', email: 'ellie@example.com', hs_class: 2027 };
    expect(addRequestFor(a, 1, corrected, make).id).toBe('id-1');
  });

  it('the name spaced or capitalised differently is the same prospect', () => {
    const make = ids();
    const a = addRequestFor(null, 1, { first_name: 'ellie', last_name: 'morrow ' }, make);
    expect(addRequestFor(a, 1, { first_name: ' Ellie', last_name: 'Morrow' }, make).id).toBe('id-1');
    expect(addIdentity({ first_name: 'Ellie', last_name: null })).toBe(addIdentity({ first_name: 'Ellie', last_name: '  ' }));
  });

  it('another name is another prospect and gets a new id', () => {
    const make = ids();
    let a: ChAddAttempt = addRequestFor(null, 1, { first_name: 'Ellie', last_name: 'Morrow' }, make);
    a = addRequestFor(a, 1, { first_name: 'Owen', last_name: 'Morrow' }, make);
    expect(a.id).toBe('id-2');
    a = addRequestFor(a, 1, { first_name: 'Owen', last_name: 'Park' }, make);
    expect(a.id).toBe('id-3');
  });

  it('another opening of the form (after an Add landed) gets a new id, even for the same name', () => {
    const make = ids();
    const a = addRequestFor(null, 1, { first_name: 'Ellie' }, make);
    expect(addRequestFor(a, 2, { first_name: 'Ellie' }, make).id).toBe('id-2');
  });
});
