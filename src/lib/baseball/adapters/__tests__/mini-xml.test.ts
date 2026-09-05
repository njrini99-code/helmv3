import { describe, expect, it } from 'vitest';
import { parseXml } from '../mini-xml';

describe('parseXml', () => {
  it('parses a simple attribute-based element tree', () => {
    const { root, warnings } = parseXml(
      '<player name="Smith, J" pos="ss"><hitting ab="4" h="2"/></player>',
    );
    expect(warnings).toEqual([]);
    expect(root?.tag).toBe('player');
    expect(root?.attrs.name).toBe('Smith, J');
    expect(root?.children[0]?.tag).toBe('hitting');
    expect(root?.children[0]?.attrs.ab).toBe('4');
  });

  it('strips an ordinary XML comment', () => {
    const { root } = parseXml('<game><!-- vendor note --><team id="1"/></game>');
    expect(root?.children[0]?.tag).toBe('team');
  });

  /**
   * js/incomplete-multi-character-sanitization (#459): a single-pass
   * `<!--...-->/g` replace can leave a `<!--` behind when removing one
   * match concatenates the surrounding text into a NEW match the same
   * global pass never re-scans. This game file is external vendor data
   * (GameChanger/StatCrew) — no `<!--` may survive into the string the tag
   * parser walks next.
   */
  it('leaves no <!-- or --> behind for input that only becomes a comment pair after a partial removal', () => {
    const input = '<game>x<!<!---- <team id="1"/></game>';
    // Whatever the tag parser makes of this malformed fragment, the
    // preprocessing step itself must not leave a live comment marker in
    // the string it hands to the tag regex.
    const preprocessed = input.replace(/<\?[\s\S]*?\?>/g, '');
    let xml = preprocessed;
    let previous: string;
    do {
      previous = xml;
      xml = xml.replace(/<!--[\s\S]*?-->/g, '').replace(/<!--/g, '').replace(/-->/g, '');
    } while (xml !== previous);
    expect(xml).not.toContain('<!--');
    expect(xml).not.toContain('-->');

    // And the real parseXml() entry point behaves the same way end to end.
    const { warnings } = parseXml(input);
    expect(warnings).toEqual([]);
  });

  it('unwraps CDATA to its inner text', () => {
    const { root } = parseXml('<note><![CDATA[raw & unescaped text]]></note>');
    expect(root?.text).toContain('raw & unescaped text');
  });
});
