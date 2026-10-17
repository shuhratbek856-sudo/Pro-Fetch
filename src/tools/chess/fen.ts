import { defineTool } from '../../core/tool.js';
import { fail, jsonBlock } from '../../core/format.js';
import { strOrEmpty, view } from '../../core/input.js';
import { asciiBoard, boardList, ChessError, isInCheck, parseFen, squareName, statusOf, toFen } from './_chess.js';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export default defineTool({
  name: 'pro_chess_fen',
  description:
    'FEN ni o‘qish, tekshirish va qayta yozish. Natija: maydon, yuradigan tomon, qal’a huquqlari, ' +
    'en passant maydoni, soatlar va alohida maydonlar ro‘yxati. Noto‘g‘ri FEN qaysi qismi xato ekanini ' +
    'aytadi - "FEN noto‘g‘ri" emas.',
  category: 'chess',
  inputSchema: {
    type: 'object',
    properties: {
      fen: { type: 'string', description: 'FEN yozuvi' },
      ascii: { type: 'boolean', description: 'Maydonni ASCII ko‘rinishda chiqarish' },
      standard: { type: 'boolean', description: 'standart FENni ishlatish (input berilmasa)' },
    },
    anyOf: [{ required: ['fen'] }, { required: ['standard'] }],
  },
  async handler(input) {
    const p = view(input);
    const useStandard = p.standard === true || String(p.standard ?? '') === 'true';
    const raw = useStandard ? START_FEN : strOrEmpty(p, 'fen');
    if (!raw) return fail('fen kerak (yoki standard: true).');

    let position;
    try {
      position = parseFen(raw);
    } catch (error) {
      // The message names the part, because "invalid FEN" tells a caller nothing about which of the six
      // fields to look at.
      return fail(`FENni o‘qib bo‘lmadi: ${(error as ChessError).message}`);
    }

    const pieces = boardList(position);
    const white = pieces.filter((piece) => piece.colour === 'white').length;
    const black = pieces.length - white;

    return jsonBlock(`FEN: ${position.turn === 'w' ? 'oq' : 'qora'} yuradi`, {
      input: raw,
      fen: toFen(position),
      // Whether the record survived a round trip. A FEN that re-serialises differently is either using
      // an extension or is malformed, and the difference is worth seeing.
      round_trip_identical: toFen(position) === raw.trim(),
      turn: position.turn === 'w' ? 'white' : 'black',
      castling: position.castling === '' ? 'none' : position.castling,
      en_passant: position.epSquare === undefined ? undefined : squareName(position.epSquare),
      halfmove_clock: position.halfmove,
      fullmove_number: position.fullmove,
      in_check: isInCheck(position, position.turn),
      status: statusOf(position),
      counts: { white, black, total: pieces.length },
      pieces,
      ascii: p.ascii === true || String(p.ascii ?? '') === 'true' ? `\n${asciiBoard(position)}` : undefined,
    });
  },
});
