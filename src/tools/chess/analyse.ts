import { defineTool } from '../../core/tool.js';
import { fail, jsonBlock } from '../../core/format.js';
import { num, strOrEmpty, view } from '../../core/input.js';
import {
  applyMove,
  ChessError,
  findMove,
  isInCheck,
  legalMoves,
  parseFen,
  perft,
  statusOf,
  toFen,
  toSan,
  type Position,
} from './_chess.js';

const MAX_PERFT_DEPTH = 5;

function play(position: Position, san: string): { position: Position; san: string } {
  const move = findMove(position, san);
  // Recomputed rather than stored, so SAN always describes the position it came from.
  const text = toSan(position, move);
  return { position: applyMove(position, move), san: text };
}

export default defineTool({
  name: 'pro_chess_analyse',
  description:
    'Pozitsiyani tahlil qilish: yurishlar soni, shoh tekshiruvi, mat/mat emas/potishka, eng uzun yurish ' +
    'zanjiri va ixtiyoriy perft (barg o‘quv soni). Yurishlar SAN ro‘yxati yoki FEN ko‘rinishida ' +
    'berilsa, ular ketma-ket o‘ynab yangi pozitsiya va yakuniy natija chiqadi.',
  category: 'chess',
  inputSchema: {
    type: 'object',
    properties: {
      fen: { type: 'string', description: 'Boshlang‘ich FEN (standart: boshlang‘ich pozitsiya)' },
      moves: {
        type: 'array',
        items: { type: 'string' },
        description: 'SAN yoki "e2e4" ko‘rinishidagi yurishlar',
      },
      perft_depth: { type: 'number', description: 'perft chuqurligi 1..5 (sekin, lekin aniq hisob)' },
      best_line: { type: 'number', description: 'Enginchi yurishlar zanjiri uzunligi (standart 2)' },
    },
  },
  async handler(input) {
    const p = view(input);
    let position = parseFen(strOrEmpty(p, 'fen') || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');

    const moves = Array.isArray(p.moves) ? (p.moves as unknown[]).map((entry) => String(entry)) : [];
    const played: string[] = [];
    for (const [index, san] of moves.entries()) {
      try {
        const result = play(position, san);
        played.push(result.san);
        position = result.position;
      } catch (error) {
        // Says which move failed and what the position was at that point, because "invalid move" after
        // twelve legal moves is not a diagnosable message.
        return fail(
          `${moves.length}-yurishdan ${index + 1}-si bajarilmadi: ${(error as ChessError).message}\n` +
            `Shu vaqtgacha: ${played.length > 0 ? played.join(' ') : '(birorta ham o‘ynalmadi)'}\n` +
            `Pozitsiya: ${toFen(position)}`,
        );
      }
    }

    const legal = legalMoves(position);
    const depth = num(p, 'perft_depth', 0);
    const lineLength = Math.max(1, Math.min(num(p, 'best_line', 2) || 2, 6));

    const result: Record<string, unknown> = {
      fen: toFen(position),
      started_at: strOrEmpty(p, 'fen') || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      played,
      turn: position.turn === 'w' ? 'white' : 'black',
      in_check: isInCheck(position, position.turn),
      status: statusOf(position),
      legal_moves: legal.length,
      material: materialOf(position),
    };

    if (legal.length > 0) {
      // "Best" without an engine means "longest response the opponent has", which is a fact about the
      // position rather than a claim about strength. Named as what it is.
      let worst = legal[0] as (typeof legal)[number];
      let worstReplies = legalMoves(applyMove(position, worst)).length;
      for (const move of legal.slice(1)) {
        const replies = legalMoves(applyMove(position, move)).length;
        if (replies > worstReplies) {
          worst = move;
          worstReplies = replies;
        }
      }
      result.longest_line = {
        move: toSan(position, worst),
        opponent_replies: worstReplies,
        note: 'eng ko‘p javob beradigan yurish - bu pozitsiya haqidagi fakt, kuch bahosi emas',
      };
    }

    if (depth > 0) {
      const capped = Math.min(depth, MAX_PERFT_DEPTH);
      if (depth > MAX_PERFT_DEPTH) {
        result.perft_note = `chuqurlik ${MAX_PERFT_DEPTH} ga qisqartirildi; chuqurroq hisob sekin.`;
      }
      result.perft = { depth: capped, nodes: perft(position, capped) };
    }

    if (lineLength > 1 && legal.length > 0) {
      result.sample_line = sampleLine(position, lineLength);
    }

    return jsonBlock(`Shaxmat tahlili: ${statusOf(position)}`, result);
  },
});

function materialOf(position: Position): Record<string, number> {
  const values: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  const out = { white: 0, black: 0, difference: 0 };
  for (const piece of position.squares) {
    if (piece === '' || piece.toLowerCase() === 'k') continue;
    const value = values[piece.toLowerCase()] ?? 0;
    if (piece === piece.toUpperCase()) out.white += value;
    else out.black += value;
  }
  out.difference = out.white - out.black;
  return out;
}

/**
 * A sample line, chosen as the move that leaves the fewest replies.
 *
 * This is a move generator's idea of a line, not an engine's. Labelling it otherwise is how a tool ends
 * up confidently recommending a hanging queen.
 */
function sampleLine(position: Position, plies: number): string[] {
  const line: string[] = [];
  let current = position;
  for (let ply = 0; ply < plies; ply += 1) {
    const legal = legalMoves(current);
    if (legal.length === 0) break;
    let chosen = legal[0] as (typeof legal)[number];
    let fewest = legalMoves(applyMove(current, chosen)).length;
    for (const move of legal.slice(1)) {
      const replies = legalMoves(applyMove(current, move)).length;
      if (replies < fewest) {
        chosen = move;
        fewest = replies;
      }
    }
    line.push(toSan(current, chosen));
    current = applyMove(current, chosen);
  }
  return line;
}
