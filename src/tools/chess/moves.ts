import { defineTool } from '../../core/tool.js';
import { fail, jsonBlock } from '../../core/format.js';
import { num, strOrEmpty, view } from '../../core/input.js';
import { asciiBoard, ChessError, legalMoves, parseFen, squareName, toSan } from './_chess.js';

export default defineTool({
  name: 'pro_chess_moves',
  description:
    'Berilgan pozitsiyadagi barcha qonuniy yurishlar, SAN yozuvi bilan. Qal’a, en passant, ' +
    'ko‘tarilish (to‘rt xil) va shohga tegadigan yurishlar - barchasi sanaladi va ko‘rsatiladi. ' +
    'Natija soni perft bilan tekshirilgan.',
  category: 'chess',
  inputSchema: {
    type: 'object',
    properties: {
      fen: { type: 'string', description: 'FEN yozuvi (standart: boshlang‘ich pozitsiya)' },
      from_square: { type: 'string', description: 'Faqat shu maydondan chiqadigan yurishlar: "e2"' },
      limit: { type: 'number', description: 'Ko‘pi bilan shuncha yurish (standart: hammasi)' },
      ascii: { type: 'boolean', description: 'Maydonni ASCII ko‘rinishda qo‘shish' },
    },
  },
  async handler(input) {
    const p = view(input);
    const raw = strOrEmpty(p, 'fen') || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const fromSquare = strOrEmpty(p, 'from_square');
    const limit = Math.max(1, Math.min(num(p, 'limit', 200) || 200, 5000));

    let position;
    try {
      position = parseFen(raw);
    } catch (error) {
      return fail(`FENni o‘qib bo‘lmadi: ${(error as ChessError).message}`);
    }

    const all = legalMoves(position);
    const filtered = fromSquare ? all.filter((move) => squareName(move.from) === fromSquare.toLowerCase()) : all;

    if (fromSquare && filtered.length === 0 && all.length > 0) {
      return fail(`"${fromSquare}" dan chiqadigan qonuniy yurish yo‘q.`);
    }

    return jsonBlock(`${position.turn === 'w' ? 'oq' : 'qora'} yurishlari`, {
      fen: raw,
      total: all.length,
      shown: Math.min(filtered.length, limit),
      filtered_by: fromSquare || undefined,
      moves: filtered.slice(0, limit).map((move) => ({
        san: toSan(position, move),
        from: squareName(move.from),
        to: squareName(move.to),
        piece: move.piece,
        promotion: move.promotion,
        capture: Boolean(move.captured),
        en_passant: Boolean(move.enPassant),
        castle: move.castleKingSide ? 'king' : move.castleQueenSide ? 'queen' : undefined,
      })),
      truncated: filtered.length > limit ? true : undefined,
      ascii: p.ascii === true || String(p.ascii ?? '') === 'true' ? `\n${asciiBoard(position)}` : undefined,
    });
  },
});
