# Vellum contracts

`Vellum.sol` is the diary. A Vela Wallet account opens as many diaries as it
likes and writes as many entries in each as it likes. Opening a diary costs
only gas. Each entry costs `FEE`, 0.001 of the chain's coin, on top of the gas
that stores it. There is no edit and no delete.

`VelaWallet.sol` decides who a Vela account is. A Vela address is a pure
function of its founding passkeys, so the library reads the keys back from the
chain, derives the address Vela would have given them, and compares it with the
caller. That covers both shapes a key takes: the first, kept by Safe's shared
WebAuthn signer in the account's own storage, and every further one, kept by a
signer proxy from Safe's factory. Nothing else can produce a matching address.
The contracts it relies on are byte-for-byte the same on Ethereum and on Arc
Testnet, and the fork tests hold it to that on both.

## How it is built

- **An entry's text is kept as code, not in storage.** Each entry becomes the
  code of a small contract of its own (the SSTORE2 pattern), which costs 200
  gas a byte against storage's 690. Measured here, a 1,000-byte entry takes
  about 267,000 gas to write, and a 4,000-byte one about 876,000. An entry can
  be at most 24,575 bytes, because that is what a contract's code can hold.
- **Only opening a diary asks whether the caller is a Vela account.** Writing
  asks only whether the caller owns the diary. A diary can only have been
  opened by a Vela account, so the question is already answered, and not
  asking it again saves every entry the cost of the check.
- **A diary can be signed.** `create(title, penName, cover)` takes a pen name
  of up to 32 bytes, or none. It is kept with the diary and, like the title,
  never changed. It is a name and not an identity: nothing stops two accounts
  from signing with the same one, so whatever shows a pen name should show the
  account beside it.
- **Everything is read in pages.** `getDiariesOf(owner, offset, limit)` and
  `getDiaries(offset, limit)` go newest first; `getEntries(id, offset, limit)`
  goes in the order entries were written, which is the order a book is read
  in. Each returns the total alongside the page.
- **A diary's dates can be read without its words.**
  `getEntryTimes(id, offset, limit)` gives when each entry was written and
  reads no text, which is what a calendar of a diary is drawn from. Measured
  here, a year of daily entries is one call of about 305,000 gas.
- **There is no owner and no upgrade.** The fees collect in the contract and
  `withdraw()`, which anyone may call, sends them to the `treasury` named when
  it was deployed. They cannot go anywhere else.

## Test

```sh
forge test
```

`Vellum.t.sol` tests the diary's own rules with the wallet check replaced by a
list. `VelaWallet.t.sol` checks the derivation against vela-core's own vectors.
`VellumFork.t.sol` founds real wallets through Safe's deployed contracts on a
fork, and is skipped unless a node is named. Run it against both chains:

```sh
FORK_RPC_URL=https://ethereum-rpc.publicnode.com forge test --match-contract VellumForkTest
FORK_RPC_URL=https://rpc.testnet.arc.network forge test --match-contract VellumForkTest
```

## Deploy

Vellum goes out through the CREATE2 factory at
`0x4e59b44847b379578588920cA78FbF26c0B4956C`, which is on both chains. Deployed
that way, its address follows from its code, its treasury and the salt in
`script/Deploy.s.sol`, and from nothing else: not from who sends the
transaction, and not from which chain it is sent on. So it has one address
everywhere, and whoever deploys it needs to hold gas and nothing more. Change
the code, the treasury or the salt, and it lands somewhere else.

`contracts/.env` holds what a deployment needs. It is never committed:

```sh
TREASURY=<where the fees go>
DEPLOYER_ADDRESS=<an account that holds gas>
DEPLOYER_PRIVATE_KEY=<its key>
```

`TREASURY` cannot be changed afterwards, so the script will not run without
it. Use an address whose key only you hold, and one that can be paid: not a
well-known test address. On Ethereum, accounts whose keys are public have been
delegated to contracts that sweep whatever arrives, and the fees would be gone
the moment they were withdrawn. (The fork test found this out with
`makeAddr("treasury")`.)

The deployer is nobody in particular. Make one for the purpose
(`cast wallet new`), send it what one deployment costs, and treat its key as
worth exactly what is left in it. About 2.1 million gas: a fraction of a test
USDC on Arc Testnet, from https://faucet.circle.com.

```sh
source .env

# See where it will land and what it will cost, without sending anything.
forge script script/Deploy.s.sol --rpc-url arc_testnet --sender $DEPLOYER_ADDRESS

# Arc Testnet first.
forge script script/Deploy.s.sol --rpc-url arc_testnet --broadcast --private-key $DEPLOYER_PRIVATE_KEY

# Then Ethereum, when it is time.
forge script script/Deploy.s.sol --rpc-url mainnet --broadcast --private-key $DEPLOYER_PRIVATE_KEY
```

