/**
 * Puts a dialog away when the dark around it is pressed.
 *
 * Pressed: a finger or a button that goes down on the backdrop and comes up
 * on it. A click that only ends there is not that, and there are two of them
 * to be wary of.
 *
 * One is the click that opened the dialog. A sheet opened as a finger lifts
 * off the page is on the screen before the browser has finished with that
 * touch, and on Android the click that completes the touch is then given to
 * whatever is under the finger now, which is the sheet's backdrop. The sheet
 * would be put away in the same breath as it was brought out, and look as if
 * it had never come.
 *
 * The other is a drag that begins inside the dialog and ends outside it, as
 * selecting what one has written to the end of the line does.
 *
 * And a press on the dark does not take the place away from whatever in the
 * dialog was being typed in. The same stray click, left to itself, moves the
 * cursor out of the page it has just been put in, and a phone then never
 * raises its keyboard.
 *
 * (A dialog's backdrop is the dialog itself, as far as an event can tell:
 * what is pressed there has the dialog as its target and none of its
 * children.)
 */
export function backdrop(dialog: HTMLDialogElement, dismiss: () => void) {
	let down = false;
	let then = dismiss;

	const pressed = (event: PointerEvent) => {
		down = event.target === dialog;
	};
	const clicked = (event: MouseEvent) => {
		const began = down;
		down = false;
		if (began && event.target === dialog) then();
	};

	const held = (event: MouseEvent) => {
		if (event.target === dialog) event.preventDefault();
	};

	dialog.addEventListener('pointerdown', pressed);
	dialog.addEventListener('mousedown', held);
	dialog.addEventListener('click', clicked);
	return {
		update(next: () => void) {
			then = next;
		},
		destroy() {
			dialog.removeEventListener('pointerdown', pressed);
			dialog.removeEventListener('mousedown', held);
			dialog.removeEventListener('click', clicked);
		}
	};
}
