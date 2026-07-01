// Maps DB-shaped box-score rows (from `getGameBoxScore`) into the plain
// Input shapes the manual entry form (`BoxScoreEntry`) expects. Used to
// preload existing batting/pitching lines when editing a completed game —
// without this, the manual form opens blank and a save can wipe the
// existing box score (#433).
import type {
  BaseballBoxScoreBatting,
  BaseballBoxScorePitching,
  BoxScoreBattingInput,
  BoxScorePitchingInput,
} from '@/lib/types';

export function mapBattingToInput(row: BaseballBoxScoreBatting): BoxScoreBattingInput {
  const playerName = row.player
    ? [row.player.first_name, row.player.last_name].filter(Boolean).join(' ').trim() || undefined
    : undefined;

  return {
    player_id: row.player_id,
    player_name: playerName,
    batting_order: row.batting_order ?? undefined,
    ab: row.ab,
    r: row.r,
    h: row.h,
    doubles: row.doubles,
    triples: row.triples,
    hr: row.hr,
    rbi: row.rbi,
    bb: row.bb,
    k: row.k,
    sb: row.sb,
    cs: row.cs,
    hbp: row.hbp,
    sac: row.sac,
    sf: row.sf,
    lob: row.lob,
  };
}

export function mapPitchingToInput(row: BaseballBoxScorePitching): BoxScorePitchingInput {
  const playerName = row.player
    ? [row.player.first_name, row.player.last_name].filter(Boolean).join(' ').trim() || undefined
    : undefined;

  return {
    player_id: row.player_id,
    player_name: playerName,
    ip: row.ip,
    h: row.h,
    r: row.r,
    er: row.er,
    bb: row.bb,
    k: row.k,
    hr: row.hr,
    pitch_count: row.pitch_count ?? undefined,
    strikes: row.strikes ?? undefined,
    result: row.result ?? undefined,
  };
}
