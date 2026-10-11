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
	for (const path of ['/d/1', '/testnet/d/1', '/testnet/d/1-0000000000']) {
		// The page answers, and what it says is that there is nothing to open: the
		// same words for a bare number as for a well-shaped guess.
		expect((await page.goto(path))?.status()).toBe(200);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(
			'This link does not open a diary.',
			{ timeout: 20_000 }
		);
	}
});

test('there is no page that is not on one of the two networks', async ({ page }) => {
	expect((await page.goto('/mainnet'))?.status()).toBe(404);
	expect((await page.goto('/sepolia/new'))?.status()).toBe(404);
});
