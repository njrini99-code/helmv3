/**
 * G-29b — the image IS the message object; the caption sits below it.
 *
 * §8.6: "the image is the message object, with a caption below; it is not an
 * image nested inside a large padded generic chat card." Both halves were
 * violated. Content rendered before attachments UNCONDITIONALLY, so the caption
 * sat above the image; and one flat `px-4 py-2.5` was applied to text and image
 * alike, which is precisely the "large padded generic chat card".
 *
 * The specimen is `Bubbles.dc.html:73-83` — NOT `Thread.dc.html`, which
 * contains no photo message at all. M03B cited its measurements against "the
 * artboard" without naming which one.
 *
 * MEASURED ON BOTH SIDES where a value maps. Where it does not, the test pins
 * the STRUCTURE — order, framing, which element owns the width cap — because
 * that is what §8.6 actually asks for and what silently regresses.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');

const bubbles = read('audit/reference/Bubbles.dc.html');
const source = read('src/components/fairway/pages/messages/MessageThreadPane.tsx');

/** Block comments removed whole — a JSX comment body reads as ordinary prose. */
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((line) => !line.trim().startsWith('//'))
  .join('\n');

/** The artboard's photo bubble — the element carrying the frame padding. */
const photoBubble = bubbles
  .split('\n')
  .find((l) => l.includes('padding: 5px 5px 10px 5px'));

/** Its caption line, the div directly under the image block. */
const photoCaption = bubbles
  .split('\n')
  .find((l) => l.includes('padding: 8px 11px 0 11px'));

describe('G-29b — the artboard specimen is where we think it is', () => {
  it('lives in Bubbles.dc.html and states a frame, not card padding', () => {
    expect(photoBubble, 'expected the 5px photo frame in Bubbles.dc.html').toBeDefined();
    expect(photoCaption, 'expected the inset caption in Bubbles.dc.html').toBeDefined();
  });

  it('is absent from Thread.dc.html, which M03B cited', () => {
    // Pinned so the "M03B measured against the wrong artboard" correction does
    // not have to be re-derived, and so it fails loudly if a photo message is
    // ever added to Thread.dc.html with different numbers.
    expect(read('audit/reference/Thread.dc.html')).not.toContain('padding: 5px 5px 10px 5px');
  });

  it('the artboard annotation still says the image is the object', () => {
    expect(bubbles).toContain('the image IS the bubble, caption below it');
  });
});

describe('G-29b — the component frames a photo instead of padding it', () => {
  it('derives the photo case from RESOLVED attachments, not has_attachments', () => {
    // Reshaping the bubble before the signed URLs land would make it snap on
    // load: there is nothing to frame until an image actually resolves.
    expect(code).toContain('const isPhotoMessage = resolvedAttachments.some(');
    expect(code).toContain("att.fileType === 'image' && !!att.url");
  });

  it('swaps the generic card padding for a frame on a photo message', () => {
    expect(code).toContain("isPhotoMessage ? 'p-1 pb-2.5' : 'px-4 py-2.5'");
    // The flat padding must no longer be applied unconditionally — that is the
    // exact shape §8.6 names as wrong.
    expect(code).not.toContain("cn(\n                          'px-4 py-2.5',");
  });

  it('renders the caption AFTER the attachments, not before', () => {
    const attachIdx = code.indexOf('<MessageAttachments attachments={resolvedAttachments}');
    const captionIdx = code.indexOf('{decodeMessageContent(msg.content)}');
    expect(attachIdx).toBeGreaterThan(-1);
    expect(captionIdx).toBeGreaterThan(-1);
    expect(captionIdx).toBeGreaterThan(attachIdx);
  });

  it('insets the caption from the frame so the image stays flush to it', () => {
    expect(code).toContain("isPhotoMessage && 'px-2.5 pt-2'");
    // The edited badge sits in the same inset column, or it hangs off the edge.
    expect(code).toContain("isPhotoMessage && 'px-2.5'");
  });

  it('leaves the width cap on the column, not on the image', () => {
    // A 260px image cap inside a 288px column never bound — a dead number.
    expect(code).not.toContain('max-w-[260px] object-cover');
    expect(code).toContain('max-h-64 w-full object-cover');
  });

  it('does not reproduce the specimen widths, per the G-50b precedent', () => {
    for (const specimen of ['250px', '260px']) {
      expect(code).not.toContain(`max-w-[${specimen}]`);
    }
  });
});
