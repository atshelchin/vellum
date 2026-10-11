/**
 * The characters a piece of a face is for, as a style sheet writes them
 * (`unicode-range: U+4e00-4eff, U+ff07`), and the little arithmetic done on
 * them: to find the piece that holds a character, and to keep a face to the
 * writing it is there for.
 */

/** A stretch of characters, by the first and the last of them. */
export type Range = [first: number, last: number];

/** `U+4e00-4eff`, `U+ff07` or `U+4e??`, as the stretch it means. */
function parseOne(written: string): Range {
	const [first, last] = written.trim().replace(/^U\+/i, '').split('-');
	return [
		parseInt(first.replace(/\?/g, '0'), 16),
		parseInt((last ?? first).replace(/\?/g, 'f'), 16)
	];
}

/** What follows `unicode-range:` in a rule, as stretches. */
export function parseRanges(written: string): Range[] {
	return written
		.split(',')
		.filter((each) => each.trim() !== '')
		.map(parseOne);
}

/** Stretches, as a style sheet writes them. */
export function formatRanges(ranges: readonly Range[]): string {
	return ranges
		.map(([first, last]) =>
			first === last ? `U+${first.toString(16)}` : `U+${first.toString(16)}-${last.toString(16)}`
		)
		.join(', ');
}

/** What of `ranges` lies inside `within`. */
export function intersect(ranges: readonly Range[], within: readonly Range[]): Range[] {
	const kept: Range[] = [];
	for (const [first, last] of ranges) {
		for (const [from, to] of within) {
			const start = Math.max(first, from);
			const end = Math.min(last, to);
			if (start <= end) kept.push([start, end]);
		}
	}
	return kept;
}

/** What of `ranges` lies outside `without`. */
export function subtract(ranges: readonly Range[], without: readonly Range[]): Range[] {
	let kept: Range[] = [...ranges];
	for (const [from, to] of without) {
		const next: Range[] = [];
		for (const [first, last] of kept) {
			if (last < from || first > to) {
				next.push([first, last]);
				continue;
			}
			if (first < from) next.push([first, from - 1]);
			if (last > to) next.push([to + 1, last]);
		}
		kept = next;
	}
	return kept;
}

/** Whether a character is in any of some stretches. */
export function holds(ranges: readonly Range[], code: number): boolean {
	return ranges.some(([first, last]) => first <= code && code <= last);
}

/**
 * A style sheet of `@font-face` rules with the characters of each rule passed
 * through `keep`. A rule left with no characters is dropped: its file would
 * never be asked for.
 */
export function narrow(css: string, keep: (ranges: Range[]) => Range[]): string {
	return css.replace(/(?:\/\*[^*]*\*\/\s*)?@font-face\s*{[^}]*}\s*/g, (rule) => {
		const written = /unicode-range:\s*([^;}]+)/.exec(rule);
		if (!written) return rule;
		const kept = keep(parseRanges(written[1]));
		if (kept.length === 0) return '';
		return rule.replace(written[0], `unicode-range: ${formatRanges(kept)}`);
	});
}
