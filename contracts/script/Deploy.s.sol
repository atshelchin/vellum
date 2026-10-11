// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {Vellum} from "../src/Vellum.sol";

/// Deploys Vellum through the CREATE2 factory every chain has at
/// 0x4e59b44847b379578588920cA78FbF26c0B4956C.
///
/// Deployed that way, where the contract lands follows from three things: its
/// code, its treasury, and `SALT`. Not from who pays for the transaction, and
/// not from which chain it is sent on. So whoever sends it needs to hold gas
/// and nothing else, and Vellum has the same address on Arc Testnet as on
/// Ethereum.
///
/// `TREASURY` names where the fees go, and cannot be changed afterwards, so it
/// has to be said and not assumed.
contract Deploy is Script {
    /// Which Vellum this is. Another salt would be another contract somewhere else.
    bytes32 public constant SALT = keccak256("Vellum 1");

    function run() external returns (Vellum vellum) {
        address treasury = vm.envAddress("TREASURY");
        address expected = predict(treasury);

        // Sent twice, the second would only burn gas failing: the address is taken.
        if (expected.code.length > 0) {
            console.log("Vellum is already on this chain, at", expected);
            return Vellum(expected);
        }

        vm.startBroadcast();
        vellum = new Vellum{salt: SALT}(treasury);
        vm.stopBroadcast();

        require(address(vellum) == expected, "Vellum did not land where it should");
        console.log("Vellum deployed at", address(vellum));
    }

    /// Where Vellum is, or will be, for a treasury. The same on every chain.
    function predict(address treasury) public pure returns (address) {
        bytes32 initCodeHash = keccak256(abi.encodePacked(type(Vellum).creationCode, abi.encode(treasury)));
        return vm.computeCreate2Address(SALT, initCodeHash, CREATE2_FACTORY);
    }
}
