import { defaultCircleShape, defaultShadow, getIdenticonsParams } from 'identicons-esm/core';

/**
 * An account's face: the picture Vela Wallet shows for it.
 *
 * A diary can be signed with any name, and a short address is easy to
 * imitate at both ends. The face follows from the whole address, and is the
 * one its keeper already knows from their wallet, so it is how a reader tells
 * whose a diary is.
 *
 * Vela draws Nimiq's identicons, with a frame of its own: the whole square
 * filled, to be cut round by whatever shows it, and no `id` in it, so that any
 * number can be on one page. This is that drawing, to the byte, and
 * `identicon.spec.ts` holds it to the wallet's own test vectors. Change
 * nothing here without them.
 */

/** The drawing for a seed exactly as given. Vela lowercases an address before it asks. */
export function identiconOf(seed: string): string {
	const { colors, sections } = getIdenticonsParams(seed);
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><path fill="${colors.background}" d="M0 0h160v160H0z"/><g fill="${colors.accent}" color="${colors.main}">${defaultCircleShape(colors.main)}${defaultShadow}${sections.top}${sections.sides}${sections.face}${sections.bottom}</g></svg>`;
}

/** An account's face, as a square SVG. Whoever shows it cuts it round. */
export function identiconSvg(address: string): string {
	// The wallet's rule for a seed: lowercased, and no more than 128 characters of it.
	return identiconOf(address.toLowerCase().slice(0, 128));
}
