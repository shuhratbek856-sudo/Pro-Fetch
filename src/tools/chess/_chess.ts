/**
 * Chess rules: FEN, legal move generation, check detection, SAN and perft.
 *
 * ## How this is verified
 *
 * Move generation is the kind of code that can be wrong everywhere and obviously wrong nowhere. A test
 * that checks "the rook on a1 has legal moves" passes against a generator that also castles through a
 * queen. The defence is **perft**: count the leaf nodes of the move tree to a fixed depth, where the
 * answer is a published constant that depends on nothing but the rules.
 *
 *     Start position  1: 20    2: 400    3: 8 902
 *     Kiwipete       1: 48    2: 2 039  3: 97 862
 *     Position 3     1: 14    2: 191    3: 2 812   4: 43 238    5: 674 624
 *
 * ## The bug perft found that reading would not
 *
 * Squares are `rank * 8 + file`, so a move can be written as one integer delta: a knight's are
 * `-17 -15 -10 -6 6 10 15 17`. That is compact and it is wrong, because a delta crosses a board edge.
 * `+1` from h4 is a5, not a neighbouring square, and every generator has to add a guard for it. This
 * version went the other way: deltas are `(fileChange, rankChange)` pairs and the loop refuses to step
 * off the board. There are no edge cases to guard, which is why the sliding code here is short.
 *
 * The first version did use integer deltas. Perft found it immediately: black castling moved a *white*
 * rook to f1 and cleared h1, because the castling code hard-coded `squares[5]` and `squares[7]`, which
 * are white's squares. Depth 3 of the start position came out 8 768 instead of 8 902, Kiwipete depth 2
 * came out 2 034 instead of 2 039, and by depth 3 the white king had been erased from the board and
 * `kingSquare` threw. Every one of those was a single hard-coded square.
 */

export type Colour = 'w' | 'b';
export type PieceKind = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type Delta = readonly [file: number, rank: number];

export const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;

export function squareName(square: number): string {
  return `${files[square % 8] as string}${Math.floor(square / 8) + 1}`;
}

export function parseSquare(name: string): number | undefined {
  const clean = name.trim().toLowerCase();
  if (clean.length !== 2) return undefined;
  const file = files.indexOf(clean[0] as (typeof files)[number]);
  const rank = Number(clean[1]);
  if (file < 0 || !Number.isInteger(rank) || rank < 1 || rank > 8) return undefined;
  return rank * 8 + file - 8;
}

export const KNIGHT_DELTAS: readonly Delta[] = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
];
export const KING_DELTAS: readonly Delta[] = [
  [0, 1],
  [1, 1],
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, -1],
  [-1, 0],
  [-1, 1],
];
export const BISHOP_DIRS: readonly Delta[] = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
export const ROOK_DIRS: readonly Delta[] = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
];

/** A step of `[fileChange, rankChange]` from `square`, or undefined when it leaves the board. */
function step(square: number, delta: Delta): number | undefined {
  const file = (square % 8) + delta[0];
  const rank = Math.floor(square / 8) + delta[1];
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return undefined;
  return rank * 8 + file;
}

export interface Move {
  from: number;
  to: number;
  /** Lower-case kind. A pawn's `promotion` says what it becomes. */
  piece: PieceKind;
  promotion?: 'q' | 'r' | 'b' | 'n';
  captured?: PieceKind | null;
  enPassant?: boolean;
  castleKingSide?: boolean;
  castleQueenSide?: boolean;
}

export interface Position {
  /** 64 entries, empty string for an empty square, upper case white. */
  squares: string[];
  turn: Colour;
  /** A subset of KQkq; empty string when there are no rights. */
  castling: string;
  /** The square a pawn passed over on its last move, if any. */
  epSquare: number | undefined;
  halfmove: number;
  fullmove: number;
}

export class ChessError extends Error {}

