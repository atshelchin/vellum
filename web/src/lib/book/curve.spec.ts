import { describe, expect, it } from 'vitest';
import { CURVE_SIZE, restCurve, SEGMENTS, turnCurve } from './curve';

const curve = () => new Float32Array(CURVE_SIZE);

/** The length of a curve, added up piece by piece. */
function length(points: Float32Array): number {
	let total = 0;
	for (let i = 0; i < SEGMENTS; i++) {
		total += Math.hypot(points[i * 2 + 2] - points[i * 2], points[i * 2 + 3] - points[i * 2 + 1]);
	}
	return total;
}

const edge = (points: Float32Array) => ({ x: points[SEGMENTS * 2], y: points[SEGMENTS * 2 + 1] });

describe('a page at rest', () => {
	it('is as long as a page, however thick the stack under it', () => {
		for (const thickness of [0, 0.02, 0.08, 0.15]) {
			const page = curve();
			restCurve(thickness, 1, 1, page);
			expect(length(page)).toBeCloseTo(1, 2);
		}
	});

	it('starts at the binding, on the desk, when the book lies open', () => {
		const page = curve();
		restCurve(0.1, 1, 1, page);
		expect(page[0]).toBe(0);
		expect(page[1]).toBeCloseTo(0, 5);
	});

	it('climbs the stack and then lies level on it', () => {
		const page = curve();
		restCurve(0.1, 1, 1, page);
		const middle = page[SEGMENTS + 1];
		expect(middle).toBeGreaterThan(0.1);
		expect(middle).toBeLessThan(0.125);
		// Its edge falls short of a page's width by about what it spent climbing.
		expect(edge(page).x).toBeLessThan(1);
		expect(edge(page).x).toBeGreaterThan(0.9);
	});

	it('is flat on top of the block when the book is shut', () => {
		const page = curve();
		restCurve(0.1, 0, 1, page);
		for (let i = 0; i <= SEGMENTS; i++) expect(page[i * 2 + 1]).toBeCloseTo(0.1, 5);
		expect(edge(page).x).toBeCloseTo(1, 3);
	});
});

describe('a page being turned', () => {
	const right = curve();
	const left = curve();
	restCurve(0.06, 1, 1, right);
	restCurve(0.04, 1, 1, left);

	it('lies exactly on the right-hand stack before it is turned', () => {
		const page = curve();
		turnCurve(right, left, 0, page);
		for (let i = 0; i < CURVE_SIZE; i++) expect(page[i]).toBeCloseTo(right[i], 4);
	});

	it('lies exactly on the left-hand stack once it is turned, the other way round', () => {
		const page = curve();
		turnCurve(right, left, 1, page);
		for (let i = 0; i <= SEGMENTS; i++) {
			expect(page[i * 2]).toBeCloseTo(-left[i * 2], 4);
			expect(page[i * 2 + 1]).toBeCloseTo(left[i * 2 + 1], 4);
		}
	});

	it('does not stretch on the way', () => {
		const page = curve();
		// At rest the two differ by a hair, each being measured along a different bend.
		const shortest = Math.min(length(right), length(left)) - 1e-6;
		const longest = Math.max(length(right), length(left)) + 1e-6;
		for (let turn = 0; turn <= 1; turn += 0.05) {
			turnCurve(right, left, turn, page);
			expect(length(page)).toBeGreaterThanOrEqual(shortest);
			expect(length(page)).toBeLessThanOrEqual(longest);
		}
	});

	it('goes over the top, its free edge ahead of the bound one', () => {
		const page = curve();
		turnCurve(right, left, 0.5, page);
		// Half way, it stands well clear of both stacks and has begun to lean left.
		expect(edge(page).y).toBeGreaterThan(0.5);
		expect(edge(page).x).toBeLessThan(0.25);
		// The piece by the binding has turned less than the piece at the edge.
		const first = Math.atan2(page[3] - page[1], page[2] - page[0]);
		const last = Math.atan2(
			page[SEGMENTS * 2 + 1] - page[SEGMENTS * 2 - 1],
			page[SEGMENTS * 2] - page[SEGMENTS * 2 - 2]
		);
		expect(last).toBeGreaterThan(first);
	});

	it('travels from one side to the other without doubling back', () => {
		const page = curve();
		let before = Infinity;
		for (let turn = 0; turn <= 1.0001; turn += 0.05) {
			turnCurve(right, left, turn, page);
			// As a page is first lifted its bow straightens, which can carry its
			// edge outward by less than a thousandth of its width. No more than that.
			expect(edge(page).x).toBeLessThanOrEqual(before + 1e-3);
			before = edge(page).x;
		}
		expect(before).toBeLessThan(-0.9);
	});
});
