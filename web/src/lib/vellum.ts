import {
	BaseError,
	ContractFunctionRevertedError,
	encodeFunctionData,
	isAddressEqual,
	type Address,
	type Hex
} from 'viem';
import { vellumAbi } from './abi';
import { BRAND } from './brand';
import type { Net } from './chain';
import { rpcCode, wallet } from './wallet.svelte';

export interface Diary {
	id: number;
	owner: Address;
	/** Unix seconds. */
	createdAt: number;
	/** Unix seconds, or zero before the first entry. */
	lastWrittenAt: number;
	cover: number;
	entries: number;
	title: string;
}

export interface Entry {
	/** Its place in the diary, counted from the first. */
	index: number;
	/** Unix seconds. */
	writtenAt: number;
	text: string;
}

/** What an entry costs, in wei (`Vellum.FEE`). The same number on either network. */
export const FEE = 10n ** 15n;
export const MAX_TITLE_BYTES = 64;
export const MAX_ENTRY_BYTES = 24_575;

const encoder = new TextEncoder();

/** How long a text is as the contract counts it. */
export function byteLength(text: string): number {
	return encoder.encode(text).length;
}

/** A failure whose message is already written for the person reading it. */
export class Outcome extends Error {
	/**
	 * The transaction was sent and may yet land. Whatever was being written must
	 * be kept, and must not be sent again without looking first.
	 */
	unsettled: boolean;

	constructor(message: string, unsettled = false) {
		super(message);
		this.unsettled = unsettled;
	}
}

function address(net: Net): Address {
	if (!net.vellum) throw new Outcome(`${BRAND} is not on ${net.chain.name} yet.`);
	return net.vellum;
}

type ChainDiary = {
	id: bigint;
	owner: Address;
	createdAt: number;
	lastWrittenAt: number;
	cover: number;
	entries: bigint;
	title: string;
};

function toDiary(diary: ChainDiary): Diary {
	return { ...diary, id: Number(diary.id), entries: Number(diary.entries) };
}

export async function fetchDiary(net: Net, id: number): Promise<Diary> {
	const diary = await net.client.readContract({
		address: address(net),
		abi: vellumAbi,
		functionName: 'getDiary',
		args: [BigInt(id)]
	});
	return toDiary(diary);
}

/** One page of an account's diaries, newest first, and how many it has in all. */
export async function fetchDiariesOf(
	net: Net,
	owner: Address,
	offset = 0,
	limit = 12
): Promise<{ diaries: Diary[]; total: number }> {
	const [page, total] = await net.client.readContract({
		address: address(net),
		abi: vellumAbi,
		functionName: 'getDiariesOf',
		args: [owner, BigInt(offset), BigInt(limit)]
	});
	return { diaries: page.map(toDiary), total: Number(total) };
}

/** Entries `offset` to `offset + limit` of a diary, in the order they were written. */
export async function fetchEntries(
	net: Net,
	id: number,
	offset: number,
	limit: number
): Promise<{ entries: Entry[]; total: number }> {
	const [page, total] = await net.client.readContract({
		address: address(net),
		abi: vellumAbi,
		functionName: 'getEntries',
		args: [BigInt(id), BigInt(offset), BigInt(limit)]
	});
	return {
		entries: page.map((entry, position) => ({ ...entry, index: offset + position })),
		total: Number(total)
	};
}

/** What each of the contract's refusals means, said to a person. */
function refusals(net: Net): Record<string, string> {
	return {
		NotVelaWallet: `${BRAND} is only open to Vela Wallet accounts.`,
		NoSuchDiary: 'This diary does not exist.',
		NoSuchEntry: 'This entry does not exist.',
		NotOwner: 'Only the account that opened this diary can write in it.',
		BadTitle: 'A diary needs a title, of at most 64 bytes.',
		BadEntry: 'An entry needs some words, and at most 24,575 bytes of them.',
		WrongFee: `An entry costs exactly 0.001 ${net.coin}.`,
		StoreFailed: `${net.chain.name} could not keep this entry.`
	};
}

