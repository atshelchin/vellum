// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Vellum} from "../src/Vellum.sol";
import {VelaWallet} from "../src/VelaWallet.sol";

interface ISafeProxyFactory {
    function createProxyWithNonce(address singleton, bytes memory initializer, uint256 saltNonce)
        external
        returns (address proxy);
    function proxyCreationCode() external pure returns (bytes memory);
}

interface ISignerFactory {
    function getSigner(uint256 x, uint256 y, uint176 verifiers) external view returns (address);
}

interface ISafeAdmin {
    function setup(
        address[] calldata owners,
        uint256 threshold,
        address to,
        bytes calldata data,
        address fallbackHandler,
        address paymentToken,
        uint256 payment,
        address payable paymentReceiver
    ) external;
    function addOwnerWithThreshold(address owner, uint256 threshold) external;
    function getOwners() external view returns (address[] memory);
    function isModuleEnabled(address module) external view returns (bool);
}

/// The wallet check against the contracts Vela really uses, on a fork of a
/// live chain. Skipped unless FORK_RPC_URL is set. Ethereum is where Vellum
/// lives and Arc Testnet is where it is tried out, so run it against both:
///
///     FORK_RPC_URL=https://ethereum-rpc.publicnode.com forge test --match-contract VellumForkTest
///     FORK_RPC_URL=https://rpc.testnet.arc.network forge test --match-contract VellumForkTest
contract VellumForkTest is Test {
    ISafeProxyFactory constant FACTORY = ISafeProxyFactory(VelaWallet.SAFE_PROXY_FACTORY);

    Vellum vellum;
    /// Not `makeAddr`: an address made from a known word has a known key, and
    /// on Ethereum such accounts are delegated to contracts that sweep whatever
    /// arrives. This one has no key anybody knows.
    address treasury = address(uint160(uint256(keccak256("vellum fork test treasury"))));

    function setUp() public {
        string memory url = vm.envOr("FORK_RPC_URL", string(""));
        if (bytes(url).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(url);
        assertEq(treasury.code.length, 0);
        assertEq(treasury.balance, 0);
        vellum = new Vellum(treasury);
    }

    function _keys(uint256 count, uint256 seed) internal pure returns (uint256[] memory keys) {
        keys = new uint256[](count * 2);
        for (uint256 i = 0; i < count; i++) {
            // Ascending x, as Vela orders every key after the first.
            keys[i * 2] = (seed << 16) + i + 1;
            keys[i * 2 + 1] = uint256(keccak256(abi.encode(seed, i)));
        }
    }

    /// Deploys a wallet exactly as Vela's first user operation does.
    function _found(uint256[] memory keys) internal returns (address safe) {
        safe = FACTORY.createProxyWithNonce(
            VelaWallet.SAFE_SINGLETON, VelaWallet.setupData(keys), uint256(keccak256(abi.encodePacked(keys)))
        );
        assertEq(safe, VelaWallet.predict(keys));
    }

    function test_constantsMatchTheDeployedContracts() public view {
        assertEq(
            keccak256(abi.encodePacked(FACTORY.proxyCreationCode(), uint256(uint160(VelaWallet.SAFE_SINGLETON)))),
            VelaWallet.PROXY_INIT_CODE_HASH
        );
        assertEq(
            ISignerFactory(VelaWallet.SIGNER_FACTORY).getSigner(7, 9, uint176(VelaWallet.VERIFIERS)),
            VelaWallet.signerAddress(7, 9)
        );
    }

    function test_isVelaWallet_acceptsEveryKeyCount() public {
        for (uint256 count = 1; count <= VelaWallet.MAX_KEYS; count++) {
            address safe = _found(_keys(count, count));
            assertEq(safe.codehash, VelaWallet.PROXY_RUNTIME_CODEHASH);
            assertEq(ISafeAdmin(safe).getOwners().length, count);
            assertTrue(ISafeAdmin(safe).isModuleEnabled(VelaWallet.SAFE_4337_MODULE));
            assertTrue(vellum.isVelaWallet(safe), "a Vela wallet was refused");
        }
    }

    function test_isVelaWallet_rejectsTheSameSetupUnderAnotherSalt() public {
        uint256[] memory keys = _keys(2, 42);
        address safe = FACTORY.createProxyWithNonce(VelaWallet.SAFE_SINGLETON, VelaWallet.setupData(keys), 42);
        assertFalse(vellum.isVelaWallet(safe));
    }

    function test_isVelaWallet_rejectsAnOrdinarySafe() public {
        address[] memory owners = new address[](1);
        owners[0] = makeAddr("owner");
        bytes memory setup =
            abi.encodeCall(ISafeAdmin.setup, (owners, 1, address(0), "", address(0), address(0), 0, payable(0)));
        address safe = FACTORY.createProxyWithNonce(VelaWallet.SAFE_SINGLETON, setup, 1);
        assertFalse(vellum.isVelaWallet(safe));
    }

    function test_isVelaWallet_rejectsOtherAccounts() public {
        assertFalse(vellum.isVelaWallet(makeAddr("eoa")));
        assertFalse(vellum.isVelaWallet(address(this)));
        assertFalse(vellum.isVelaWallet(VelaWallet.SAFE_SINGLETON));
        assertFalse(vellum.isVelaWallet(VelaWallet.SHARED_SIGNER));
    }

    function test_onlyVelaWalletsKeepDiaries() public {
        address writer = _found(_keys(1, 1001));
        address another = _found(_keys(3, 1002));
        address stranger = makeAddr("stranger");
        // A test's contracts land on addresses every Foundry user shares, and on
        // Ethereum somebody has sent coin to them. It goes out with the fees.
        uint256 held = address(vellum).balance;
        vm.deal(writer, 1 ether);
        vm.deal(another, 1 ether);
        vm.deal(stranger, 1 ether);

        vm.prank(stranger);
        vm.expectRevert(Vellum.NotVelaWallet.selector);
        vellum.create("Not for me", "", 0);

        vm.prank(writer);
        uint256 id = vellum.create("Field notes", "Tallis", 2);
        assertEq(vellum.getDiary(id).penName, "Tallis");

        vm.prank(stranger);
        vm.expectRevert(Vellum.NotOwner.selector);
        vellum.write{value: 0.001 ether}(id, "someone else's book");

        vm.prank(another);
        vm.expectRevert(Vellum.NotOwner.selector);
        vellum.write{value: 0.001 ether}(id, "a Vela account, but not this diary's");

        vm.prank(writer);
        vellum.write{value: 0.001 ether}(id, "Dear diary.");
        assertEq(vellum.getEntry(id, 0).text, "Dear diary.");

        vm.prank(another);
        assertEq(vellum.create("Three keys", "", 5), id + 1);

        vellum.withdraw();
        assertEq(treasury.balance, held + 0.001 ether);
        assertEq(address(vellum).balance, 0);
    }

    /// What the check costs, since every diary pays it once: run with -vv to read it.
    function test_gas_ofOpeningADiary() public {
        for (uint256 count = 1; count <= VelaWallet.MAX_KEYS; count += 3) {
            address writer = _found(_keys(count, 2000 + count));
            vm.prank(writer);
            uint256 before = gasleft();
            vellum.create("Field notes", "", 0);
            emit log_named_uint(string.concat("gas to open a diary, ", vm.toString(count), " keys"), before - gasleft());
        }
    }
}
