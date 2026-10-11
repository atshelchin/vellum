/**
 * The shape of a page, seen end-on: a curve in the plane across the book,
 * starting where the page is bound and running out to its edge. x is across
 * the book and y is up off the desk. A page does not stretch, so every curve
 * here is the same length, cut into the same number of equal pieces.
 *
 * Curves are written as x, y pairs: `SEGMENTS + 1` points, `(SEGMENTS + 1) * 2`
 * numbers.
 */

/** How many pieces a page is cut into across its width. */
export const SEGMENTS = 30;
export const CURVE_SIZE = (SEGMENTS + 1) * 2;

/**
 * How far ahead of the bound edge the free edge runs while a page turns, as a
 * share of the turn. It is what makes a page curl instead of swinging like a
 * door.
 */
const LEAD = 0.3;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number) => value * value * (3 - 2 * value);

/**
 * The top page of a stack of pages `thickness` high, lying open.
 *
 * Pages are bound at the bottom of the stack, so the top one has to climb the
 * whole stack before it can lie flat: steeply by the binding, then level, with
 * the slight bow paper has when nothing presses on it. `open` is how far open
 * the book is: at 0 it is shut and the page is flat on top of the block.
 */
export function restCurve(thickness: number, open: number, width: number, out: Float32Array) {
	const reach = 0.012 + thickness * 0.5;
	const bow = 0.011 * open;
	const height = (x: number) =>
		thickness * (1 - open * Math.exp(-x / reach)) +
		bow * Math.sin(Math.PI * Math.min(1, x / width));

	// Walk the curve in steps far finer than a piece, dropping a point each time
	// a piece's length has been covered.
	const piece = width / SEGMENTS;
	const step = piece / 24;
	let x = 0;
	let y = height(0);
	let covered = 0;
	let point = 1;
	out[0] = 0;
	out[1] = y;
	while (point <= SEGMENTS) {
		const nextX = x + step;
		const nextY = height(nextX);
		const length = Math.hypot(nextX - x, nextY - y);
		if (covered + length >= piece) {
			const part = (piece - covered) / length;
			x += (nextX - x) * part;
			y += (nextY - y) * part;
			out[point * 2] = x;
			out[point * 2 + 1] = y;
			point++;
			covered = 0;
		} else {
			covered += length;
			x = nextX;
			y = nextY;
		}
	}
}

/**
 * A page part of the way through a turn.
 *
 * `right` and `left` are the pages it leaves and lands on, each measured
 * outward from the binding. `turn` runs from 0, lying on the right, to 1, lying
 * on the left. In between, each piece of the page leans somewhere between where
 * it started and where it will end, the free edge ahead of the bound one.
 */
export function turnCurve(
	right: Float32Array,
	left: Float32Array,
	turn: number,
	out: Float32Array
) {
	const along = smooth(clamp01(turn));
	let x = 0;
	let y = right[1] + (left[1] - right[1]) * along;
	out[0] = x;
	out[1] = y;

	for (let i = 0; i < SEGMENTS; i++) {
		const fromX = right[i * 2 + 2] - right[i * 2];
		const fromY = right[i * 2 + 3] - right[i * 2 + 1];
		const toX = left[i * 2 + 2] - left[i * 2];
		const toY = left[i * 2 + 3] - left[i * 2 + 1];
		const from = Math.atan2(fromY, fromX);
		// The left page runs the other way across the book.
		const to = Math.PI - Math.atan2(toY, toX);
		const outward = (i + 0.5) / SEGMENTS;
		const weight = smooth(clamp01(turn * (1 + LEAD) - LEAD * (1 - outward)));
		const angle = from + (to - from) * weight;
		// A piece is a straight run between two points of a curve, so where the
		// page bends hardest it is a hair shorter. Each keeps a length between
		// the two it has at rest, which is what lets the page start and end
		// exactly on its stacks.
		const fromLength = Math.hypot(fromX, fromY);
		const piece = fromLength + (Math.hypot(toX, toY) - fromLength) * weight;
		x += Math.cos(angle) * piece;
		y += Math.sin(angle) * piece;
		out[i * 2 + 2] = x;
		out[i * 2 + 3] = y;
	}
}
