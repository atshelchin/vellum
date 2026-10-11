import { describe, expect, it } from 'vitest';
import { slugId, slugOf } from './slug';

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
		expect(slugId(slugOf(diary, 1, CONTRACT))).toBe(42);
	});

	it('is not a bare number, or anything else', () => {
		expect(slugId('42')).toBeNull();
		expect(slugId('42-')).toBeNull();
		expect(slugId('42-9f3a1c7e5')).toBeNull();
		expect(slugId('42-9F3A1C7E5B')).toBeNull();
		expect(slugId('-9f3a1c7e5b')).toBeNull();
		expect(slugId('42-9f3a1c7e5b/../1')).toBeNull();
		expect(slugId('')).toBeNull();
	});
});
