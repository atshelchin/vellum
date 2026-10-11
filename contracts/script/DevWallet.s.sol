// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {VelaWallet} from "../src/VelaWallet.sol";

interface ISafeProxyFactory {
    function createProxyWithNonce(address singleton, bytes memory initializer, uint256 saltNonce)
        external
        returns (address proxy);
}

/// For a local fork only: founds an account exactly as Vela Wallet would, so
/// the site can be tried against the real wallet check without a phone.
///
/// Its passkeys are made up, so nobody can sign for it. On a fork that does not
/// matter, because anvil will send transactions as any address it is told to:
///
///     anvil --fork-url https://rpc.testnet.arc.network --auto-impersonate
///     forge script script/DevWallet.s.sol --rpc-url http://127.0.0.1:8545 --broadcast --unlocked \
///       --sender 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
///
/// `KEYS` is how many passkeys it has (1 to 7) and `SEED` tells one such
/// account from another.
contract DevWallet is Script {
    function run() external returns (address wallet) {
        uint256 count = vm.envOr("KEYS", uint256(1));
        uint256 seed = vm.envOr("SEED", uint256(1));

        uint256[] memory keys = new uint256[](count * 2);
        for (uint256 i = 0; i < count; i++) {
            // Ascending x, as Vela orders every key after the first.
            keys[i * 2] = (seed << 16) + i + 1;
            keys[i * 2 + 1] = uint256(keccak256(abi.encode(seed, i)));
        }

        wallet = VelaWallet.predict(keys);
        if (wallet.code.length == 0) {
            vm.broadcast();
            ISafeProxyFactory(VelaWallet.SAFE_PROXY_FACTORY)
                .createProxyWithNonce(
                    VelaWallet.SAFE_SINGLETON, VelaWallet.setupData(keys), uint256(keccak256(abi.encodePacked(keys)))
                );
        }
        console.log("Vela-shaped account:", wallet);
    }
}