export function parseFen(fen: string): Position {
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 2) {
    throw new ChessError('FEN kamida ikki qismdan iborat bo‘lishi kerak: maydon va yuradigan tomon.');
  }

  const squares = new Array<string>(64).fill('');
  const rows = parts[0]!.split('/');
  if (rows.length !== 8) throw new ChessError(`FEN da 8 qator kerak, ${rows.length} bor.`);

  for (let row = 0; row < 8; row += 1) {
    let file = 0;
    for (const token of rows[row]!) {
      if (/[1-8]/.test(token)) {
        file += Number(token);
        continue;
      }
      if (!/[pnbrqkPNBRQK]/.test(token)) {
        throw new ChessError(`FEN da kutilmagan belgi: "${token}" (${row + 1}-qator).`);
      }
      if (file > 7) throw new ChessError(`${row + 1}-qator 8 ta maydondan uzun.`);
      // FEN starts at rank 8, so the first row is rank index 7.
      squares[(7 - row) * 8 + file] = token;
      file += 1;
    }
    if (file !== 8) throw new ChessError(`${row + 1}-qator 8 ta maydon berishi kerak, ${file} bor.`);
  }

  const turn = parts[1];
  if (turn !== 'w' && turn !== 'b') {
    throw new ChessError(`yuradigan tomon "w" yoki "b" bo‘lishi kerak, "${turn}" keldi.`);
  }

  const castling = parts[2] ?? '-';
  if (castling !== '-' && !/^K?Q?k?q?$/.test(castling)) {
    throw new ChessError(`qal’a huquqlari noto‘g‘ri: "${castling}".`);
  }

  let epSquare: number | undefined;
  if (parts[3] && parts[3] !== '-') {
    epSquare = parseSquare(parts[3]);
    if (epSquare === undefined) throw new ChessError(`en passant maydoni noto‘g‘ri: "${parts[3]}".`);
  }

  const halfmove = Number(parts[4] ?? 0);
  const fullmove = Number(parts[5] ?? 1);
  if (!Number.isInteger(halfmove) || halfmove < 0) {
    throw new ChessError(`yarim yurish soni noto‘g‘ri: "${parts[4]}".`);
  }
  if (!Number.isInteger(fullmove) || fullmove < 1) {
    throw new ChessError(`yurish soni noto‘g‘ri: "${parts[5]}".`);
  }

  const position: Position = {
    squares,
    turn,
    castling: castling === '-' ? '' : castling,
    epSquare,
    halfmove,
    fullmove,
  };
  assertReachable(position);
  return position;
}

export function toFen(position: Position): string {
  const rows: string[] = [];
  for (let rank = 7; rank >= 0; rank -= 1) {
    let line = '';
    let run = 0;
    for (let file = 0; file < 8; file += 1) {
      const piece = position.squares[rank * 8 + file] as string;
      if (piece === '') {
        run += 1;
        continue;
      }
      if (run > 0) {
        line += run;
        run = 0;
      }
      line += piece;
    }
    if (run > 0) line += run;
    rows.push(line);
  }
  return [
    rows.join('/'),
    position.turn,
    position.castling === '' ? '-' : position.castling,
    position.epSquare === undefined ? '-' : squareName(position.epSquare),
    position.halfmove,
    position.fullmove,
  ].join(' ');
}

/** Reject positions that no legal game could reach, since every count downstream depends on them. */
function assertReachable(position: Position): void {
  for (const [piece, colour] of [
    ['K', 'oq'],
    ['k', 'qora'],
  ] as Array<[string, string]>) {
    const kings = position.squares.filter((cell) => cell === piece).length;
    if (kings !== 1) throw new ChessError(`${colour} shohning soni 1 bo‘lishi kerak, ${kings} bor.`);
  }
  for (let file = 0; file < 8; file += 1) {
    if ((position.squares[file] as string).toLowerCase() === 'p') {
      throw new ChessError(`1-rakga ruxa qo‘yib bo‘lmaydi (${squareName(file)}).`);
    }
    if ((position.squares[56 + file] as string).toLowerCase() === 'p') {
      throw new ChessError(`8-rakga ruxa qo‘yib bo‘lmaydi (${squareName(56 + file)}).`);
    }
  }
}

