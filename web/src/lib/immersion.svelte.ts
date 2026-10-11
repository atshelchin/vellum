/**
 * What the page under the header is doing, that the header has to go along
 * with. The header is not a page's to restyle, so it is asked through here.
 */
export const immersion = $state({
	/** The page has stepped back to leave a book alone with its reader. */
	on: false,
	/**
	 * What lies under the header is paper, and not the dark it was drawn to be
	 * read against.
	 */
	paper: false
});
