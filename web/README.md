# Vellum: the site

The site for Vellum, a diary kept on Ethereum by Vela Wallet accounts. A diary
is shown as a book: its cover in the leather its keeper chose, its entries on
pages that are turned. The contract is in `../contracts`.

## Run it

```sh
bun install
bun run dev
```

Nothing needs setting. `.env.example` lists what can be pointed elsewhere, for
a fork or a new build of the contract.

## Three networks, in one site

Every page exists three times: at `/…` on Ethereum, at `/arc/…` on Arc, and at
`/testnet/…` on Arc Testnet, the practice book. Which one a page is on comes
from its address (`src/params.ts` and `netOf` in `src/lib/chain.ts`) and from
nowhere else. Nothing is remembered between pages, and no module holds a
"current network": whatever reads or writes the chain is handed the network it
is for.

That is deliberate, and worth keeping:

- A link opens on the network it was made on. A diary's link carries a key made
  from the chain and the contract, so a practice link opens nothing on Ethereum.
- The server renders many requests at once. A network kept in a variable would
  be shared between them.
- What a page may promise depends on where it is. Only Ethereum is said to
  keep a page for good (`keeping` in `chain.ts`); on the practice book nothing
  may promise that a page lasts (`practice`). What each network says of itself
  is written down once, with the network, and not chosen page by page.

A network with no contract yet (`undefined` in `DEPLOYED`, in `chain.ts`) is still
there to switch to; its pages say it is not open and point to one that is, the
practice book first.

## Links, and what they unfold into

A keeper can give out two kinds of link, and the share sheet on a diary's page
offers both:

- `/d/42-9f3a1c7e5b` opens the whole diary: every page, and every page written
  later.
- `/d/42.7-1c7e5b9f3a` opens the diary's seventh entry and nothing else. The
  book it shows has that one entry in it, says so on its title page, and ends
  with "The rest was not shared." It has a key of its own, from which the
  diary's cannot be made (`src/lib/slug.ts`).

Either one, pasted where links are unfolded, shows a picture: `card.png` beside
the page, drawn by the Worker from the chain (`src/lib/server/card/`). A diary's
card is the book, in its leather, with its title, its size and its latest
words. A page's card is the page: the day, and how it begins. Both show whose
it is. A card is drawn only for a link that opens what it names, so a guessed
number is shown nothing.

