import { describe, expect, it } from 'vitest';
import { partialInput } from '../draft';

const plan = {
  title: 'Tuesday short game',
  audience: 'team',
  minutes: 90,
  blocks: [
    { name: 'Lag putting', minutes: 20, notes: 'Three balls from 30, 40 and 50 feet. "Inside the grip" counts.' },
    { name: 'Wedges, 50 to 90 yards', minutes: 30, notes: 'Ladder: land it in each 10-yard box.\nKeep score.' },
    { name: 'Up and down', minutes: 40, notes: 'Nine holes, one ball. Par is 18.' },
  ],
  message: 'Short game today. Bring wedges and a putter — nothing else.',
};
const json = JSON.stringify(plan);
const FIELDS = ['title', 'blocks', 'message', 'minutes'];

describe('a draft read from a tool input the model is still writing', () => {
  it('shows only what is finished at every point of the input, and ends with the input itself', () => {
    let lastBlocks = 0;
    let lastMessage = '';
    for (let cut = 0; cut <= json.length; cut += 1) {
      const { fields } = partialInput(json.slice(0, cut), FIELDS);
      // A finished field is exactly the model's; a field never shown is simply absent.
      if ('title' in fields) expect(plan.title.startsWith(String(fields.title))).toBe(true);
      if ('minutes' in fields) expect(fields.minutes).toBe(90);
      if ('blocks' in fields) {
        const blocks = fields.blocks as typeof plan.blocks;
        // Whole items only, in order, never fewer than before.
        expect(blocks).toEqual(plan.blocks.slice(0, blocks.length));
        expect(blocks.length).toBeGreaterThanOrEqual(lastBlocks);
        lastBlocks = blocks.length;
      }
      if ('message' in fields) {
        const message = String(fields.message);
        // Words only grow, and never stop inside a word.
        expect(plan.message.startsWith(message)).toBe(true);
        expect(message.length).toBeGreaterThanOrEqual(lastMessage.length);
        if (message !== plan.message) expect(plan.message[message.length]).toMatch(/\s/);
        lastMessage = message;
      }
      // A field that was not asked for is never shown.
      expect(fields).not.toHaveProperty('audience');
    }
    expect(partialInput(json, FIELDS)).toEqual({ fields: { title: plan.title, minutes: 90, blocks: plan.blocks, message: plan.message }, open: null });
  });

  it('names the field being written, and shows a number or an object only when it is complete', () => {
    expect(partialInput('{"title":"Tuesday sh', FIELDS)).toEqual({ fields: { title: 'Tuesday' }, open: 'title' });
    expect(partialInput('{"title":"Tue', FIELDS)).toEqual({ fields: {}, open: 'title' });
    expect(partialInput('{"title":"Tuesday","minutes":9', FIELDS)).toEqual({ fields: { title: 'Tuesday' }, open: 'minutes' });
    expect(partialInput('{"title":"Tuesday","minutes":90,', FIELDS)).toEqual({ fields: { title: 'Tuesday', minutes: 90 }, open: null });
    expect(partialInput('{"where":{"course":"Pine', ['where'])).toEqual({ fields: {}, open: 'where' });
    expect(partialInput('{"where":{"course":"Pine Valley"}', ['where'])).toEqual({ fields: { where: { course: 'Pine Valley' } }, open: null });
    // A field nobody listed is passed over, open or not.
    expect(partialInput('{"audience":"te', FIELDS)).toEqual({ fields: {}, open: null });
  });

  it('never shows half an item of a list, however the item is cut', () => {
    const start = '{"blocks":[{"name":"Lag putting","minutes":20},{"name":"Wed';
    expect(partialInput(start, FIELDS)).toEqual({ fields: { blocks: [{ name: 'Lag putting', minutes: 20 }] }, open: 'blocks' });
    expect(partialInput('{"blocks":[{"name":"Lag', FIELDS)).toEqual({ fields: {}, open: 'blocks' });
    expect(partialInput('{"blocks":["one","two', FIELDS).fields).toEqual({ blocks: ['one'] });
    expect(partialInput('{"blocks":[1,2', FIELDS).fields).toEqual({ blocks: [1] });
    expect(partialInput('{"blocks":[1,2]', FIELDS).fields).toEqual({ blocks: [1, 2] });
    expect(partialInput('{"blocks":[[1,"a]"],[2', FIELDS).fields).toEqual({ blocks: [[1, 'a]']] });
  });

  it('leaves a half-written escape for the next piece', () => {
    expect(partialInput('{"message":"Bring a putter \\', FIELDS).fields).toEqual({ message: 'Bring a putter' });
    expect(partialInput('{"message":"Bring a putter \\u00', FIELDS).fields).toEqual({ message: 'Bring a putter' });
    expect(partialInput('{"message":"Line one\\nLine two and mo', FIELDS).fields).toEqual({ message: 'Line one\nLine two and' });
    expect(partialInput('{"message":"He said \\"go\\" and le', FIELDS).fields).toEqual({ message: 'He said "go" and' });
    // A backslash the model wrote in full (escaped) is kept; text after it that only looks like an escape is text.
    expect(partialInput('{"message":"a path C:\\\\ and more wor', FIELDS).fields).toEqual({ message: 'a path C:\\ and more' });
    expect(partialInput('{"message":"one two C:\\\\', FIELDS).fields).toEqual({ message: 'one two' });
    expect(partialInput('{"message":"one two \\\\u00 thr', FIELDS).fields).toEqual({ message: 'one two \\u00' });
  });

  it('shows nothing of input that is not an object, or is not yet anything', () => {
    for (const text of ['', ' ', '[', '"words', '{', '{"', '{"title"', '{"title":', 'null']) expect(partialInput(text, FIELDS)).toEqual({ fields: {}, open: null });
  });
});