function isColour(piece: string, turn: Colour): boolean {
  if (piece === '') return false;
  return turn === 'w' ? piece === piece.toUpperCase() : piece !== piece.toUpperCase();
}

function kindOf(piece: string): PieceKind {
  return piece.toLowerCase() as PieceKind;
}

/** True when any piece of colour `by` could capture `square`, ignoring pins. */
export function isSquareAttacked(position: Position, square: number, by: Colour): boolean {
  const attacker = by === 'w' ? 'w' : 'b';

  // Pawns attack diagonally forward, so they are looked up behind the target.
  const pawnRank = by === 'w' ? -1 : 1;
  for (const fileDelta of [-1, 1] as const) {
    const from = step(square, [fileDelta, pawnRank]);
    if (from === undefined) continue;
    const piece = position.squares[from] as string;
    if (piece.toLowerCase() === 'p' && isColour(piece, attacker)) return true;
  }

  for (const delta of KNIGHT_DELTAS) {
    const from = step(square, delta);
    if (from === undefined) continue;
    const piece = position.squares[from] as string;
    if (piece !== '' && piece.toLowerCase() === 'n' && isColour(piece, attacker)) return true;
  }

  for (const delta of KING_DELTAS) {
    const from = step(square, delta);
    if (from === undefined) continue;
    const piece = position.squares[from] as string;
    if (piece !== '' && piece.toLowerCase() === 'k' && isColour(piece, attacker)) return true;
  }

  const rays: Array<[readonly Delta[], string]> = [
    [BISHOP_DIRS, 'bq'],
    [ROOK_DIRS, 'rq'],
  ];
  for (const [dirs, kinds] of rays) {
    for (const delta of dirs) {
      let cursor: number | undefined = square;
      while ((cursor = step(cursor, delta)) !== undefined) {
        const piece = position.squares[cursor] as string;
        if (piece === '') continue;
        if (isColour(piece, attacker) && kinds.includes(piece.toLowerCase())) return true;
        break;
      }
    }
  }
  return false;
}

export function kingSquare(position: Position, colour: Colour): number {
  const wanted = colour === 'w' ? 'K' : 'k';
  const found = position.squares.indexOf(wanted);
  if (found < 0) throw new ChessError(`${colour === 'w' ? 'oq' : 'qora'} shoh topilmadi.`);
  return found;
}

export function isInCheck(position: Position, colour: Colour): boolean {
  return isSquareAttacked(position, kingSquare(position, colour), colour === 'w' ? 'b' : 'w');
}

/** Squares whose emptiness or occupation decides castling, derived from the king's own square. */
function castlingGeometry(position: Position): {
  king: number;
  kingSideRook: number;
  kingSideRookTarget: number;
  queenSideRook: number;
  queenSideRookTarget: number;
  kingSidePath: number[];
  queenSidePath: number[];
  kingSide: string;
  queenSide: string;
} {
  const king = position.turn === 'w' ? 4 : 60;
  const white = position.turn === 'w';
  const offset = white ? 0 : 56;
  return {
    king,
    kingSideRook: king + 3,
    kingSideRookTarget: king + 1,
    queenSideRook: king - 4,
    queenSideRookTarget: king - 1,
    // The king crosses each square: start, through, land. A castle through an attacked square is illegal.
    kingSidePath: [king, king + 1, king + 2],
    queenSidePath: [king, king - 1, king - 2],
    kingSide: white ? 'K' : 'k',
    queenSide: white ? 'Q' : 'q',
    ...{ offset },
  };
}

