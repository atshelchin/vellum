import {
	ContractFunctionExecutionError,
	ContractFunctionRevertedError,
	HttpRequestError
} from 'viem';
import { describe, expect, it } from 'vitest';
import { vellumAbi } from './abi';
import { NETS, type Net } from './chain';
import { fetchEntryTimes } from './vellum';

type Call = { functionName: string; args: readonly bigint[] };

/** A network whose contract is whatever `answer` says it is. */
function netWith(id: Net['id'], answer: (call: Call) => unknown) {
	const calls: Call[] = [];
	const net = {
		...NETS[id],
		vellum: '0x00000000000000000000000000000000000000aa',
		client: {
			readContract: async (call: Call) => {
				calls.push(call);
				return answer(call);
			}
		}
	} as unknown as Net;
	return { net, calls };
}

describe('the dates of a diary', () => {
	it('are read on their own where the contract can give them', async () => {
		const { net, calls } = netWith('ethereum', (call) => {
			expect(call.functionName).toBe('getEntryTimes');
			return [[10, 20, 30], 3n];
		});
		expect(await fetchEntryTimes(net, 4)).toEqual([10, 20, 30]);
		expect(calls).toHaveLength(1);
		expect(calls[0].args).toEqual([4n, 0n, 2000n]);
	});

	it('are read a page at a time when there are more than a page of them', async () => {
		const all = Array.from({ length: 4500 }, (_, index) => 1_000 + index);
		const { net, calls } = netWith('ethereum', (call) => {
			const [, offset, limit] = call.args.map(Number);
			return [all.slice(offset, offset + limit), BigInt(all.length)];
		});
		expect(await fetchEntryTimes(net, 0)).toEqual(all);
		expect(calls.map((call) => Number(call.args[1]))).toEqual([0, 2000, 4000]);
	});

	it('are nothing for a diary with nothing in it', async () => {
		const { net } = netWith('ethereum', () => [[], 0n]);
		expect(await fetchEntryTimes(net, 0)).toEqual([]);
	});

	it('are not made up when the chain does not answer', async () => {
		const { net, calls } = netWith('ethereum', () => {
			throw new HttpRequestError({ url: 'https://node.invalid', status: 503 });
		});
		await expect(fetchEntryTimes(net, 0)).rejects.toThrow();
		expect(calls).toHaveLength(1);
	});

	it('are not read at all for a diary the contract says is not there', async () => {
		const { net, calls } = netWith('ethereum', (call) => {
			throw new ContractFunctionExecutionError(
				new ContractFunctionRevertedError({
					abi: vellumAbi,
					functionName: call.functionName,
					// NoSuchDiary()
					data: '0x86f5bec9'
				}),
				{ abi: vellumAbi, functionName: call.functionName, args: [...call.args] }
			);
		});
		await expect(fetchEntryTimes(net, 99)).rejects.toThrow();
		expect(calls.map((call) => call.functionName)).toEqual(['getEntryTimes']);
	});
});