The card is set in the same faces as the book, read from the same files: see
[the faces](#the-faces), below. Nothing is asked of anyone else's server to
draw one.

## The index by date

A diary's page has a calendar, put away until it is asked for: the button
beside Share, or the `I` key. It shows a year on one sheet, with a seal on each
day that was written on, and pressing a seal opens the book at that day. There
is a sheet for every year from the one the diary was opened in to this one,
and the years on either side are named beside the one shown. Days are days
where the diary is being read (`src/lib/book/calendar.ts`).

It is drawn from `getEntryTimes`, which reads no text: a year of entries is
one small call (`fetchEntryTimes` in `src/lib/vellum.ts`).

## Opened as a book, read as leaves

The book is what a diary looks like and how it is opened: its leather, its
title in gold, the boards coming apart. But a book is read two pages at a
time, turned by hand, and that is slower going than a thumb on a screen is
used to. So once it is open a diary is read as leaves
(`src/lib/components/Leaves.svelte`): one entry to a screen, one above
another, on the same paper and in the same faces. A button in the bar gives
the book back to whoever would rather turn pages, and the choice is
remembered.

What moves the leaves is the part to be careful with, because two things
want to do it:

- **Under a finger the browser does it.** A phone's own scrolling is better
  than anything written here, and with scroll snapping it brings a leaf to
  rest by itself.
- **A wheel, a trackpad and a keyboard are moved from the script,** and
  snapping is turned off while they are in use. Left to the browser, a wheel
  moves a few lines and is pulled back, and a trackpad's coasting runs on
  through three leaves. Mixing the two, each correcting the other, is what
  makes a pager feel as if it has a mind of its own.

The rules for the second, which `Leaves.svelte.spec.ts` holds it to:

- One movement of a wheel brings up one leaf, however many notches it is
  spun or however long a trackpad coasts. Another needs the wheel to have been
  still, or the fingers to have come down again.
- Inside an entry longer than the screen the wheel scrolls it, and stops at
  its end. Only a movement that begins at the end turns the leaf: one that
  arrives there on the way down stops, as a page does.
- Going back up the diary, the entry before is come on at its end, so that
  the reading is continuous in both directions. (Left, and the button that
  goes back one, mean "that entry", and go to the head of it.)
- Up and down move along a leaf a few lines at a time, Space and Page Down a
  screen at a time, and both go on to the next leaf from the end of one; a key
  held down stops at the end. Left and right go from leaf to leaf.
- While a leaf is being brought up nothing else is listened to.

Only the leaves near the reader have their words on them. The rest keep the
height they turned out to have, so that the page does not jump as they come
and go.

The book hands over to the leaves in one movement (`BookStage.approach`): the
page that is to be read is brought up square to the reader, and the leaf
comes in over it as it arrives. On a wide screen it is brought up into the
room a sheet has on the desk. On a phone, where the sheet is the whole
screen, it is brought up until its paper is the whole screen too.

Paper is the one place the rest of the site is not drawn for: everything else
lies on the dark. So over the leaves:

- **Nothing floats over a sheet that has the screen to itself** (1100px and
  narrower). The header and the controls at the foot become two solid bars of
  the room's own dark, which slide away together when the reader is left
  alone and come back on a tap. The header is told through
  `src/lib/immersion.svelte.ts`, since it is not the page's to restyle.
- **Wider than that**, the controls stay where they float, and their glass is
  made all but solid: glass that paper shows through goes the colour of mud.
- **On a phone the sheet is lit evenly, edge to edge.** A gutter down one
  side or a darkened corner reads there as a patch where the light is
  missing, not as a book.

## The faces

A diary is read at length, like a novel, so it is set the way one is: in faces
made for reading at length, with a little character and nothing that tires the
eye. No script, no brush, no handwriting. And every writing has a face of its
own, because no one face reads well in all of them. `src/lib/scripts.ts` is the
one list:

| Writing                            | Face                  | Why this one                                           |
| ---------------------------------- | --------------------- | ------------------------------------------------------ |
| Latin, Cyrillic, Greek, Vietnamese | Literata              | Drawn for reading books on a screen                    |
| Chinese, Japanese                  | LXGW WenKai           | A pen's regular script; simplified, traditional, kana  |
| Korean                             | Gowun Batang          | A batang, as Korean novels are set in, a little softer |
| Thai                               | Noto Serif Thai       | Looped, as a Thai reader expects of a book             |
| Hindi and the rest of Devanagari   | Noto Serif Devanagari | A text serif                                           |
| Arabic, Persian, Urdu              | Noto Naskh Arabic     | A naskh, which a book in Arabic is set in              |
| Hebrew                             | Frank Ruhl Libre      | The face of nearly every Hebrew novel                  |

Titles and dates are in Cormorant Garamond. A writing that is not listed is
drawn in whatever the device has.

Three things keep that list true everywhere a diary is seen:

- **Each face is offered for its own writing and nothing else.** A face for
  one writing always carries a little of another, and a line drawn by whichever
  face a browser reaches first comes out in two hands. The build narrows each
  face's style sheet to the characters the list gives it (`vite.config.ts`),
  so a line in one font stack is drawn letter by letter in the right face,
  whichever way it runs. Lines that start in Arabic or Hebrew are set from the
  right.
- **A face is fetched when its writing turns up, and only the pieces it
  needs.** The Chinese face is megabytes, cut into about a hundred pieces; a
  page with Chinese on it fetches the few that hold its characters
  (`src/lib/typefaces.ts`). Whoever never reads Thai never fetches a byte of
  it.
- **A card is drawn from the same pieces.** The Worker reads the same style
  sheets to find which piece holds which character, and the same files
  (`src/lib/server/card/fonts.ts`). The faces for Latin, Cyrillic, Greek and
  Vietnamese are small enough to carry whole; `scripts/card-fonts.py` cuts
  them, and says how.

What draws the cards cannot yet be trusted with Devanagari or Arabic: it
misplaces vowel signs in the one and loses the full stops in the other. Those
two are on the pages, where a browser sets them properly, and are left off the
cards (`card: false` in the list) until it can. Japanese is written in the
face for Chinese, which was drawn from a Japanese one, in the shapes a reader
of simplified Chinese was taught.

To change a face, change it in the list, in `--other-writing` in `app.css`,
and in the two places that import its files (`typefaces.ts` and
`server/card/fonts.ts`): the types will say if one was missed.

## What is where

| Path                               | What it is                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------- |
| `src/lib/chain.ts`                 | The three networks: chain, nodes, the contract's address, what each is for      |
| `src/lib/wallet.svelte.ts`         | Wallet discovery (EIP-6963, then `window.ethereum`) and the connection          |
| `src/lib/vellum.ts`                | Reads from the contract, and the two things an account can do                   |
| `src/lib/slug.ts`                  | What a link to a diary, or to one page of it, is made of                        |
| `src/lib/identicon.ts`             | An account's face, as Vela Wallet draws it                                      |
| `src/lib/scripts.ts`               | Which typeface writes which writing: the one list of them                       |
| `src/lib/server/card/`             | The picture a shared link unfolds into, and the faces it is set in              |
| `src/lib/book/calendar.ts`         | A diary by its dates: which days have writing on them                           |
| `src/lib/book/Stage.ts`            | The book, in three.js: boards, stacks of pages, leaves that turn                |
| `src/lib/book/curve.ts`            | The shape of a page lying still and of one being turned                         |
| `src/lib/book/layout.ts`           | Where an entry's lines break and where its pages do, for the size of the screen |
| `src/lib/book/faces.ts`            | A diary as a run of spreads                                                     |
| `src/lib/book/paint.ts`            | Everything drawn and not modelled: pages, writing, leather, gold                |
| `src/lib/book/reader.svelte.ts`    | Someone reading: where they are, and the entries read so far                    |
| `src/lib/components/Leaves.svelte` | The diary as it is read: a leaf to an entry, scrolled                           |
| `src/routes/[[network=network]]/`  | The pages: the front page and shelf, `new`, `d/[slug]`                          |

## Things that are easy to get wrong

- **Who may write is decided by the contract**, not by the site. The site only
  explains. Any wallet can connect; an account that is not a Vela account can
  read a diary it has the link to, and is told why it cannot keep one.
- **A Vela account has no code on a chain until its first transaction there.**
  The site cannot ask the contract about such an account, so it goes by the
  wallet that is connected and lets the contract decide when the call lands.
- **The wallet's answer is not proof.** Vela answers `eth_sendTransaction`
  only once the transaction is in a block, and after a couple of minutes gives
  up with an error saying it may still land. So `transact` in `vellum.ts`
  watches the chain for what the call did, from the moment the wallet is
  asked, and that is what settles it. Treating the wallet's error as "not
  sent" is how someone pays for the same page twice; the half-written page is
  kept in the browser until it is read back from the chain.
- **The seal is not a promise.** Sealing a page pours wax at once and keeps it
  warm while the wallet and the chain take their time
  (`src/lib/components/Sealing.svelte`). The die comes down only after the
  page has been read back from the chain, never on the wallet's word, and a
  refusal lifts the wax off again. Do not move the stamp earlier to make it
  feel quicker: a seal on a page that then fails is a lie the reader was
  shown.
- **The site shows an account only its own diaries.** There is no page that
  lists anyone else's, and a diary's page opens only for its full link. Keep it
  that way: it is the whole of what "private" means here.
- **A pen name is not who someone is.** Anyone can sign a diary with any name.
  Wherever a pen name is shown, the account is shown with it, and where there
  is room its face: the identicon Vela Wallet draws for the address
  (`src/lib/identicon.ts`, held to the wallet's own test vectors). Do not show
  a name alone, and do not change the drawing.
- **A link to one page must not lead to the rest.** Nothing shown for a page
  link may carry the diary's own link, or say more of the diary than its title
  and its keeper. Only its keeper, connected, is shown the way to the whole.
  The same goes for the server: a card, or the words under a link, are made
  only after `slugOpens` has said the link is the right one.
- **The book draws only when something moves.** A page lying open is a still
  picture and costs nothing. Anything added to the scene has to say when it
  needs drawing (`#invalidate`), not draw every frame.
- **A page's writing is sized for the screen.** `metricsFor` picks the smallest
  writing that can still be read at the size the page is shown, so a page holds
  as much as it can; the entry is then set on as many pages as it needs. Change
  the numbers in `layout.ts`, not the camera, to fit more on a page.

## Try it without a phone

A real Vela account signs with a passkey. For a local fork there is a pretend
wallet instead, which only a development server will load. Make the fork and
an account as [../contracts/README.md](../contracts/README.md#try-it-without-a-phone)
describes, point the practice book at it in `.env.development`, which a dev
server reads and a build never does:

```sh
TESTNET_VELLUM_ADDRESS=<the Vellum deployed to the fork>
TESTNET_RPC_URL=http://127.0.0.1:8546
```

and open `http://localhost:5173/testnet?mock=<the account>`. Add
`&mock-mode=reject` to have the wallet refuse every transaction, or
`&mock-mode=timeout` to have it send one and then stop waiting, as Vela does.

A real wallet cannot be used against a fork: it sends to the real chain, where
the fork's contract does not exist.

## Deploy it

The site is one Cloudflare Worker, `vellum`, for all three networks:

```sh
bun run build
wrangler deploy
```

Its home is `vellum.game3.app`; the contract names that address and cannot be
changed.

When Cloudflare builds it from the repository, give the build the variable
`BUN_VERSION`, set to the Bun that wrote `bun.lock` (1.4.2 at the time of
writing). The build's root directory is `web`.

## Check it

```sh
bun run check      # types
bun run lint       # prettier and eslint
bun run test:unit  # vitest: pure logic in node, components in a browser
bun run test:e2e   # playwright, against the built Worker: this is what draws a card for real
bun run build      # the Cloudflare Worker
```

Do not build, or run a second dev server, from this directory while a dev
server is up with other settings: they write the same generated files under
`.svelte-kit`. Copy the directory and run there.