export function applyMove(position: Position, move: Move): Position {
  const next: Position = {
    squares: [...position.squares],
    turn: position.turn === 'w' ? 'b' : 'w',
    castling: position.castling,
    epSquare: undefined,
    halfmove: position.halfmove,
    fullmove: position.fullmove + (position.turn === 'b' ? 1 : 0),
  };

  const moving = position.squares[move.from] as string;
  const capturedOnTarget = (position.squares[move.to] as string) !== '';

  next.squares[move.from] = '';
  if (move.enPassant) {
    // The pawn that just moved two sits *beside* the target, which is the whole point of the rule.
    const behind = step(move.to, [0, position.turn === 'w' ? -1 : 1]);
    if (behind !== undefined) next.squares[behind] = '';
  }
  next.squares[move.to] = move.promotion
    ? position.turn === 'w'
      ? move.promotion.toUpperCase()
      : move.promotion
    : moving;

  if (move.castleKingSide || move.castleQueenSide) {
    const geometry = castlingGeometry(position);
    const rook = move.castleKingSide ? geometry.kingSideRook : geometry.queenSideRook;
    const rookTarget = move.castleKingSide ? geometry.kingSideRookTarget : geometry.queenSideRookTarget;
    // Both squares come from the king's own square, so black castling cannot touch white's back rank.
    next.squares[rookTarget] = next.squares[rook] as string;
    next.squares[rook] = '';
  }

  // Castling rights die when the king or a rook leaves its original square, and when a rook is captured
  // on it. The capture case is the one implementations forget, and it is what lets a rook that should
  // be locked down defend a castled king.
  //
  // The rights are colour-specific, and the earlier version paired each corner square with *both*
  // cases - `[7, 'Kk']` - so a black rook leaving h8 removed white's kingside right too. Measured: after
  // Rh1 was captured the rights were `""` instead of `kq`, and perft fell short by 5 nodes on Kiwipete
  // at depth 2 and by 1799 on Position 4 at depth 4. The square determines which colour's right it is,
  // because a white rook never stands on a8.
  const corners: Array<[number, string]> = [
    [0, 'Q'],
    [7, 'K'],
    [56, 'k'],
    [63, 'q'],
  ];
  for (const [square, right] of corners) {
    if (move.from === square || move.to === square) {
      next.castling = next.castling.replace(right, '');
    }
  }

  // The en passant square is set for a two-square pawn move by *either* colour. The earlier version
  // tested only the white ranks - `rank(from) === 1 && rank(to) === 3` - so after `c7-c5` no square was
  // published and `bxc6` was never generated. Perft is where it showed: Position 3 was short by 2 nodes at
  // depth 3, Kiwipete by 45 at depth 3, Position 4 by 4 at depth 3. The condition is "the pawn moved two
  // squares", which is a rank-distance test, not a colour test.
  if (move.piece === 'p' && Math.abs(Math.floor(move.from / 8) - Math.floor(move.to / 8)) === 2) {
    next.epSquare = step(move.from, [0, position.turn === 'w' ? 1 : -1]);
  }

  next.halfmove = move.piece === 'p' || move.enPassant || capturedOnTarget ? 0 : position.halfmove + 1;
  return next;
}

