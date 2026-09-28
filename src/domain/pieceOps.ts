import { makePieceId, mirrorPieceInPlace, rotatePieceInPlace, type FilledPiece, type Piece2D } from './customShape';

/**
 * Appends filled pieces (without IDs) to the pieces array, assigning fresh IDs.
 * Returns a new array. Returns the SAME array reference if nothing changed.
 */
export function addFilledPieces(pieces: Piece2D[], filled: FilledPiece[]): Piece2D[] {
  if (filled.length === 0) {
    return pieces;
  }
  return [...pieces, ...filled.map((p) => ({ ...p, id: makePieceId() }))];
}

/**
 * Removes a piece by ID from the array.
 * Returns a new array. Returns the SAME array reference if the ID wasn't found.
 */
export function removePieceById(pieces: Piece2D[], id: string): Piece2D[] {
  const found = pieces.some((p) => p.id === id);
  if (!found) {
    return pieces;
  }
  return pieces.filter((p) => p.id !== id);
}

/**
 * Moves a piece to a new (x, y) position.
 * Returns a new array. Returns the SAME array reference if the ID wasn't found.
 */
export function movePieceTo(pieces: Piece2D[], id: string, x: number, y: number): Piece2D[] {
  const found = pieces.some((p) => p.id === id);
  if (!found) {
    return pieces;
  }
  return pieces.map((p) => (p.id === id ? { ...p, x, y } : p));
}

/**
 * Rotates a piece by ID in place (swaps w/d for rectangles, advances corner for triangles).
 * Returns a new array. Returns the SAME array reference if the ID wasn't found.
 */
export function rotatePieceById(pieces: Piece2D[], id: string): Piece2D[] {
  const found = pieces.some((p) => p.id === id);
  if (!found) {
    return pieces;
  }
  return pieces.map((p) => (p.id === id ? rotatePieceInPlace(p) : p));
}

/**
 * Mirrors a piece by ID in place (mirrors diagonal for non-square cornered pieces).
 * Returns a new array. Returns the SAME array reference if the ID wasn't found.
 */
export function mirrorPieceById(pieces: Piece2D[], id: string): Piece2D[] {
  const found = pieces.some((p) => p.id === id);
  if (!found) {
    return pieces;
  }
  return pieces.map((p) => (p.id === id ? mirrorPieceInPlace(p) : p));
}
