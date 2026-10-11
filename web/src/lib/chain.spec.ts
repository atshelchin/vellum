import { describe, expect, it } from 'vitest';
import { NET_LIST, netOf, NETS, openElsewhere, type Net } from './chain';

describe('the three networks', () => {
	it('are Ethereum, Arc and Arc Testnet, each its own chain', () => {
		expect(NET_LIST.map((net) => [net.id, net.chain.id])).toEqual([
			['ethereum', 1],
			['arc', 5042],
			['testnet', 5042002]
		]);
	});

	it('are told apart by one word at the front of a path, and Ethereum by none', () => {
		expect(NET_LIST.map((net) => net.param)).toEqual([undefined, 'arc', 'testnet']);
		expect(netOf(undefined)).toBe(NETS.ethereum);
		expect(netOf('arc')).toBe(NETS.arc);
		expect(netOf('testnet')).toBe(NETS.testnet);
	});

	it('promise that a page is kept for good on Ethereum alone', () => {
		expect(NET_LIST.filter((net) => net.keeping === 'for good')).toEqual([NETS.ethereum]);
		// And nothing at all on the one that can be wiped.
		expect(NET_LIST.filter((net) => net.practice)).toEqual([NETS.testnet]);
		expect(NETS.testnet.keeping).toBe('for practice');
	});

	it('name their coin as what it is', () => {
		expect(NETS.ethereum.coin).toBe('ETH');
		expect(NETS.arc.coin).toBe('USDC');
		// What is free must not be taken for money.
		expect(NETS.testnet.coin).toBe('test USDC');
		expect(NETS.arc.faucet).toBeUndefined();
	});

	it('look at a quick chain often and at a slow one for longer', () => {
		expect(NETS.arc.settle.every).toBeLessThan(NETS.ethereum.settle.every);
		expect(NETS.ethereum.settle.within).toBeGreaterThan(NETS.testnet.settle.within);
	});
});

describe('the ways across', () => {
	const with_ = (open: Net['id'][]) =>
		NET_LIST.map((net) => ({
			...net,
			vellum: open.includes(net.id) ? ('0x01' as const) : undefined
		}));

	// `openElsewhere` reads the real list, so these say what it does as things stand.
	it('lead only to a network that has a Vellum on it', () => {
		for (const from of NET_LIST) {
			for (const to of openElsewhere(from)) {
				expect(to).not.toBe(from);
				expect(to.vellum).toBeDefined();
			}
		}
	});

	it('from a network that is not open yet, lead to the practice book first', () => {
		const closed = NET_LIST.filter((net) => !net.vellum);
		for (const from of closed) {
			const [first] = openElsewhere(from);
			if (NETS.testnet.vellum) expect(first).toBe(NETS.testnet);
		}
		// The shape of the rule, whatever is deployed: a sort that puts practice first.
		const open = with_(['ethereum', 'testnet']).filter((net) => net.vellum);
		expect(open.toSorted((a, b) => Number(b.practice) - Number(a.practice))[0].id).toBe('testnet');
	});
});
