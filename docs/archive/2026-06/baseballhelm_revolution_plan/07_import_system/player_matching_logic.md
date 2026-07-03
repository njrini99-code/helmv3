# Player Matching Logic

## Match priority

1. Exact `player_id` or external ID.
2. Team + jersey number + last name.
3. Team + first/last name + grad/class year.
4. Fuzzy name + position + jersey suggestion.
5. Manual match required.

Never silently create duplicate players unless import type explicitly allows prospect creation.
