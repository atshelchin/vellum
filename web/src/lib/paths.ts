import { resolve } from '$app/paths';
import type { Net } from './chain';

/**
 * Where things are, on a network. Every page exists twice, once on each, and
 * the only difference in its address is the word at the front.
 */
export const homePath = (net: Net) => resolve('/[[network=network]]', { network: net.param });

export const newDiaryPath = (net: Net) =>
	resolve('/[[network=network]]/new', { network: net.param });

export const diaryPath = (net: Net, slug: string) =>
	resolve('/[[network=network]]/d/[slug]', { network: net.param, slug });
