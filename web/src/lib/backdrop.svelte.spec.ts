import { afterEach, describe, expect, it } from 'vitest';
import { backdrop } from './backdrop';

/** A dialog on the page, open, with something in it, that counts how often it was dismissed. */
function sheet() {
	const dialog = document.createElement('dialog');
	const inside = document.createElement('p');
	inside.textContent = 'What was written.';
	dialog.appendChild(inside);
	document.body.appendChild(dialog);
	dialog.showModal();
	let dismissed = 0;
	const action = backdrop(dialog, () => dismissed++);
	return {
		dialog,
		inside,
		get dismissed() {
			return dismissed;
		},
		action
	};
}

const down = (on: Element) => on.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
const click = (on: Element) => on.dispatchEvent(new MouseEvent('click', { bubbles: true }));

describe('the dark around a dialog', () => {
	afterEach(() => {
		for (const dialog of document.querySelectorAll('dialog')) dialog.remove();
	});

	it('puts the dialog away when it is pressed', () => {
		const open = sheet();
		down(open.dialog);
		click(open.dialog);
		expect(open.dismissed).toBe(1);
	});

	it('is not pressed by the click that opened the dialog', () => {
		// What Android does when a sheet is opened as a finger lifts: the press
		// began on the page, before there was a sheet, and its click lands on
		// the sheet's backdrop.
		const open = sheet();
		click(open.dialog);
		expect(open.dismissed).toBe(0);

		// A press of its own, afterwards, still counts.
		down(open.dialog);
		click(open.dialog);
		expect(open.dismissed).toBe(1);
	});

	it('is not pressed by a drag that began inside the dialog', () => {
		const open = sheet();
		down(open.inside);
		click(open.dialog);
		expect(open.dismissed).toBe(0);
	});

	it('is not pressed by anything pressed inside it', () => {
		const open = sheet();
		down(open.inside);
		click(open.inside);
		down(open.dialog);
		click(open.inside);
		expect(open.dismissed).toBe(0);
	});

	it('forgets a press that came to nothing', () => {
		const open = sheet();
		// Down on the dark, up inside: no click on the dark. The next stray click must not finish it.
		down(open.dialog);
		click(open.inside);
		click(open.dialog);
		expect(open.dismissed).toBe(0);
	});

	it('does not take the cursor out of what is being typed in', () => {
		const open = sheet();
		const press = (on: Element) => {
			const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
			on.dispatchEvent(event);
			return event.defaultPrevented;
		};
		// A press on the dark would move the focus to the dialog: it is stopped from doing so.
		expect(press(open.dialog)).toBe(true);
		// A press inside is the dialog's own business.
		expect(press(open.inside)).toBe(false);
	});

	it('lets go of the dialog when it is done with', () => {
		const open = sheet();
		open.action.destroy();
		down(open.dialog);
		click(open.dialog);
		expect(open.dismissed).toBe(0);
	});
});
