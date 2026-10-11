# Vellum

A diary kept on Ethereum, for [Vela Wallet](https://getvela.app) accounts.

You open a diary, choose its leather, have a title stamped on it and sign it
with a pen name if you like. Then you write entries in it, each one sealed on
the chain on the day it was written. Nothing can be edited afterwards and
nothing can be removed, by anyone. The site shows a diary as a book: you turn
its pages. It is set like a book too: every writing in a face made for reading
at length in that writing, the same on every device.

It is an open diary. Everything written is public on the chain. The site shows
an account its own diaries and nobody else's, and opens a diary for someone
else only through a link its keeper gives out. That is the site's manners, not
a lock: anyone who reads the contract directly can read every diary.

A keeper can give out the whole diary, or one page of it. A link to a page
opens that page and no other. Either link, pasted into X, Telegram or Discord,
unfolds into a picture: the book in its leather with its latest words, or the
page with its date and how it begins, and in both whose it is: the pen name,
and beside it the account and its face, the same one Vela Wallet shows for it.
And a diary has
an index by date: a year on one sheet, with a seal on every day that was
written on, each of which opens the book at that day.

## One site, three networks

|            | The diary             | The everyday diary              | The practice book                           |
| ---------- | --------------------- | ------------------------------- | ------------------------------------------- |
| Where      | `vellum.game3.app/`   | `vellum.game3.app/arc`          | `vellum.game3.app/testnet`                  |
| Chain      | Ethereum              | Arc                             | Arc Testnet                                 |
| An entry   | 0.001 ETH, and gas    | 0.001 USDC, and gas             | 0.001 test USDC, free from a faucet         |
| What for   | What is kept for good | Every day, for next to nothing  | Finding out how it works                    |
| What lasts | Everything, for good  | Everything, as long as Arc does | Nothing is promised: a testnet can be wiped |

It is the same contract and the same pages on all three, and an entry costs
0.001 of the chain's own coin on each. What differs is what that is worth, and
so what a diary there is for. Ethereum is dear and has kept everything put on
it for ten years: it is where a page goes that should be there in fifty. Arc is
cheap, which is what a diary written every day needs. The practice book is
there so that people can find out how it works before a page costs anything. A
switch in the header goes from one to another, and the wallet stays connected
across it.

Which network a page is on is said by its address and by nothing else. So a
link always opens on the network it was made on, a link to a practice diary
opens nothing on Ethereum, and a page that says Ethereum is on Ethereum.

## What is here

| Path                      | What it is                                                                               |
| ------------------------- | ---------------------------------------------------------------------------------------- |
| [`contracts/`](contracts) | The `Vellum` contract and the check that tells a Vela account from any other, in Foundry |
| [`web/`](web)             | The site: SvelteKit on Cloudflare Workers, with the book drawn in three.js               |

Each has its own README with how to run and test it.

## Where it stands

The practice book is open: Vellum is on Arc Testnet (chain id 5042002) at
[`0x9fE4b54FB1ffF75dB2600788696df8ABa0Fbc013`](https://explorer.testnet.arc.io/address/0x9fE4b54FB1ffF75dB2600788696df8ABa0Fbc013),
with its source published there. It is not on Ethereum or Arc yet: the
practice book is given time first, and its contract may still change. Once it
has settled, the same contract goes out to both.

It goes out through a CREATE2 factory, so it will have the same address on all
three, for as long as not a byte of it is changed. To open a network:

1. Deploy the contract ([contracts/README.md](contracts/README.md#deploy)).
2. Put the address in `DEPLOYED` in `web/src/lib/chain.ts`, and in
   `contracts/erc7730/vellum.json`.
3. Build and deploy the site ([web/README.md](web/README.md#deploy-it)). It is
   one Worker, whichever networks are open.

The contract has no owner and cannot be changed, and it has not been audited.
It names `https://vellum.game3.app` as where it is read, and names where its
fees go; both were fixed when it was deployed.
