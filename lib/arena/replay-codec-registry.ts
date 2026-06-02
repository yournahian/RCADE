export interface GameEventCodec {
  eventCodes: Record<string, string>;
  eventNames: Record<string, string>;
}

export const CODEC_REGISTRY: Record<number, GameEventCodec> = {
  1: { // Neon Snake
    eventCodes: { pellet: 'P', collision: 'C', combo_up: 'M', wall_wrap: 'W', dir_change: 'D' },
    eventNames: { P: 'pellet', C: 'collision', M: 'combo_up', W: 'wall_wrap', D: 'dir_change' }
  },
  5: { // Space Impact
    eventCodes: { fire: 'F', kill: 'K', damage: 'D', collect: 'U', dir_change: 'D', pellet: 'P', combo_up: 'M' },
    eventNames: { F: 'fire', K: 'kill', D: 'damage', U: 'collect', D: 'dir_change', P: 'pellet', M: 'combo_up' }
  },
  6: { // Sudoku Matrix
    eventCodes: { select_cell: 'S', input_digit: 'I', erase_digit: 'E', invalid_attempt: 'X', complete_sector: 'B', complete_board: 'V' },
    eventNames: { S: 'select_cell', I: 'input_digit', E: 'erase_digit', X: 'invalid_attempt', B: 'complete_sector', V: 'complete_board' }
  }
};

export const DEFAULT_CODEC: GameEventCodec = {
  eventCodes: {},
  eventNames: {}
};