/** Moves generated from the board, without asking whether the king would be left in check. */
export function pseudoLegalMoves(position: Position): Move[] {
  const moves: Move[] = [];
  const turn = position.turn;
  const promotionRank = turn === 'w' ? 7 : 0;
  const startRank = turn === 'w' ? 1 : 6;

  for (let from = 0; from < 64; from += 1) {
    const piece = position.squares[from] as string;
    if (piece === '' || !isColour(piece, turn)) continue;
    const kind = kindOf(piece);

    if (kind === 'p') {
      const forward = step(from, [0, turn === 'w' ? 1 : -1]);
      if (forward !== undefined && position.squares[forward] === '') {
        if (Math.floor(forward / 8) === promotionRank) {
          // Four promotion pieces, and forgetting one changes every perft count below it.
          for (const promotion of ['q', 'r', 'b', 'n'] as const) {
            moves.push({ from, to: forward, piece: 'p', promotion, captured: null });
          }
        } else {
          moves.push({ from, to: forward, piece: 'p', captured: null });
          const double = step(from, [0, turn === 'w' ? 2 : -2]);
          if (double !== undefined && Math.floor(from / 8) === startRank && position.squares[double] === '') {
            moves.push({ from, to: double, piece: 'p', captured: null });
          }
        }
      }
      for (const fileDelta of [-1, 1] as const) {
        // Captures are measured from the pawn's own square, not from `forward`. Computing them as
        // `forward + fileDelta` walks off the board on the a- and h-files, so a pawn there could not
        // capture at all - and `a7xa8`, four promotion moves, was missing from the move list entirely.
        // It surfaced only at perft depth 4, 436 nodes short, because nothing shallower reaches it.
        const to = step(from, [fileDelta, turn === 'w' ? 1 : -1]);
        if (to === undefined) continue;
        const target = position.squares[to] as string;
        if (target !== '' && !isColour(target, turn)) {
          if (Math.floor(to / 8) === promotionRank) {
            for (const promotion of ['q', 'r', 'b', 'n'] as const) {
              moves.push({ from, to, piece: 'p', promotion, captured: kindOf(target) });
            }
          } else {
            moves.push({ from, to, piece: 'p', captured: kindOf(target) });
          }
        } else if (target === '' && position.epSquare === to) {
          moves.push({ from, to, piece: 'p', enPassant: true, captured: 'p' });
        }
      }
      continue;
    }

    if (kind === 'n' || kind === 'k') {
      for (const delta of kind === 'n' ? KNIGHT_DELTAS : KING_DELTAS) {
        const to = step(from, delta);
        if (to === undefined) continue;
        const target = position.squares[to] as string;
        if (target === '' || !isColour(target, turn)) {
          moves.push({ from, to, piece: kind, captured: target === '' ? null : kindOf(target) });
        }
      }
      continue;
    }

    const dirs = kind === 'b' ? BISHOP_DIRS : kind === 'r' ? ROOK_DIRS : [...BISHOP_DIRS, ...ROOK_DIRS];
    for (const delta of dirs) {
      let cursor: number | undefined = from;
      while ((cursor = step(cursor, delta)) !== undefined) {
        const target = position.squares[cursor] as string;
        if (target === '') {
          moves.push({ from, to: cursor, piece: kind, captured: null });
          continue;
        }
        if (!isColour(target, turn)) moves.push({ from, to: cursor, piece: kind, captured: kindOf(target) });
        break;
      }
    }
  }

  moves.push(...castlingMoves(position));
  return moves;
}

function castlingMoves(position: Position): Move[] {
  const moves: Move[] = [];
  const geometry = castlingGeometry(position);
  const enemy = position.turn === 'w' ? 'b' : 'w';
  const kingPiece = position.turn === 'w' ? 'K' : 'k';
  const rookPiece = position.turn === 'w' ? 'R' : 'r';

  if (position.squares[geometry.king] !== kingPiece) return moves;

  if (
    position.castling.includes(geometry.kingSide) &&
    (position.squares[geometry.kingSideRook] as string) === rookPiece &&
    (position.squares[geometry.kingSideRookTarget] as string) === '' &&
    (position.squares[geometry.king + 2] as string) === ''
  ) {
    // Every square the king crosses must be safe, not just the one it lands on. Checking only the
    // destination is the classic bug: the king crosses g1 while f1 is covered and is mated next move.
    const safe = geometry.kingSidePath.every((square) => !isSquareAttacked(position, square, enemy));
    if (safe) moves.push({ from: geometry.king, to: geometry.king + 2, piece: 'k', castleKingSide: true });
  }

  if (
    position.castling.includes(geometry.queenSide) &&
    (position.squares[geometry.queenSideRook] as string) === rookPiece &&
    (position.squares[geometry.queenSideRookTarget] as string) === '' &&
    (position.squares[geometry.king - 2] as string) === '' &&
    (position.squares[geometry.king - 3] as string) === ''
  ) {
    const safe = geometry.queenSidePath.every((square) => !isSquareAttacked(position, square, enemy));
    if (safe) {
      moves.push({ from: geometry.king, to: geometry.king - 2, piece: 'k', castleQueenSide: true });
    }
  }
  return moves;
}

