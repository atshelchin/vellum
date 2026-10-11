# Vellum

A diary kept on Ethereum, for [Vela Wallet](https://getvela.app) accounts.

You open a diary, choose its leather and have a title stamped on it. Then you
write entries in it, each one sealed on the chain on the day it was written.
Nothing can be edited afterwards and nothing can be removed, by anyone. The
site shows a diary as a book: you turn its pages.

It is an open diary. Everything written is public on the chain. The site shows
an account its own diaries and nobody else's, and opens a diary for someone
else only through a link its keeper gives out. That is the site's manners, not
a lock: anyone who reads the contract directly can read every diary.

## One site, two networks

|            | The diary            | The practice book                           |
| ---------- | -------------------- | ------------------------------------------- |
| Where      | `vellum.game3.app/`  | `vellum.game3.app/testnet`                  |
| Chain      | Ethereum             | Arc Testnet                                 |
| An entry   | 0.001 ETH, and gas   | 0.001 test USDC, free from a faucet         |
| What lasts | Everything, for good | Nothing is promised: a testnet can be wiped |

The practice book is there so that people can find out how it works before a
page costs money. It is the same contract and the same pages; a switch in the
header goes from one to the other, and the wallet stays connected across it.

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
[`0xB19C2F9c703116B4E680953006fc01180AD1ab68`](https://explorer.testnet.arc.io/address/0xB19C2F9c703116B4E680953006fc01180AD1ab68),
with its source published there. It is not on Ethereum yet.

It goes out through a CREATE2 factory, so on Ethereum it will have the same
address. To put it there:

1. Deploy the contract ([contracts/README.md](contracts/README.md#deploy)).
2. Put the address in `DEPLOYED` in `web/src/lib/chain.ts`, and in
   `contracts/erc7730/vellum.json`.
3. Build and deploy the site ([web/README.md](web/README.md#deploy-it)). It is
   one Worker, whichever networks are open.

The contract has no owner and cannot be changed, and it has not been audited.
It names `https://vellum.game3.app` as where it is read, and names where its
fees go; both were fixed when it was deployed.
