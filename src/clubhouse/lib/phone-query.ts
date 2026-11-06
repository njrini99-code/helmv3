/**
 * The phone layout's one definition (owner, redesign sweep): a screen up to 820 wide, or a touch screen under 500 tall, which is
 * an iPhone turned sideways. The stylesheets repeat the same two tests in their @media rules; scripts/clubhouse/check keeps them level.
 */
export const CH_PHONE_QUERY = '(max-width: 820px), (max-height: 500px) and (pointer: coarse)';
/** Everything else: a desk or a tablet. */
export const CH_DESK_QUERY = '(min-width: 821px) and ((min-height: 501px) or (pointer: fine))';
