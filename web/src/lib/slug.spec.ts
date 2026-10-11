import { describe, expect, it } from 'vitest';
import { pageSlugOf, slugNames, slugOf } from './slug';

const CONTRACT = '0x2a8A9931E4B5A2B25E049b3D8af2E1a474d1Dd80';
const diary = {
	id: 42,
	owner: '0x12aE3968E5bd0c93386cC12fa6E776726D13af22',
	createdAt: 1_791_688_647
} as const;

describe('a diary link', () => {
	it('is the number and a ten-letter key', () => {
		expect(slugOf(diary, 1, CONTRACT)).toMatch(/^42-[0-9a-f]{10}$/);
	});

	it('is the same every time', () => {
		expect(slugOf(diary, 1, CONTRACT)).toBe(slugOf({ ...diary }, 1, CONTRACT));
	});

	it('cannot be made from the link to the diary before it', () => {
		const one = slugOf(diary, 1, CONTRACT).split('-')[1];
		const next = slugOf({ ...diary, id: 43 }, 1, CONTRACT).split('-')[1];
		expect(next).not.toBe(one);
	});

	it('opens nothing on another chain, or another contract', () => {
		expect(slugOf(diary, 5042002, CONTRACT)).not.toBe(slugOf(diary, 1, CONTRACT));
		expect(slugOf(diary, 1, '0x0000000000000000000000000000000000000001')).not.toBe(
			slugOf(diary, 1, CONTRACT)
		);
	});

	it('names its diary', () => {
		expect(slugNames(slugOf(diary, 1, CONTRACT))).toEqual({ id: 42 });
	});

	it('is not a bare number, or anything else', () => {
		expect(slugNames('42')).toBeNull();
		expect(slugNames('42-')).toBeNull();
		expect(slugNames('42-9f3a1c7e5')).toBeNull();
		expect(slugNames('42-9F3A1C7E5B')).toBeNull();
		expect(slugNames('-9f3a1c7e5b')).toBeNull();
		expect(slugNames('42-9f3a1c7e5b/../1')).toBeNull();
		expect(slugNames('')).toBeNull();
	});
});

describe('a link to one page', () => {
	it('is the diary, the entry counted from one, and a key', () => {
		expect(pageSlugOf(diary, 6, 1, CONTRACT)).toMatch(/^42\.7-[0-9a-f]{10}$/);
	});

	it('names its diary and its entry, counted from zero', () => {
		expect(slugNames(pageSlugOf(diary, 6, 1, CONTRACT))).toEqual({ id: 42, entry: 6 });
		expect(slugNames(pageSlugOf(diary, 0, 1, CONTRACT))).toEqual({ id: 42, entry: 0 });
	});

	it("has a key of its own: not the diary's, and not the next page's", () => {
		const key = (slug: string) => slug.split('-')[1];
		const whole = key(slugOf(diary, 1, CONTRACT));
		const page = key(pageSlugOf(diary, 6, 1, CONTRACT));
		expect(page).not.toBe(whole);
		expect(key(pageSlugOf(diary, 7, 1, CONTRACT))).not.toBe(page);
		expect(key(pageSlugOf({ ...diary, id: 43 }, 6, 1, CONTRACT))).not.toBe(page);
	});

	it('opens nothing on another chain, or another contract', () => {
		expect(pageSlugOf(diary, 6, 5042002, CONTRACT)).not.toBe(pageSlugOf(diary, 6, 1, CONTRACT));
		expect(pageSlugOf(diary, 6, 1, '0x0000000000000000000000000000000000000001')).not.toBe(
			pageSlugOf(diary, 6, 1, CONTRACT)
		);
	});

	it('has no entry nought, and no entry without a number', () => {
		expect(slugNames('42.0-9f3a1c7e5b')).toBeNull();
		expect(slugNames('42.-9f3a1c7e5b')).toBeNull();
		expect(slugNames('42.07-9f3a1c7e5b')).toBeNull();
		expect(slugNames('.7-9f3a1c7e5b')).toBeNull();
		expect(slugNames('42.7.1-9f3a1c7e5b')).toBeNull();
	});
});
