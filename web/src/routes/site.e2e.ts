import { expect, test } from '@playwright/test';

// The built site, with no wallet in the browser: what anyone sees who arrives
// with nothing. The practice book is read from Arc Testnet itself, so the test
// of a guessed link there needs the network.

const networks = (page: import('@playwright/test').Page) =>
	page.getByRole('navigation', { name: 'Network' });

test('the front page is on Ethereum', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(
		'A diary that outlives its writer.'
	);
	await expect(networks(page).getByRole('link', { name: 'Ethereum' })).toHaveAttribute(
		'aria-current',
		'true'
	);
});

test('the switch leads to the practice book and back, and the address says which', async ({
	page
}) => {
	await page.goto('/');
	await networks(page).getByRole('link', { name: 'Testnet' }).click();
	await expect(page).toHaveURL(/\/testnet$/);
	await expect(page.getByText(/Practice book/)).toBeVisible();
	await expect(networks(page).getByRole('link', { name: 'Testnet' })).toHaveAttribute(
		'aria-current',
		'true'
	);

	await networks(page).getByRole('link', { name: 'Ethereum' }).click();
	await expect(page).toHaveURL(/\/$/);
	await expect(page.getByText(/Practice book/)).toHaveCount(0);
});

test('the switch keeps to the same page', async ({ page }) => {
	await page.goto('/new');
	await networks(page).getByRole('link', { name: 'Testnet' }).click();
	await expect(page).toHaveURL(/\/testnet\/new$/);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Open a diary');
});

test('the wallet picker says it is for Vela Wallet only', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('banner').getByRole('button', { name: 'Connect' }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toContainText('only supports Vela Wallet');
	await expect(dialog.getByRole('link', { name: 'Get Vela Wallet' })).toBeVisible();
});

test('a number alone, or a guess, opens no diary', async ({ page }) => {
	for (const path of [
		'/d/1',
		'/testnet/d/1',
		'/testnet/d/1-0000000000',
		'/testnet/d/1.1-0000000000'
	]) {
		// The page answers, and what it says is that there is nothing to open: the
		// same words for a bare number as for a well-shaped guess.
		expect((await page.goto(path))?.status()).toBe(200);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(
			'This link does not open a diary.',
			{ timeout: 20_000 }
		);
	}
});

test('there is no page that is not on one of the three networks', async ({ page }) => {
	expect((await page.goto('/mainnet'))?.status()).toBe(404);
	expect((await page.goto('/ethereum'))?.status()).toBe(404);
	expect((await page.goto('/sepolia/new'))?.status()).toBe(404);
});

test('Arc has pages of its own, and says what it is for', async ({ page }) => {
	await page.goto('/arc');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('A diary for every day.');
	// As they are shown: each also carries a short name, for a phone, that is not.
	await expect(networks(page).getByRole('link')).toHaveText(['Ethereum', 'Arc', 'Testnet'], {
		useInnerText: true
	});
	await expect(networks(page).getByRole('link', { name: 'Arc', exact: true })).toHaveAttribute(
		'aria-current',
		'true'
	);
	// Only Ethereum is said to keep a page for good.
	await expect(page.getByText('outlives its writer')).toHaveCount(0);

	// The same page across, as from anywhere else.
	await page.goto('/arc/new');
	await networks(page).getByRole('link', { name: 'Testnet' }).click();
	await expect(page).toHaveURL(/\/testnet\/new$/);
	await networks(page).getByRole('link', { name: 'Arc', exact: true }).click();
	await expect(page).toHaveURL(/\/arc\/new$/);
});

test('a link to the site unfolds into its card', async ({ page, request }) => {
	await page.goto('/');
	const image = await page.locator('meta[property="og:image"]').getAttribute('content');
	expect(image).toMatch(/\/card\.png$/);
	await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
		'content',
		'summary_large_image'
	);

	// Drawn by the worker itself, so this is also whether it can draw at all.
	const card = await request.get('/card.png');
	expect(card.status()).toBe(200);
	expect(card.headers()['content-type']).toBe('image/png');
	const png = await card.body();
	expect(png.subarray(1, 4).toString()).toBe('PNG');
	// 1200 by 630, where a PNG says how large it is.
	expect(png.readUInt32BE(16)).toBe(1200);
	expect(png.readUInt32BE(20)).toBe(630);
});

test('a guessed link has no card to show', async ({ request }) => {
	for (const path of [
		'/testnet/d/1-0000000000/card.png',
		'/testnet/d/1.1-0000000000/card.png',
		'/testnet/d/1/card.png',
		'/d/1-0000000000/card.png'
	]) {
		expect((await request.get(path)).status()).toBe(404);
	}
});
