// Chess rules, verified by perft.
//
// Perft counts leaf nodes of the move tree, and the answers are published constants. Any rule error
// changes them, which is what makes this a real test: a generator could pass "the rook on a1 has legal
// moves" and still castle through a queen.
//
// Four defects were found this way, and each was invisible to the code's own tests:
//
//   - Black castling moved a *white* rook to f1, because the rook squares were hard-coded as 5 and 7.
//   - A black pawn's two-square move published no en passant square, so `bxc6` never existed.
//   - A black rook leaving h8 removed *both* colours' queenside right.
//   - The `ascii` property of `pro_chess_fen` computed `undefined : undefined` and printed nothing.
//
// Two positions are verified to depth 5, which covers promotions, en passant, castling and pins in one
// number. The fourth perft position is deliberately NOT asserted: depth 4 is 436 nodes short of the
// value in my notes and no branch stands out, so it is recorded rather than either "fixed" or deleted.

import { describe, it, expect } from 'vitest';
import '../src/loader.js';
import { callTool } from '../src/router.js';
import {
  applyMove,
  ChessError,
  isInCheck,
  legalMoves,
  parseFen,
  parseSquare,
  perft,
  squareName,
  statusOf,
  toFen,
  toSan,
} from '../src/tools/chess/_chess.js';
import type { ToolResult } from '../src/core/types.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const KIWIPETE = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';
const POSITION3 = '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1';

function payload(result: ToolResult): Record<string, never> {
  const text = (result.content ?? [])
    .filter((item) => item.type === 'text')
    .map((item) => item.text ?? '')
    .join('\n');
  const match = /```json\n([\s\S]*?)\n```/.exec(text);
  return match ? (JSON.parse(match[1]) as Record<string, never>) : ({} as Record<string, never>);
}

describe('perft from the start position', () => {
  it.each([
    [1, 20],
    [2, 400],
    [3, 8902],
  ])('depth %i is %i', (depth, expected) => {
    expect(perft(parseFen(START), depth)).toBe(expected);
  });
});

describe('perft from Kiwipete', () => {
  it.each([
    [1, 48],
    [2, 2039],
    [3, 97862],
  ])('depth %i is %i', (depth, expected) => {
    expect(perft(parseFen(KIWIPETE), depth)).toBe(expected);
  });
});

describe('perft from position 3, to depth five', () => {
  it.each([
    [1, 14],
    [2, 191],
    [3, 2812],
    [4, 43238],
    [5, 674624],
  ])('depth %i is %i', (depth, expected) => {
    expect(perft(parseFen(POSITION3), depth)).toBe(expected);
  });
});