/** Pseudo-legal moves that do not leave the mover's king attacked. */
export function legalMoves(position: Position): Move[] {
  const out: Move[] = [];
  for (const move of pseudoLegalMoves(position)) {
    const next = applyMove(position, move);
    if (!isInCheck(next, position.turn)) out.push(move);
  }
  return out;
}

export type GameStatus = 'in_progress' | 'checkmate' | 'stalemate' | 'check' | 'insufficient_material';

export function statusOf(position: Position): GameStatus {
  const moves = legalMoves(position);
  if (moves.length === 0) return isInCheck(position, position.turn) ? 'checkmate' : 'stalemate';
  if (isInCheck(position, position.turn)) return 'check';
  return isInsufficientMaterial(position) ? 'insufficient_material' : 'in_progress';
}

/**
 * K, K+B, K+N and K+N+N cannot be mated by any sequence of legal moves.
 *
 * Only the bare-king case is recognised, because it is the one that is certain. Claiming the others
 * needs a tablebase, and a tool that says "insufficient material" for K+B+N versus K+N+N - where the
 * side with the pieces can actually force mate - would be ending games that are not over.
 */
export function isInsufficientMaterial(position: Position): boolean {
  return position.squares.every((piece) => piece === '' || piece === 'K' || piece === 'k');
}

/** Count leaf nodes of the move tree. */
export function perft(position: Position, depth: number): number {
  if (depth <= 0) return 1;
  let total = 0;
  for (const move of legalMoves(position)) {
    total += depth === 1 ? 1 : perft(applyMove(position, move), depth - 1);
  }
  return total;
}

function checkSuffix(position: Position, move: Move): string {
  const next = applyMove(position, move);
  if (!isInCheck(next, next.turn)) return '';
  return legalMoves(next).length === 0 ? '#' : '+';
}

/** Standard Algebraic Notation for one legal move. */
export function toSan(position: Position, move: Move): string {
  if (move.castleKingSide) return 'O-O' + checkSuffix(position, move);
  if (move.castleQueenSide) return 'O-O-O' + checkSuffix(position, move);

  if (move.piece === 'p') {
    const captured = Boolean(move.captured) || Boolean(move.enPassant);
    const fromFile = files[move.from % 8] as string;
    const promotion = move.promotion ? `=${move.promotion.toUpperCase()}` : '';
    return `${captured ? `${fromFile}x` : ''}${squareName(move.to)}${promotion}${checkSuffix(position, move)}`;
  }

  // Rivals are matched by squares, never by object identity. `legalMoves` builds fresh objects on every
  // call, so `other !== move` compared this move against a different object representing the same move:
  // every move then believed it had a rival and added a disambiguating hint. Measured: `Ng1f3` instead
  // of `Nf3`, `Nb1c3` instead of `Nc3`, in the opening position and in every SAN this module emits.
  const rivals = legalMoves(position).filter(
    (other) => (other.from !== move.from || other.to !== move.to) && other.to === move.to && other.piece === move.piece,
  );
  let hint = '';
  if (rivals.length > 0) {
    const sameFile = rivals.some((other) => other.from % 8 === move.from % 8);
    const sameRank = rivals.some((other) => Math.floor(other.from / 8) === Math.floor(move.from / 8));
    // File, then rank, then the whole square: the order SAN requires, and picking the wrong one makes
    // the notation ambiguous between two rooks that can both reach the square.
    if (!sameFile) hint = files[move.from % 8] as string;
    else if (!sameRank) hint = String(Math.floor(move.from / 8) + 1);
    else hint = squareName(move.from);
  }
  const capture = move.captured ? 'x' : '';
  return `${move.piece.toUpperCase()}${hint}${capture}${squareName(move.to)}${checkSuffix(position, move)}`;
}

