'use client';

import type { ChMessagesApi } from '../api/types';
import type { ChConv } from '../model';
import { Flag, Users } from 'lucide-react';
import { Avatar } from '../../../ui/Avatar';
import { Icon } from '../../../ui/Icon';
import { convAvatarId, convYear } from '../shared/conv-ui';
import { TypingMini, typingLabel } from './TypingMini';
import { bubbletLine, pinLabel } from './model';
import { useConvActions } from './ConvRow';

/**
 * One face in the Pinned card (MSG-105, MSG-106): the coin, the first name under it, and the latest line above it in a
 * bubblet (three dots while someone is typing). A tap opens the conversation. A long press opens the row's menu (Q-39),
 * because a pinned person is not listed in Recent, so this is the one place to unpin them; VoiceOver and a keyboard get the
 * same menu from the button that appears when focused.
 */
export function PinTile({ api, c, place }: { api: ChMessagesApi; c: ChConv; place: number }) {
  const { ctx, sheets, open } = useConvActions(api, c, true);
  const typers = api.typingByConv?.get(c.id);
  const said = typers?.length ? null : bubbletLine(c, api.viewer.userId);
  return (
    <>
      <div className="ch-msv-pinw" data-place={place}>
        <button type="button" className="ch-msv-pin" onClick={open} {...ctx.bind(c)}>
          {typers?.length ? (
            <span className="ch-msv-bubblet">
              <TypingMini label={typingLabel(api, typers)} />
            </span>
          ) : said ? (
            <span className="ch-msv-bubblet">{said}</span>
          ) : null}
          {c.group ? (
            <span className="ch-ms-grp ch-msv-pin__grp">
              <Icon icon={c.channel ? Flag : Users} size={31} />
            </span>
          ) : (
            <Avatar name={c.title} id={convAvatarId(api, c)} size="xl" year={convYear(api, c)} />
          )}
          <span className="ch-msv-pin__l">{pinLabel(c)}</span>
        </button>
        <span className="ch-sr-only ch-sr-only--focusable">
          <button type="button" onClick={() => ctx.openSheet(c)}>
            Actions for {c.title}
          </button>
        </span>
      </div>
      {sheets}
    </>
  );
}
