import { defineTool } from '../../core/tool.js';
import { fail, jsonBlock } from '../../core/format.js';
import { strOrEmpty, view } from '../../core/input.js';
import {
  ChessError,
  legalMoves,
  parseFen,
  parseSquare,
  pseudoLegalMoves,
  squareName,
  toFen,
  toSan,
  type Position,
} from './_chess.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export default defineTool({
  name: 'pro_chess_square',
  description:
    'Maydon haqida: u yerda qaysi dona turadi, uni qaysi donalar urmoqda va qaysi yurishlar ' +
    'shu maydonga boradi. Ro‘yxat har doim shu pozitsiya bo‘yicha qayta hisoblanadi, saqlanmaydi.',
  category: 'chess',
  inputSchema: {
    type: 'object',
    properties: {
      square: { type: 'string', description: 'Maydon nomi: "e4"' },
      fen: { type: 'string', description: 'Pozitsiya FEN (standart: boshlang‘ich pozitsiya)' },
      attacks: { type: 'boolean', description: 'Shu maydonga hujum qiluvchi donalarni ro‘yxat qilish' },
      moves: { type: 'boolean', description: 'Shu maydonga boradigan qonuniy yurishlarni ro‘yxat qilish' },
    },
    required: ['square'],
  },
  async handler(input) {
    const p = view(input);
    const name = strOrEmpty(p, 'square');
    const square = name ? parseSquare(name) : undefined;
    if (square === undefined) {
      return fail(`maydon nomi noto‘g‘ri: "${name}". Shakl: a1..h8.`);
    }

    const raw = strOrEmpty(p, 'fen') || START;
    let position: Position;
    try {
      position = parseFen(raw);
    } catch (error) {
      return fail(`FENni o‘qib bo‘lmadi: ${(error as ChessError).message}`);
    }

    const piece = position.squares[square] as string;
    const showAttacks = p.attacks === true || String(p.attacks ?? '') === 'true';
    const showMoves = p.moves === true || String(p.moves ?? '') === 'true';

    /**
     * Which squares of one colour can reach this square.
     *
     * Asked of the move generator rather than of an attack test. `isSquareAttacked(position, square,
     * colour)` answers yes or no about a square and a colour, so calling it once per piece - as an
     * earlier version here did - asks "is this piece's own square attacked by its own side" and answers
     * yes for nearly every piece on the board. Measured: asking about e1 returned 26 attackers in the
     * starting position, every piece reporting itself.
     *
     * Asking the generator "can this piece move here" is the question actually meant, and it keeps one
     * definition of what a piece reaches instead of two that can drift apart. "Can capture here" is
     * used, not "could attack an empty diagonal": a pawn does attack an empty diagonal square for the
     * purpose of king legality, but listing it as that square's attacker reads as a mistake.
     */
    const reaching = (colour: 'white' | 'black'): string[] => {
      const from = new Set(
        pseudoLegalMoves({ ...position, turn: colour === 'white' ? 'w' : 'b' })
          .filter((move) => move.to === square)
          .map((move) => squareName(move.from)),
      );
      return [...from].sort();
    };

    const whiteReachers = showAttacks ? reaching('white') : [];
    const blackReachers = showAttacks ? reaching('black') : [];
    const incoming = [...whiteReachers, ...blackReachers];

    // `to_here` is a different question: only the side to move has legal moves, so both sets are not
    // merged here.
    const legalIncoming = showMoves
      ? legalMoves(position)
          .filter((move) => move.to === square)
          .map((move) => ({ san: toSan(position, move), from: squareName(move.from) }))
      : undefined;

    return jsonBlock(`Maydon: ${squareName(square)}`, {
      square: squareName(square),
      fen: toFen(position),
      piece: piece === '' ? 'bo‘sh' : piece.toLowerCase(),
      colour: piece === '' ? undefined : piece === piece.toUpperCase() ? 'white' : 'black',
      attacked_by: showAttacks ? incoming : undefined,
      attacked_by_colours: showAttacks ? { white: whiteReachers, black: blackReachers } : undefined,
      attacked_by_count: showAttacks ? incoming.length : undefined,
      to_here: legalIncoming,
      // Whether the square is safe is the question a caller usually has, and it is answered from the
      // list rather than by a separate test that could disagree with it.
      is_safe: showAttacks ? incoming.length === 0 : undefined,
    });
  },
});
