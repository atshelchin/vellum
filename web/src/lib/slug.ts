import { encodePacked, keccak256, type Address } from 'viem';

/**
 * A diary's link is its number and a key: `42-9f3a1c7e5b`.
 *
 * Diaries are numbered in the order they were opened, so a link made of the
 * number alone would let anyone read the next one by adding one. The key is
 * what makes a link something that has to be given: the site opens a diary
 * only for a link that carries it.
 *
 * One page of a diary has a link of its own, `42.7-1c7e5b9f3a` for its seventh
 * entry, with a key of its own. It opens that page and no other: whoever is
 * handed one page has not been handed the book, and cannot make the book's
 * link out of the page's.
 *
 * Neither is a secret from the chain. Everything a key is made of is public,
 * and anyone who reads the contract directly needs no link at all. They keep
 * the site from being a way to browse other people's diaries, which is all
 * they are for.
 */
const KEY_LENGTH = 10;

/** What a diary's key is made of: which diary, whose, opened when. */
export interface Linked {
	id: number;
	owner: Address;
	createdAt: number;
}

/** What a link names: a diary, or one entry of it. */
export interface Named {
	id: number;
	/** The one entry it opens, by its place in the diary, counted from zero. A link to the whole diary has none. */
	entry?: number;
}

/**
 * The slug of a diary on one deployment of the contract. The chain and the
 * contract are part of the key, so a link to the practice book opens nothing
 * on Ethereum.
 */
export function slugOf(diary: Linked, chainId: number, contract: Address): string {
	const key = keccak256(
		encodePacked(
			['uint256', 'address', 'uint256', 'address', 'uint48'],
			[BigInt(chainId), contract, BigInt(diary.id), diary.owner, diary.createdAt]
		)
	).slice(2, 2 + KEY_LENGTH);
	return `${diary.id}-${key}`;
}

/** The slug of one entry of a diary, by its place in the diary, counted from zero. */
export function pageSlugOf(
	diary: Linked,
	entry: number,
	chainId: number,
	contract: Address
): string {
	const key = keccak256(
		encodePacked(
			['uint256', 'address', 'uint256', 'address', 'uint48', 'uint256'],
			[BigInt(chainId), contract, BigInt(diary.id), diary.owner, diary.createdAt, BigInt(entry)]
		)
	).slice(2, 2 + KEY_LENGTH);
	return `${diary.id}.${entry + 1}-${key}`;
}

/** What a slug names, or `null` if it is not shaped like a slug. */
export function slugNames(slug: string): Named | null {
	const match = /^(\d{1,12})(?:\.([1-9]\d{0,11}))?-[0-9a-f]{10}$/.exec(slug);
	if (!match) return null;
	return match[2] === undefined
		? { id: Number(match[1]) }
		: { id: Number(match[1]), entry: Number(match[2]) - 1 };
}
