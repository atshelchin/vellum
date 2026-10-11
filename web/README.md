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

## Two networks, in one site

Every page exists twice: at `/…` on Ethereum, and at `/testnet/…` on Arc
Testnet, the practice book. Which one a page is on comes from its address
(`src/params.ts` and `netOf` in `src/lib/chain.ts`) and from nowhere else.
Nothing is remembered between pages, and no module holds a "current network":
whatever reads or writes the chain is handed the network it is for.

That is deliberate, and worth keeping:

- A link opens on the network it was made on. A diary's link carries a key made
  from the chain and the contract, so a practice link opens nothing on Ethereum.
- The server renders many requests at once. A network kept in a variable would
  be shared between them.
- On the practice book, nothing may promise that a page lasts. Copy that
  differs is chosen by `net.practice`.

A network with no contract yet (`undefined` in `DEPLOYED`, in `chain.ts`) is still
there to switch to; its pages say it is not open and point to the one that is.

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

The card's Latin faces travel with the site, cut down to what a card can show
(their licences are beside them). A face that writes Chinese is a hundred times
the size, so those letters are fetched from Google Fonts as each card is
drawn, cut down to the characters on it. If they cannot be had in time, the
card goes out without them and is kept for a minute and no longer.

## The index by date

A diary's page has a calendar, put away until it is asked for: the button
beside Share, or the `I` key. It shows a year on one sheet, with a seal on each
day that was written on, and pressing a seal opens the book at that day. Days
are days where the diary is being read (`src/lib/book/calendar.ts`).

It is drawn from `getEntryTimes`, which reads no text: a year of entries is
one small call (`fetchEntryTimes` in `src/lib/vellum.ts`).

## What is where

| Path                              | What it is                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------- |
| `src/lib/chain.ts`                | The two networks: chain, nodes, the contract's address, what the coin is called |
| `src/lib/wallet.svelte.ts`        | Wallet discovery (EIP-6963, then `window.ethereum`) and the connection          |
| `src/lib/vellum.ts`               | Reads from the contract, and the two things an account can do                   |
| `src/lib/slug.ts`                 | What a link to a diary, or to one page of it, is made of                        |
| `src/lib/identicon.ts`            | An account's face, as Vela Wallet draws it                                      |
| `src/lib/server/card/`            | The picture a shared link unfolds into, and the faces it is set in              |
| `src/lib/book/calendar.ts`        | A diary by its dates: which days have writing on them                           |
| `src/lib/book/Stage.ts`           | The book, in three.js: boards, stacks of pages, leaves that turn                |
| `src/lib/book/curve.ts`           | The shape of a page lying still and of one being turned                         |
| `src/lib/book/layout.ts`          | Where an entry's lines break and where its pages do, for the size of the screen |
| `src/lib/book/faces.ts`           | A diary as a run of spreads                                                     |
| `src/lib/book/paint.ts`           | Everything drawn and not modelled: pages, writing, leather, gold                |
| `src/lib/book/reader.svelte.ts`   | Someone reading: where they are, and the entries read so far                    |
| `src/routes/[[network=network]]/` | The pages: the front page and shelf, `new`, `d/[slug]`                          |

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

The site is one Cloudflare Worker, `vellum`, for both networks:

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
