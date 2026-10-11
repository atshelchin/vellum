import { encodePacked, keccak256, type Address } from 'viem';

/**
 * A diary's link is its number and a key: `42-9f3a1c7e5b`.
 *
 * Diaries are numbered in the order they were opened, so a link made of the
 * number alone would let anyone read the next one by adding one. The key is
 * what makes a link something that has to be given: the site opens a diary
 * only for a link that carries it.
 *
 * It is not a secret from the chain. Everything it is made of is public, and
 * anyone who reads the contract directly needs no link at all. It keeps the
 * site from being a way to browse other people's diaries, which is all it is
 * for.
 */
const KEY_LENGTH = 10;

/** What a diary's key is made of: which diary, whose, opened when. */
export interface Linked {
	id: number;
	owner: Address;
	createdAt: number;
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

/** The diary number a slug names, or `null` if it is not shaped like a slug. */
export function slugId(slug: string): number | null {
	const match = /^(\d{1,12})-[0-9a-f]{10}$/.exec(slug);
	return match ? Number(match[1]) : null;
}
