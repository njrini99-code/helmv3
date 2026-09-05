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

  /**
   * Regression: the #459 fix above (bare `-->`/`<!--` marker cleanup, added
   * to close js/incomplete-multi-character-sanitization) ran BEFORE the
   * CDATA unwrap. A `-->` appearing verbatim inside `<![CDATA[...]]>` is
   * legal, literal content — not a comment terminator, per XML — but the
   * bare-marker `.replace(/-->/g, '')` cannot tell the difference and
   * silently ate it, so `<![CDATA[a --> b]]>` came out of parseXml() as
   * `a  b`. CDATA sections are now extracted before comment-stripping and
   * restored verbatim after, so their content is never visible to that
   * cleanup pass.
   */
  it('does not let the comment-marker cleanup corrupt a `-->` inside CDATA', () => {
    const { root, warnings } = parseXml('<note><![CDATA[a --> b]]></note>');
    expect(root?.text).toBe('a --> b');
    expect(warnings).toEqual([]);
  });

  it('does not let a bare <!-- inside CDATA be stripped either', () => {
    const { root } = parseXml('<note><![CDATA[left <!-- right]]></note>');
    expect(root?.text).toBe('left <!-- right');
  });

  it('still strips a real comment that sits next to (not inside) CDATA', () => {
    const { root } = parseXml(
      '<game><!-- vendor note --><note><![CDATA[a --> b]]></note></game>',
    );
    expect(root?.children[0]?.tag).toBe('note');
    expect(root?.children[0]?.text).toBe('a --> b');
  });

  /**
   * Same bug class as the `-->` case above, but for the prolog/PI strip
   * instead of the comment-marker cleanup. `/<\?[\s\S]*?\?>/g` is lazy but
   * not anchored to any one processing instruction: given an unterminated
   * `<?...` earlier in a malformed vendor feed (this parser's own docs say
   * malformed input must warn, not corrupt) and a `?>` inside a LATER CDATA
   * section, the lazy match used to be satisfied by the CDATA's own `?>`,
   * eating every real element in between. CDATA is now extracted before the
   * prolog/PI strip runs, so its `?>` is never visible to it.
   */
  it('does not let an unterminated PI eat through a later CDATA `?>` and the elements between them', () => {
    const { root, warnings } = parseXml(
      '<root><?weird-unterminated-pi <note><![CDATA[a ?> b]]></note><team id="1"/></root>',
    );
    expect(warnings).toEqual([]);
    expect(root?.children.map((c) => c.tag)).toEqual(['note', 'team']);
    expect(root?.children[0]?.text).toBe('a ?> b');
    expect(root?.children[1]?.attrs.id).toBe('1');
  });
});