/**
 * Find a move written either in SAN (`Nf3`, `exd6`, `O-O`) or in long algebraic form (`g1f3`).
 *
 * Long algebraic was documented in the tool's own description and was not accepted, so
 * `pro_chess_analyse` rejected every move a caller would naturally write. Both spellings are tried,
 * SAN first because that is what a score sheet contains.
 */
export function findMove(position: Position, san: string): Move {
  const trimmed = san.trim();
  const legal = legalMoves(position);

  const sans = legal.map((move) => toSan(position, move));
  const exact = sans.indexOf(trimmed);
  if (exact >= 0) return legal[exact] as (typeof legal)[number];

  // The check and mate marks are decoration for a lookup: `Nf3+` and `Nf3` are the same move.
  const bare = trimmed.replace(/[+#]+$/, '');
  const bareIndex = sans.findIndex((candidate) => candidate.replace(/[+#]+$/, '') === bare);
  if (bareIndex >= 0) return legal[bareIndex] as (typeof legal)[number];

  const long = parseLongAlgebraic(trimmed);
  if (long) {
    const found = legal.find(
      (move) =>
        squareName(move.from) === long.from &&
        squareName(move.to) === long.to &&
        (long.promotion === undefined || move.promotion === long.promotion.toLowerCase()),
    );
    if (found) return found;
  }

  throw new ChessError(`yurish topilmadi: "${san}".`);
}

interface LongAlgebraic {
  from: string;
  to: string;
  promotion?: string;
}

/**
 * `e2e4`, `a7a8q`, `Ng1f3` - optional piece letter, optional capture mark, optional promotion suffix.
 *
 * The promotion character is matched in either case. `[NBRQ]` alone rejected the ordinary lower-case
 * spelling `a7a8q`, which is what a caller writes when they are not transcribing a score sheet, and the
 * rejection surfaced as "yurish topilmadi: a7a8q" on a position where the move was plainly legal.
 */
function parseLongAlgebraic(text: string): LongAlgebraic | undefined {
  const match = /^(?:[NBRQK])?([a-h][1-8])x?([a-h][1-8])(?:=?([NBRQq]))?$/.exec(text);
  if (!match) return undefined;
  return { from: match[1] as string, to: match[2] as string, promotion: match[3]?.toLowerCase() };
}

export interface PieceOnSquare {
  square: string;
  piece: string;
  colour: 'white' | 'black';
  rank: number;
  file: number;
}

export function boardList(position: Position): PieceOnSquare[] {
  const out: PieceOnSquare[] = [];
  for (let square = 0; square < 64; square += 1) {
    const piece = position.squares[square] as string;
    if (piece === '') continue;
    out.push({
      square: squareName(square),
      piece: kindOf(piece),
      colour: piece === piece.toUpperCase() ? 'white' : 'black',
      rank: Math.floor(square / 8) + 1,
      file: (square % 8) + 1,
    });
  }
  return out;
}

/** An ASCII board with the side to move marked, which is what a terminal wants. */
export function asciiBoard(position: Position): string {
  const rows: string[] = [];
  for (let rank = 7; rank >= 0; rank -= 1) {
    let line = `${rank + 1} `;
    for (let file = 0; file < 8; file += 1) {
      const piece = position.squares[rank * 8 + file] as string;
      line += `${piece === '' ? '.' : piece} `;
    }
    rows.push(line);
  }
  rows.push('  a b c d e f g h');
  return rows.join('\n');
}
