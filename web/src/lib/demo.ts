import { NETS, type Net } from './chain';
import { coin } from './format';
import { FEE, type Diary, type Entry } from './vellum';

/**
 * The diary on the front page: not on any chain, and written to be leafed
 * through by someone deciding whether to keep one. It says what Vellum is in
 * the only voice a diary has.
 *
 * It speaks of the network it is shown on: on Ethereum, of a diary kept for
 * good, and on Arc, of one written every day for next to nothing. On the
 * practice book it speaks of the real thing, on Ethereum, which is what the
 * practice is for.
 */
const DAY = 86400;

/** How the diary opens: why its keeper is writing it here. */
const OPENING: Record<Exclude<Net['id'], 'testnet'>, { title: string; first: string }> = {
	ethereum: {
		title: 'A Diary That Outlives Its Writer',
		first: `Dear diary,\n\nI wanted somewhere to keep my days that would still be there when I am old. Paper burns. Apps shut down and take everything with them.\n\nSo I am writing this on Ethereum, where a thing once written stays written.\n\nNobody can change this page now. Not even me. I find I like that.`
	},
	arc: {
		title: 'A Diary for Every Day',
		first: `Dear diary,\n\nI wanted somewhere to write a few lines every day without counting what it costs. On Ethereum a page is dear, and I would save it for the days that matter.\n\nSo this one is on Arc, where a page costs less than a cent, and I can write about the weather if I like.\n\nNobody can change this page now. Not even me. I find I like that.`
	}
};

export function demoDiary(now: number, shown: Net): { diary: Diary; entries: Entry[] } {
	const net = shown.id === 'testnet' ? NETS.ethereum : shown;
	const opening = OPENING[net.id === 'arc' ? 'arc' : 'ethereum'];
	const texts = [
		opening.first,
		`How it works, as far as I understand it.\n\nI open a diary. That part is free. I choose the leather and have a title stamped on it in gold. The title is for good, like everything else here, so I thought about it for longer than I expected to.\n\nThen, whenever I have something to say, I write an entry and seal it. An entry costs ${coin(FEE)} ${net.coin}, and the gas to carry it. It does not have to be short. When I run out of page the writing simply goes on to the next one, and the one after that, the way it would in any notebook. The longer the entry the more gas it takes, because every letter of it is kept, and that is the only limit I have found.\n\nI tried it tonight. I meant to write three lines about the weather and wrote instead about my grandmother's kitchen: the blue tin where she kept buttons, the radio that only found one station, the way she would say "well, that's that" when a thing was finished, whether it was a letter or a funeral. I had not thought about that tin in twenty years. It went on for pages.\n\nThat is what I want this for. Not the days when something happens. Those I will remember anyway. The ordinary ones, which are most of a life and are gone by the following week.\n\nAs many diaries as I like. As many entries in each as I like. Each one dated by the chain itself, so I cannot flatter myself afterwards about when I knew what.\n\nI turned back to the first page just now to see whether it was still there. It was. It will be.`,
		`A thing to remember: this is an open diary.\n\nThe chain is public, and anyone who goes looking can read every word.\n\nThe site only ever shows me my own shelf, and it opens a diary for somebody else only if I hand them its link. But that is good manners, not a lock.\n\nI should write what I would not mind being found.`,
		`Only a Vela Wallet account can keep a diary here. There is no seed phrase to lose, only a passkey: my thumb on the phone.\n\nSo: connect, choose a cover, write the first page.\n\nThe rest is up to me.`
	];
	const written = [
		now - 9 * DAY - 7200,
		now - 6 * DAY - 30000,
		now - 2 * DAY - 14000,
		now - DAY + 9000
	];
	return {
		diary: {
			id: 0,
			owner: '0x5ea1ed0000000000000000000000000000d1a121',
			createdAt: written[0] - DAY,
			lastWrittenAt: written[written.length - 1],
			cover: 0,
			entries: texts.length,
			title: opening.title,
			penName: 'A. Keeper'
		},
		entries: texts.map((text, index) => ({ index, writtenAt: written[index], text }))
	};
}