Run again on a chain that already has it, the script says so and sends nothing.

After each, put the address in `DEPLOYED` in `web/src/lib/chain.ts` (the site
opens a network the moment it has one there) and in `erc7730/vellum.json`, and
publish the source:

```sh
# Arc Testnet: Blockscout, no API key
forge verify-contract <address> src/Vellum.sol:Vellum --chain-id 5042002 \
  --constructor-args $(cast abi-encode "constructor(address)" $TREASURY) \
  --verifier blockscout --verifier-url https://explorer.testnet.arc.io/api/ --watch

# Ethereum: Etherscan
forge verify-contract <address> src/Vellum.sol:Vellum --chain mainnet \
  --constructor-args $(cast abi-encode "constructor(address)" $TREASURY) \
  --etherscan-api-key <key> --watch
```

The contract names its website in `WEBSITE`, and a contract cannot be changed.
Whoever holds that domain is who the contract points people to.

## Deployments

| Network     | Chain id | Vellum                                       |
| ----------- | -------- | -------------------------------------------- |
| Arc Testnet | 5042002  | `0x9fE4b54FB1ffF75dB2600788696df8ABa0Fbc013` |
| Ethereum    | 1        | not yet; it will have the same address       |

Treasury: `0xEf33771897CadcA768DE0e267dE4c328EBA0f7De`. On Arc Testnet the
source is published on the
[explorer](https://explorer.testnet.arc.io/address/0x9fE4b54FB1ffF75dB2600788696df8ABa0Fbc013), and
it went out in transaction
`0xc95f4f7f758348bee08ee435f8a9c1fc78e31fd45bbaff97782126cf17755b3c`.

Two earlier builds are still on Arc Testnet, as everything on a chain is:
`0xB19C2F9c703116B4E680953006fc01180AD1ab68`, from before a diary's dates
could be read on their own, and `0x9c496e2459667854Cf6D57dFeC5dC6AF119f4F17`,
from before a diary could be signed with a pen name. The site reads neither:
what was written in them was practice.

## Try it without a phone

A real Vela account signs with a passkey, which a script cannot do. On a fork
that does not matter: anvil will send a transaction as any address it is told
to, and `script/DevWallet.s.sol` founds an account exactly as Vela would, so
the real wallet check passes.

```sh
anvil --fork-url https://rpc.testnet.arc.network --auto-impersonate --port 8546

DEV=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266   # anvil's first account
TREASURY=<any address> forge script script/Deploy.s.sol \
  --rpc-url http://127.0.0.1:8546 --broadcast --unlocked --sender $DEV
KEYS=1 SEED=1 forge script script/DevWallet.s.sol \
  --rpc-url http://127.0.0.1:8546 --broadcast --unlocked --sender $DEV
cast rpc anvil_setBalance <the account it printed> 0x8AC7230489E80000 --rpc-url http://127.0.0.1:8546
```

Then point the site's practice book at the fork and open it with
`?mock=<that account>`: see [web/README.md](../web/README.md#try-it-without-a-phone).

If the machine sends its traffic through a proxy, name the fork as an
exception, or `forge` and `cast` will ask the proxy for `127.0.0.1` and be
refused: `export NO_PROXY=127.0.0.1,localhost`.

A real wallet cannot be used against a fork. It sends its transaction to the
real chain, where the fork's contract does not exist, and the site, reading the
fork, never sees it.

## Clear signing

Vela Wallet shows a call it cannot decode as a blind signature.
`erc7730/vellum.json` is the ERC-7730 descriptor that lets it say "Open a
diary" or "Write a diary entry" instead, with the fee and the words being
written. Vela looks a descriptor up by chain and address, in its chain-data
source ([ethereum-data](https://github.com/atshelchin/ethereum-data)):

```
erc7730/calldata/eip155-<chain id>/<contract address, lowercase>.json
```

So for each deployment, add its address to the descriptor's `deployments` and
publish a copy under that name.

## What to know

- **Everything is public.** The site shows an account only its own diaries, and
  opens a diary for others only through its keeper's link. The chain does
  neither: every diary can be read from the contract by anyone.
- **Nothing can be undone.** No edit, no delete, no rename. Not by the writer,
  and not by whoever deployed it.
- **One account is not one person.** The check knows an account is shaped
  exactly as Vela shapes one. It cannot know who is behind it, or that it was
  made with the app.
- **A wallet of more than seven passkeys is refused.** Seven is Vela's limit,
  and `MAX_KEYS` follows it.
- **The check is made once, when a diary is opened.** A Safe can change its own
  owners. An account that did so after opening a diary keeps the diary and can
  still write in it; it could not open another.
- **`withdraw()` sends everything the contract holds**, fees or not.
- **It has not been audited.**