/** A sentence a person can read, for whatever went wrong. */
export function describeError(net: Net, error: unknown): string {
	if (error instanceof Outcome) return error.message;

	if (error instanceof BaseError) {
		const revert = error.walk((cause) => cause instanceof ContractFunctionRevertedError);
		if (revert instanceof ContractFunctionRevertedError) {
			const known = refusals(net)[revert.data?.errorName ?? ''];
			if (known) return known;
		}
		// The dry run failed some other way: the account cannot afford the call,
		// say, or the node did not answer. viem's short message says which.
		return `${net.chain.name} would not run this: ${sentence(error.shortMessage)}`;
	}

	if (typeof error === 'object' && error !== null) {
		const { message } = error as { message?: unknown };
		if (rpcCode(error) === 4001) return 'Cancelled in your wallet.';
		if (rpcCode(error) === 4902) {
			return `${net.chain.name} is not in your wallet yet. Add it in your wallet's networks, then try again.`;
		}
		// A wallet that refuses says why. Its own words are worth more than ours.
		if (typeof message === 'string' && message.trim()) {
			return `Your wallet refused this: ${sentence(message)}`;
		}
	}
	return 'Something went wrong. Nothing was sent.';
}

/** Someone else's message, cut to one line that ends like a sentence. */
function sentence(text: string): string {
	const line = text.trim().split('\n')[0].slice(0, 200).trim();
	return /[.!?…]$/.test(line) ? line : `${line}.`;
}

type Call =
	| { functionName: 'create'; args: readonly [string, number] }
	| { functionName: 'write'; args: readonly [bigint, string]; value: bigint };

/** What is told to whoever is waiting, as it happens. */
export interface Progress {
	/**
	 * The wallet has answered with a transaction. For Vela that means it is
	 * already in a block; all that is left is to read its effect back.
	 */
	onSent?: (hash: Hex) => void;
}

/** How long to go on looking once the wallet has given up waiting. */
const GRACE_MS = 180_000;
const DEADLINE_MS = 12 * 60_000;

/**
 * Sends one call from the connected account and resolves once `landed` reads
 * its effect back from the chain.
 *
 * The wallet's answer is never the proof. Vela sends a user operation, waits
 * for it itself, and gives up after a couple of minutes with an error that
 * says the operation may still land. Treating that as "not sent" is how
 * someone pays for the same entry twice. So the chain is watched from the
 * moment the wallet is asked, and whichever speaks first settles it: the
 * effect, read from the chain, or a refusal that leaves nothing in flight.
 *
 * Nor is the wallet's "confirmed" the end of it. A transaction can be in a
 * block and have written nothing: it reverted inside the account, or it was
 * sent on another network than the one this page reads. That is said, and
 * soon, with what is known about why.
 */
