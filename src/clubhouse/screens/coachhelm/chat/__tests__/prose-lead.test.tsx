import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { parseProse } from '../../../../data/coachhelm-chat-thread';
import { AskProse, afterSecondSentence, splitLead } from '../Prose';

/**
 * #16 (owner's preview, 11 Nov): the model writes its answer as one paragraph, and the leaf sets its first paragraph at the
 * lead's size (coachhelm-ask-v2.css), so every answer was drawn at headline size. The lead is now the first two sentences.
 */
const ANSWER =
  'Owen Carter holes more putts than Cole Bennett beyond 3 feet. The biggest gap is from 3 to 5 feet, at +0.99 a round. From 5 to 10 feet it is 35% vs. 29%. Both are under the Tour from 5 feet out.';

describe('afterSecondSentence', () => {
  it('cuts after the second sentence', () => {
    const at = afterSecondSentence(ANSWER)!;
    expect(ANSWER.slice(0, at).trimEnd()).toBe('Owen Carter holes more putts than Cole Bennett beyond 3 feet. The biggest gap is from 3 to 5 feet, at +0.99 a round.');
  });

  it('a decimal point is never an end', () => {
    expect(afterSecondSentence('He is at +0.99 a round. The team is at −3.03 over 55 rounds. That is close.')).toBe('He is at +0.99 a round. The team is at −3.03 over 55 rounds. '.length);
  });

  it('"vs." is never an end', () => {
    const text = 'It is Cole vs. Jackson off the tee. Cole leads by 0.4. Jackson hits more fairways.';
    expect(text.slice(0, afterSecondSentence(text)!).trimEnd()).toBe('It is Cole vs. Jackson off the tee. Cole leads by 0.4.');
  });

  it('two sentences or fewer: no cut, the whole paragraph is the lead', () => {
    expect(afterSecondSentence('One sentence.')).toBeNull();
    expect(afterSecondSentence('One sentence. Two sentences.')).toBeNull();
  });

  it('streaming: no cut until the third sentence has begun', () => {
    expect(afterSecondSentence('First one. Second one.')).toBeNull();
    expect(afterSecondSentence('First one. Second one. ')).toBeNull();
    expect(afterSecondSentence('First one. Second one. T')).toBe('First one. Second one. '.length);
    expect(afterSecondSentence('First one. Second at 3.')).toBeNull();
  });
});

describe('splitLead', () => {
  it('the first paragraph becomes the lead and the body; later blocks are kept', () => {
    const blocks = splitLead(parseProse(`${ANSWER}\n\n- a list item`));
    expect(blocks[0]).toEqual({ kind: 'paragraph', text: 'Owen Carter holes more putts than Cole Bennett beyond 3 feet. The biggest gap is from 3 to 5 feet, at +0.99 a round.' });
    expect(blocks[1]).toEqual({ kind: 'paragraph', text: 'From 5 to 10 feet it is 35% vs. 29%. Both are under the Tour from 5 feet out.' });
    expect(blocks.slice(2)).toEqual(parseProse('- a list item'));
  });

  it('as the words arrive, the lead never changes once it is cut: no drawn word changes size', () => {
    let cut: string | null = null;
    for (let n = 1; n <= ANSWER.length; n += 1) {
      const blocks = splitLead(parseProse(ANSWER.slice(0, n)));
      if (blocks.length > 1) {
        cut ??= blocks[0]!.kind === 'paragraph' ? blocks[0]!.text : null;
        expect(blocks[0]).toEqual({ kind: 'paragraph', text: cut });
      } else if (cut !== null) {
        throw new Error(`the cut was undone at ${n} characters`);
      }
    }
    expect(cut).not.toBeNull();
  });

  it('a list first is left alone', () => {
    const blocks = parseProse('- one\n- two');
    expect(splitLead(blocks)).toBe(blocks);
  });
});

describe('AskProse', () => {
  it('the opening text draws two paragraphs; any other text draws one', () => {
    const lead = render(<AskProse text={ANSWER} lead playersByName={{}} />);
    expect(lead.container.querySelectorAll('.ch-th-p')).toHaveLength(2);
    const body = render(<AskProse text={ANSWER} playersByName={{}} />);
    expect(body.container.querySelectorAll('.ch-th-p')).toHaveLength(1);
  });
});
