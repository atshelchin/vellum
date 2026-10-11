import { describe, expect, it } from 'vitest';
import { ago, coin, plural, shortAddress } from './format';

describe('coin', () => {
	it('writes the fee the way it is said', () => {
		expect(coin(10n ** 15n)).toBe('0.001');
	});

	it('drops zeros that say nothing, and rounds down', () => {
		expect(coin(10n ** 18n)).toBe('1');
		expect(coin(1_500_000_000_000_000_000n)).toBe('1.5');
		expect(coin(1_999_990_000_000_000_000n)).toBe('1.9999');
		expect(coin(0n)).toBe('0');
		expect(coin(9n)).toBe('0');
	});
});

describe('ago', () => {
	const now = 1_800_000_000;

	it('says how long, in the fewest words that are true', () => {
		expect(ago(now - 20, now)).toBe('just now');
		expect(ago(now - 600, now)).toBe('10 minutes ago');
		expect(ago(now - 5400, now)).toBe('an hour ago');
		expect(ago(now - 5 * 3600, now)).toBe('5 hours ago');
		expect(ago(now - 30 * 3600, now)).toBe('yesterday');
		expect(ago(now - 9 * 86400, now)).toBe('9 days ago');
	});

	it('gives the date once that says more than a count of days', () => {
		expect(ago(now - 200 * 86400, now)).toMatch(/^\d{1,2} \w+ \d{4}$/);
	});

	it('does not speak of the future', () => {
		expect(ago(now + 500, now)).toBe('just now');
	});
});

describe('plural', () => {
	it('counts', () => {
		expect(plural(0, 'entry', 'entries')).toBe('0 entries');
		expect(plural(1, 'entry', 'entries')).toBe('1 entry');
		expect(plural(1234, 'entry', 'entries')).toBe('1,234 entries');
		expect(plural(2, 'diary', 'diaries')).toBe('2 diaries');
	});
});

describe('shortAddress', () => {
	it('keeps both ends', () => {
		expect(shortAddress('0x12aE3968E5bd0c93386cC12fa6E776726D13af22')).toBe('0x12aE…af22');
	});
});