async function transact<T>(
	net: Net,
	call: Call,
	landed: () => Promise<T | undefined>,
	progress: Progress = {}
): Promise<T> {
	const to = address(net);
	const account = wallet.account;
	if (!account) throw new Outcome('Connect a wallet first.');

	/** How often the chain is asked whether the call has taken effect. */
	const poll = net.practice ? 1000 : 3000;
	// How long after the wallet says a transaction is in a block the page goes
	// on looking for what it did. Long enough for a public node to catch up with
	// the one the wallet used; short enough that nobody is left staring at a button.
	const settleWithin = net.practice ? 20_000 : 90_000;

	try {
		// A dry run names the reason a call would fail before anything is signed.
		// It cannot be run for a Vela account with no code here yet: the contract
		// would not recognise it.
		if (wallet.standing !== 'new-vela') {
			await net.client.simulateContract({ address: to, abi: vellumAbi, account, ...call } as never);
		}
	} catch (error) {
		console.error(`${BRAND}: ${call.functionName} would not run`, error);
		throw error;
	}

	return new Promise<T>((resolve, reject) => {
		let settled = false;
		let timer: ReturnType<typeof setTimeout>;
		/** What to say if the effect never shows, given what has happened so far. */
		let verdict = async (): Promise<Outcome> =>
			new Outcome(
				`${net.chain.name} has not confirmed this yet. It may still go through: check your wallet's activity before trying again.`,
				true
			);
		let giveUpAt = Date.now() + DEADLINE_MS;

		const settle = (act: () => void) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			act();
		};

		const watch = async () => {
			if (settled) return;
			const effect = await landed().catch(() => undefined);
			if (effect !== undefined) return settle(() => resolve(effect));
			if (Date.now() >= giveUpAt) {
				const outcome = await verdict();
				return settle(() => reject(outcome));
			}
			timer = setTimeout(watch, poll);
		};
		timer = setTimeout(watch, poll);

		wallet
			.send(net, {
				to,
				data: encodeFunctionData({ abi: vellumAbi, ...call } as never),
				value: 'value' in call ? call.value : undefined
			})
			.then(
				(hash) => {
					// Sent, and for Vela already in a block. The watch above finishes
					// it. If the effect does not show, the chain is asked what became
					// of the transaction, because the answers are different troubles.
					progress.onSent?.(hash);
					giveUpAt = Math.min(giveUpAt, Date.now() + settleWithin);
					verdict = async () => {
						const receipt = await net.client.getTransactionReceipt({ hash }).catch(() => null);
						if (receipt) {
							return new Outcome(
								'The transaction is in a block, but it wrote nothing: it was refused inside your account. Nothing was charged beyond gas.'
							);
						}
						return new Outcome(
							`Your wallet says this was sent, but ${net.chain.name} as this page reads it has no such transaction. Check that your wallet is on ${net.chain.name}, and look at its activity before trying again.`,
							true
						);
					};
				},
				(error) => {
					console.error(`${BRAND}: ${call.functionName} was refused`, error);
					const message = String((error as { message?: unknown })?.message ?? '');
					if (/revert/i.test(message)) {
						return settle(() =>
							reject(
								new Outcome('The transaction was included, but it reverted. Nothing was written.')
							)
						);
					}
					if (/not confirmed|still complete|submitted/i.test(message)) {
						// The wallet stopped waiting; the operation is still out there.
						giveUpAt = Math.min(giveUpAt, Date.now() + GRACE_MS);
						verdict = async () =>
							new Outcome(
								`Your wallet sent this, but ${net.chain.name} has not confirmed it yet. It may still go through: check your wallet's activity before trying again.`,
								true
							);
						return;
					}
					settle(() => reject(error));
				}
			);
	});
}

/** Opens a diary and returns it. */
export async function createDiary(
	net: Net,
	input: { title: string; cover: number },
	progress?: Progress
): Promise<Diary> {
	const owner = wallet.account;
	if (!owner) throw new Outcome('Connect a wallet first.');
	const before = (await fetchDiariesOf(net, owner, 0, 1)).total;

	return transact(
		net,
		{ functionName: 'create', args: [input.title, input.cover] },
		async () => {
			const { diaries, total } = await fetchDiariesOf(net, owner, 0, 4);
			// Only a diary that was not there before can be this one. Another tab may
			// have opened one in the meantime, so it is told by its title as well.
			return diaries
				.slice(0, Math.max(0, total - before))
				.find((diary) => diary.title === input.title && isAddressEqual(diary.owner, owner));
		},
		progress
	);
}

/** Writes an entry in a diary and returns it as the chain has it. */
export async function writeEntry(
	net: Net,
	id: number,
	text: string,
	progress?: Progress
): Promise<Entry> {
	const before = (await fetchDiary(net, id)).entries;

	return transact(
		net,
		{ functionName: 'write', args: [BigInt(id), text], value: FEE },
		async () => {
			// Every entry since the call was made, in case this was not the only one.
			const { entries } = await fetchEntries(net, id, before, 4);
			return entries.find((entry) => entry.text === text);
		},
		progress
	);
}