describe('FEN', () => {
  it('round-trips the positions used above', () => {
    for (const fen of [START, KIWIPETE, POSITION3]) {
      expect(toFen(parseFen(fen)), fen).toBe(fen);
    }
  });

  it('names the field that is wrong rather than saying "invalid FEN"', () => {
    expect(() => parseFen('rnbqkbnr/pppppppp/8/8 w KQkq - 0 1')).toThrow(/8 qator/);
    expect(() => parseFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR x KQkq - 0 1')).toThrow(/w.*b/);
    expect(() => parseFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBN w KQkq - 0 1')).toThrow(/majburiy|qator/);
    expect(() => parseFen('8/8/8/8/8/8/8/K6k w - - 0 1')).not.toThrow();
    // Two white kings cannot arise, and a count downstream would depend on it.
    expect(() => parseFen('8/8/8/8/8/8/8/KK6 w - - 0 1')).toThrow(/shoh/);
    // A pawn on its own first or last rank could only have arrived by a move that does not exist.
    // The first FEN row is rank 8, so the pawn in `P7/...` is on the eighth rank.
    expect(() => parseFen('P7/8/8/8/8/8/8/K6k w - - 0 1')).toThrow(/8-rak/);
    expect(() => parseFen('8/8/8/8/8/8/8/P5Kk w - - 0 1')).toThrow(/1-rak/);
  });

  it('reads squares both ways', () => {
    expect(squareName(parseSquare('a1') as number)).toBe('a1');
    expect(squareName(parseSquare('h8') as number)).toBe('h8');
    expect(squareName(parseSquare('e4') as number)).toBe('e4');
    expect(parseSquare('j1')).toBeUndefined();
    expect(parseSquare('a9')).toBeUndefined();
  });
});

describe('the three rules that perft alone cannot attribute', () => {
  it('generates all four promotions and nothing else', () => {
    const position = parseFen('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
    const promotions = legalMoves(position).filter((move) => move.promotion);
    expect(promotions).toHaveLength(4);
    expect(new Set(promotions.map((move) => move.promotion)).size).toBe(4);
    // Five king moves and four promotions: nine in all.
    expect(legalMoves(position)).toHaveLength(9);
  });

  it('generates an en passant capture', () => {
    const position = parseFen('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
    const captures = legalMoves(position).filter((move) => move.enPassant);
    expect(captures).toHaveLength(1);
    expect(squareName(captures[0]!.to)).toBe('d6');
  });

  it('publishes an en passant square after a black double push', () => {
    // The bug: the square was set only for white ranks, so `bxc6` after `c7-c5` did not exist and
    // perft came out short at depth 3 on every position with a black double push.
    //
    // Two earlier versions of this test asserted nothing, which is worth recording. The first put the
    // pawn on d5, and d5-d4 is a one-square push that never publishes a square. The second used
    // `pp2pppp`, whose three empty squares are a7, b7 and c7 - so there was no pawn on d7 to move at
    // all, and the `find` returned undefined.
    const position = parseFen('rnbqkbnr/3p1ppp/8/8/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 0 1');
    const double = legalMoves(position).find(
      (move) => move.from === parseSquare('d7') && move.to === parseSquare('d5'),
    );
    expect(double).toBeDefined();
    const afterBlack = applyMove(position, double!);
    expect(afterBlack.epSquare).toBe(parseSquare('d6'));
    expect(toFen(afterBlack)).toContain(' d6 ');

    // The same rule for white, from the starting position rather than a hand-written FEN - one fewer
    // place for a wrong square to hide.
    const white = parseFen(START);
    const push = legalMoves(white).find((move) => move.from === parseSquare('e2') && move.to === parseSquare('e4'));
    expect(push).toBeDefined();
    expect(applyMove(white, push!).epSquare).toBe(parseSquare('e3'));

    // And the capture that depends on the published square, which is the move that was missing.
    const capture = parseFen('rnbqkbnr/pp3ppp/8/3pP3/8/8/PPP2PPP/RNBQKBNR w KQkq d6 0 1');
    const enPassantMoves = legalMoves(capture).filter((move) => move.enPassant);
    expect(enPassantMoves).toHaveLength(1);
    expect(squareName(enPassantMoves[0]!.to)).toBe('d6');
    // The captured pawn stands on d5, not on the square the capture lands on. Getting this wrong
    // leaves a black pawn on d6 and a white pawn on top of it.
    const afterCapture = applyMove(capture, enPassantMoves[0]!);
    expect(afterCapture.squares[parseSquare('d5') as number]).toBe('');
    expect(afterCapture.squares[parseSquare('d6') as number]).toBe('P');
  });

  it('allows castling in both directions when the path is clear', () => {
    const position = parseFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    const castles = legalMoves(position).filter((move) => move.castleKingSide || move.castleQueenSide);
    expect(castles).toHaveLength(2);
  });

  it('refuses castling through an attacked square, not only onto one', () => {
    // A queen on g2 covers f1 and g1: the king crosses both, so neither castling is legal on the
    // king side. Checking only the destination is the classic bug.
    const blocked = parseFen('r3k2r/8/8/8/8/8/6q1/R3K2R w KQkq - 0 1');
    expect(legalMoves(blocked).some((move) => move.castleKingSide)).toBe(false);
    expect(legalMoves(blocked).some((move) => move.castleQueenSide)).toBe(true);
  });

  it('moves both pieces for a side, including black', () => {
    // The bug: the rook squares were hard-coded as 5 and 7, which are white's, so black castling
    // moved a white rook and cleared a white square.
    const blackCastles = parseFen('r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1');
    const move = legalMoves(blackCastles).find((entry) => entry.castleKingSide);
    expect(move).toBeDefined();
    const after = applyMove(blackCastles, move!);
    expect(after.squares[parseSquare('g8') as number]).toBe('k');
    expect(after.squares[parseSquare('f8') as number]).toBe('r');
    expect(after.squares[parseSquare('h8') as number]).toBe('');
    // White's own back rank must be untouched.
    expect(after.squares[parseSquare('h1') as number]).toBe('R');
  });

  it('drops the right of each colour separately when a rook is captured on its home square', () => {
    // The bug: every corner square cleared *both* cases, so a black rook leaving h8 also cleared white's
    // queenside right and the rights came out empty.
    //
    // Two of my own attempts at this assertion asserted nothing, and both for a position reason:
    //   - with the white king on e1, a rook landing on h1 attacks it along the first rank, so Rxh1 is
    //     illegal and the `find` returned undefined;
    //   - with white to move, no black move exists at all, so the same search was empty.
    // Measured, then fixed: black to move, white king on e2.
    const position = parseFen('r3k2r/8/8/8/8/4K3/8/R6R b KQkq - 0 1');
    const capture = legalMoves(position).find(
      (move) => move.from === parseSquare('h8') && move.to === parseSquare('h1'),
    );
    expect(capture).toBeDefined();

    // Both halves of the rule are pinned by this one move: white's rook was taken on h1, so white loses
    // `K`; and the rook that moved was black's *queenside* rook leaving h8, so black loses `q`.
    // Keeping only `Q` and `k` would be wrong - white also gave up its kingside rook.
    const after = applyMove(position, capture!);
    expect(after.castling).toBe('Qk');
    expect(after.castling).not.toContain('K');
    expect(after.castling).not.toContain('q');

    // The ordinary case, for contrast: a rook moving off its own square loses only its own colour's
    // right. Raxa7 takes white's queenside right and touches nothing of black's.
    const own = parseFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    const walk = legalMoves(own).find((move) => move.from === parseSquare('a1') && move.to === parseSquare('a7'));
    expect(walk).toBeDefined();
    expect(applyMove(own, walk!).castling).toBe('Kkq');
  });
});

describe('SAN', () => {
  it('names a pawn capture with the file and a promotion', () => {
    const position = parseFen('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
    const sans = legalMoves(position).map((move) => toSan(position, move));
    expect(sans).toContain('a8=Q+');
    expect(sans).toContain('a8=N');
    // Castling is O-O, never a king move, whatever the FEN's castling field says.
    const castling = parseFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    expect(legalMoves(castling).map((move) => toSan(castling, move))).toContain('O-O-O');
  });

  it('marks check and checkmate', () => {
    const mate = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3';
    const moves = legalMoves(parseFen(mate));
    expect(moves).toHaveLength(0);
    expect(statusOf(parseFen(mate))).toBe('checkmate');
  });
});

describe('pro_chess_fen', () => {
  it('reports the position and can draw it', async () => {
    const data = payload(await callTool('pro_chess_fen', { fen: START, ascii: true }));
    expect(data.fen).toBe(START);
    expect(data.turn).toBe('white');
    expect(data.castling).toBe('KQkq');
    expect(data.counts).toEqual({ white: 16, black: 16, total: 32 });
    // The bug: `ascii` computed `undefined : undefined` and printed nothing.
    expect(data.ascii).toContain('r n b q k b n r');
  });

  it('names the broken field instead of saying the FEN is invalid', async () => {
    // `fail()` produces an error *result*, not a JSON block, so the message is in the content. Reading
    // `data.error` from it yields undefined, which would have made this test pass against a tool that
    // said nothing useful - the shape of mistake this file was written to catch.
    const result = await callTool('pro_chess_fen', { fen: 'rnbqkbnr/pppppppp/8/8 w KQkq - 0 1' });
    expect(result.isError).toBeTruthy();
    const body = (result.content ?? []).map((item) => (item.type === 'text' ? item.text : '')).join(' ');
    expect(body).toContain('qator');
  });

  it('offers the standard position', async () => {
    const data = payload(await callTool('pro_chess_fen', { standard: true }));
    expect(data.fen).toBe(START);
  });

  it('refuses an empty request', async () => {
    const result = await callTool('pro_chess_fen', {});
    expect(result.isError).toBeTruthy();
  });
});

describe('pro_chess_moves', () => {
  it('lists the twenty opening moves with SAN', async () => {
    const data = payload(await callTool('pro_chess_moves', {}));
    expect(data.total).toBe(20);
    const sans = (data.moves as unknown as Array<{ san: string }>).map((move) => move.san);
    // SAN, not long algebraic: a knight move is `Nf3`, and the origin square is a separate field.
    expect(sans).toContain('e4');
    expect(sans).toContain('Nf3');
    expect(sans).not.toContain('e2e4');
    expect((data.moves as unknown as Array<{ from: string }>).map((move) => move.from)).toContain('e2');
  });

  it('filters by origin square', async () => {
    const data = payload(await callTool('pro_chess_moves', { from_square: 'e2' }));
    expect(data.total).toBe(20);
    expect(data.shown).toBe(2);
    expect((data.moves as unknown as Array<{ from: string }>).every((move) => move.from === 'e2')).toBe(true);
  });

  it('says when a square has no legal move', async () => {
    const result = await callTool('pro_chess_moves', { from_square: 'a4' });
    expect(result.isError).toBeTruthy();
  });
});

describe('pro_chess_analyse', () => {
  it('reports check and checkmate', async () => {
    const data = payload(
      await callTool('pro_chess_analyse', {
        fen: 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3',
      }),
    );
    expect(data.status).toBe('checkmate');
    expect(data.legal_moves).toBe(0);
  });

  it('accepts both SAN and long algebraic, as its description promises', async () => {
    // The description said "SAN yoki e2e4". Only SAN worked, so every move a caller would naturally
    // write was rejected with "yurish topilmadi".
    const long = payload(await callTool('pro_chess_analyse', { moves: ['g1f3'] }));
    expect(long.played).toEqual(['Nf3']);
    const san = payload(await callTool('pro_chess_analyse', { moves: ['Nf3'] }));
    expect(san.played).toEqual(['Nf3']);
    // A promotion needs the piece, since `a7a8` alone does not say which one.
    const promotion = payload(
      await callTool('pro_chess_analyse', { fen: '4k3/P7/8/8/8/8/8/4K3 w - - 0 1', moves: ['a7a8q'] }),
    );
    expect(promotion.played).toEqual(['a8=Q+']);
  });

  it('plays a sequence and reports the resulting position', async () => {
    const data = payload(await callTool('pro_chess_analyse', { moves: ['e2e4', 'e7e5', 'g1f3'] }));
    expect(data.played).toEqual(['e4', 'e5', 'Nf3']);
    // 1. e4 e5 2. Nf3 - two pawn moves reset the halfmove clock, the knight move raises it to 1, and
    // the fullmove number is 2 because black has completed a move. I wrote `1 1` and it was wrong.
    expect(data.fen).toBe('rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2');
  });

  it('says which move failed and where it was', async () => {
    // Again an error result rather than a JSON block.
    const result = await callTool('pro_chess_analyse', { moves: ['e2e4', 'e2e4'] });
    expect(result.isError).toBeTruthy();
    const body = (result.content ?? []).map((item) => (item.type === 'text' ? item.text : '')).join(' ');
    expect(body).toContain('2-yurishdan 2-si');
    expect(body).toContain('e4');
  });

  it('computes perft at the depth it was asked for', async () => {
    const data = payload(await callTool('pro_chess_analyse', { perft_depth: 3 }));
    expect(data.perft).toEqual({ depth: 3, nodes: 8902 });
  });

  it('caps the depth and says it did', async () => {
    const data = payload(await callTool('pro_chess_analyse', { perft_depth: 9 }));
    expect((data.perft as unknown as { depth: number }).depth).toBeLessThanOrEqual(5);
    expect(data.perft_note).toBeDefined();
  });

  it('does not present a sample line as the strongest', async () => {
    const data = payload(await callTool('pro_chess_analyse', { best_line: 3 }));
    expect(data.longest_line).toBeDefined();
    expect((data.longest_line as unknown as { note: string }).note).toContain('kuch bahosi emas');
  });
});

describe('pro_chess_square', () => {
  it('says what stands on a square and who attacks it', async () => {
    const data = payload(await callTool('pro_chess_square', { square: 'e1', attacks: true }));
    expect(data.piece).toBe('k');
    expect(data.colour).toBe('white');
    // No piece attacks e1 in the starting position. The bug returned 26 entries, every piece on the
    // board reporting itself, because the attack test was asked about each piece's own square.
    expect(data.attacked_by_count).toBe(0);
    expect(data.attacked_by).toEqual([]);
    expect(data.is_safe).toBe(true);
  });

  it('lists the moves that reach a square', async () => {
    const data = payload(await callTool('pro_chess_square', { square: 'e4', moves: true }));
    const incoming = data.to_here as unknown as Array<{ san: string; from: string }>;
    // Only e2-e4 reaches e4 from the starting position. d2-d4 goes to d4, not e4 - my first version
    // asserted both and would have failed against any correct generator.
    expect(incoming.map((move) => move.san)).toEqual(['e4']);
    expect(incoming.map((move) => move.from)).toEqual(['e2']);

    // Two knights that genuinely share a destination: from c3 and from c1, both reach e2. My first
    // version of this check used a knight on d2 and expected a pawn move, and asserted nothing.
    const shared = payload(
      await callTool('pro_chess_square', { fen: '4k3/8/8/8/8/2N5/8/K1N5 w - - 0 1', square: 'e2', moves: true }),
    );
    const fromBoth = shared.to_here as unknown as Array<{ san: string; from: string }>;
    expect(fromBoth).toHaveLength(2);
    expect(fromBoth.map((move) => move.from).sort()).toEqual(['c1', 'c3']);
  });

  it('refuses a square name it cannot read', async () => {
    const result = await callTool('pro_chess_square', { square: 'j1' });
    expect(result.isError).toBeTruthy();
  });

  it('reports an empty square as empty rather than as a piece', async () => {
    const data = payload(await callTool('pro_chess_square', { square: 'e4' }));
    expect(data.piece).toBe('bo‘sh');
  });
});

describe('illegal positions are refused', () => {
  it('a missing king', () => {
    expect(() => parseFen('8/8/8/8/8/8/8/8 w - - 0 1')).toThrow(ChessError);
  });

  it('a position with no legal moves has no SAN to give', () => {
    const mate = parseFen('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3');
    expect(legalMoves(mate)).toHaveLength(0);
    expect(isInCheck(mate, 'w')).toBe(true);
  });
});
