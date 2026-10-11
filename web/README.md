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

## What is where

| Path                              | What it is                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------- |
| `src/lib/chain.ts`                | The two networks: chain, nodes, the contract's address, what the coin is called |
| `src/lib/wallet.svelte.ts`        | Wallet discovery (EIP-6963, then `window.ethereum`) and the connection          |
| `src/lib/vellum.ts`               | Reads from the contract, and the two things an account can do                   |
| `src/lib/slug.ts`                 | What a diary's link is made of                                                  |
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
- **The site shows an account only its own diaries.** There is no page that
  lists anyone else's, and a diary's page opens only for its full link. Keep it
  that way: it is the whole of what "private" means here.
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
bun run build      # the Cloudflare Worker
```

Do not build, or run a second dev server, from this directory while a dev
server is up with other settings: they write the same generated files under
`.svelte-kit`. Copy the directory and run there.
