// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Vellum} from "../src/Vellum.sol";

/// Vellum with the wallet check replaced by a list, so the diary's own rules
/// are tested without Safe's contracts. The real check is tested in
/// VelaWallet.t.sol and, against live chains, in VellumFork.t.sol.
contract VellumHarness is Vellum {
    mapping(address => bool) public vela;

    constructor(address treasury_) Vellum(treasury_) {}

    function setVela(address account, bool yes) external {
        vela[account] = yes;
    }

    function isVelaWallet(address account) public view override returns (bool) {
        return vela[account];
    }
}

contract RejectsPayment {}

contract VellumTest is Test {
    VellumHarness vellum;
    address treasury = makeAddr("treasury");
    address writer = makeAddr("writer");
    address other = makeAddr("other");

    uint256 constant FEE = 0.001 ether;

    function setUp() public {
        vellum = new VellumHarness(treasury);
        vellum.setVela(writer, true);
        vellum.setVela(other, true);
        vm.deal(writer, 100 ether);
        vm.deal(other, 100 ether);
        vm.warp(1_800_000_000);
    }

    function _create(address owner, string memory title) internal returns (uint256 id) {
        vm.prank(owner);
        id = vellum.create(title, 3);
    }

    function _write(address owner, uint256 id, string memory text) internal returns (uint256 index) {
        vm.prank(owner);
        index = vellum.write{value: FEE}(id, text);
    }

    function _text(uint256 length, uint256 seed) internal pure returns (string memory) {
        bytes memory text = new bytes(length);
        for (uint256 i = 0; i < length; i++) {
            // Printable ASCII, so a failing comparison can be read.
            text[i] = bytes1(uint8(32 + uint256(keccak256(abi.encode(seed, i))) % 95));
        }
        return string(text);
    }

    // ── Opening a diary ─────────────────────────────────────────────────────

    function test_constructor_needsATreasury() public {
        vm.expectRevert(Vellum.NoTreasury.selector);
        new VellumHarness(address(0));
    }

    function test_create_storesTheDiary() public {
        vm.expectEmit();
        emit Vellum.DiaryCreated(0, writer, "Field notes", 3);
        uint256 id = _create(writer, "Field notes");

        Vellum.DiaryView memory diary = vellum.getDiary(id);
        assertEq(diary.id, 0);
        assertEq(diary.owner, writer);
        assertEq(diary.createdAt, block.timestamp);
        assertEq(diary.lastWrittenAt, 0);
        assertEq(diary.cover, 3);
        assertEq(diary.entries, 0);
        assertEq(diary.title, "Field notes");
        assertEq(vellum.diaryCount(), 1);
        assertEq(vellum.diaryCountOf(writer), 1);
        assertEq(vellum.entryCount(id), 0);
    }

    function test_create_onlyVela() public {
        address stranger = makeAddr("stranger");
        vm.prank(stranger);
        vm.expectRevert(Vellum.NotVelaWallet.selector);
        vellum.create("Mine", 0);
    }

    function test_create_isFree() public {
        vm.prank(writer);
        (bool sent,) = address(vellum).call{value: 1}(abi.encodeCall(Vellum.create, ("Mine", 0)));
        assertFalse(sent, "create took a payment");
    }

    function test_create_titleBounds() public {
        vm.prank(writer);
        vm.expectRevert(Vellum.BadTitle.selector);
        vellum.create("", 0);

        vm.prank(writer);
        vm.expectRevert(Vellum.BadTitle.selector);
        vellum.create(_text(65, 1), 0);

        string memory longest = _text(64, 2);
        assertEq(vellum.getDiary(_create(writer, longest)).title, longest);
    }

    function test_create_asManyAsOneLikes() public {
        for (uint256 i = 0; i < 40; i++) {
            assertEq(_create(writer, "Another"), i);
        }
        assertEq(vellum.diaryCountOf(writer), 40);
    }

    // ── Writing ─────────────────────────────────────────────────────────────

    function test_write_storesTheEntry() public {
        uint256 id = _create(writer, "Field notes");
        vm.warp(block.timestamp + 1 days);

        vm.expectEmit();
        emit Vellum.EntryWritten(id, 0, writer);
        uint256 index = _write(writer, id, "Dear diary, it rained all day.");

        assertEq(index, 0);
        Vellum.EntryView memory entry = vellum.getEntry(id, 0);
        assertEq(entry.text, "Dear diary, it rained all day.");
        assertEq(entry.writtenAt, block.timestamp);

        Vellum.DiaryView memory diary = vellum.getDiary(id);
        assertEq(diary.entries, 1);
        assertEq(diary.lastWrittenAt, block.timestamp);
        assertEq(diary.createdAt, block.timestamp - 1 days);
        assertEq(address(vellum).balance, FEE);
    }

    function test_write_keepsEveryByte() public {
        uint256 id = _create(writer, "Field notes");
        // Line breaks, an emoji, Chinese, and a zero byte: none of it is the contract's to judge.
        string memory text = unicode"第一行\n\nsecond line — “quoted” 🌒\x00 end";
        _write(writer, id, text);
        assertEq(vellum.getEntry(id, 0).text, text);
    }

    function test_write_onlyTheOwner() public {
        uint256 id = _create(writer, "Field notes");
        vm.prank(other);
        vm.expectRevert(Vellum.NotOwner.selector);
        vellum.write{value: FEE}(id, "not mine to write in");
    }

    function test_write_ownerNeedNotBeAskedAgain() public {
        uint256 id = _create(writer, "Field notes");
        // Whatever the wallet check says later, the diary is still its owner's.
        vellum.setVela(writer, false);
        _write(writer, id, "still mine");
        assertEq(vellum.entryCount(id), 1);
    }

    function test_write_exactFee() public {
        uint256 id = _create(writer, "Field notes");

        vm.prank(writer);
        vm.expectRevert(Vellum.WrongFee.selector);
        vellum.write(id, "free?");

        vm.prank(writer);
        vm.expectRevert(Vellum.WrongFee.selector);
        vellum.write{value: FEE - 1}(id, "nearly");

        vm.prank(writer);
        vm.expectRevert(Vellum.WrongFee.selector);
        vellum.write{value: FEE + 1}(id, "too much");
    }

    function test_write_noSuchDiary() public {
        vm.prank(writer);
        vm.expectRevert(Vellum.NoSuchDiary.selector);
        vellum.write{value: FEE}(0, "into the void");
    }

    function test_write_lengthBounds() public {
        uint256 id = _create(writer, "Field notes");

        vm.prank(writer);
        vm.expectRevert(Vellum.BadEntry.selector);
        vellum.write{value: FEE}(id, "");

        string memory tooLong = _text(vellum.MAX_ENTRY_LENGTH() + 1, 1);
        vm.prank(writer);
        vm.expectRevert(Vellum.BadEntry.selector);
        vellum.write{value: FEE}(id, tooLong);

        string memory one = "x";
        _write(writer, id, one);
        assertEq(vellum.getEntry(id, 0).text, one);

        string memory longest = _text(vellum.MAX_ENTRY_LENGTH(), 2);
        _write(writer, id, longest);
        assertEq(keccak256(bytes(vellum.getEntry(id, 1).text)), keccak256(bytes(longest)));
    }

    function test_write_asManyAsOneLikes() public {
        uint256 id = _create(writer, "Field notes");
        for (uint256 i = 0; i < 60; i++) {
            assertEq(_write(writer, id, "again"), i);
        }
        assertEq(vellum.entryCount(id), 60);
        assertEq(address(vellum).balance, 60 * FEE);
    }

    function testFuzz_write_roundTrips(bytes calldata raw) public {
        vm.assume(raw.length > 0 && raw.length <= vellum.MAX_ENTRY_LENGTH());
        uint256 id = _create(writer, "Field notes");
        _write(writer, id, string(raw));
        assertEq(bytes(vellum.getEntry(id, 0).text), raw);
    }

    /// Two entries read in one call must not run into each other in memory.
    function testFuzz_getEntries_keepsNeighboursApart(uint16 a, uint16 b, uint16 c) public {
        uint256 id = _create(writer, "Field notes");
        string[3] memory texts = [_text(1 + a % 700, 1), _text(1 + b % 700, 2), _text(1 + c % 700, 3)];
        for (uint256 i = 0; i < 3; i++) {
            _write(writer, id, texts[i]);
        }
        (Vellum.EntryView[] memory page,) = vellum.getEntries(id, 0, 3);
        for (uint256 i = 0; i < 3; i++) {
            assertEq(page[i].text, texts[i]);
        }
    }

    // ── Reading ─────────────────────────────────────────────────────────────

    function test_getDiary_noSuchDiary() public {
        vm.expectRevert(Vellum.NoSuchDiary.selector);
        vellum.getDiary(0);
        vm.expectRevert(Vellum.NoSuchDiary.selector);
        vellum.entryCount(0);
        vm.expectRevert(Vellum.NoSuchDiary.selector);
        vellum.getEntries(0, 0, 10);
    }

    function test_getEntry_noSuchEntry() public {
        uint256 id = _create(writer, "Field notes");
        vm.expectRevert(Vellum.NoSuchEntry.selector);
        vellum.getEntry(id, 0);
    }

    function test_getEntries_pagesInWritingOrder() public {
        uint256 id = _create(writer, "Field notes");
        for (uint256 i = 0; i < 7; i++) {
            vm.warp(block.timestamp + 1 hours);
            _write(writer, id, vm.toString(i));
        }

        (Vellum.EntryView[] memory page, uint256 total) = vellum.getEntries(id, 0, 3);
        assertEq(total, 7);
        assertEq(page.length, 3);
        assertEq(page[0].text, "0");
        assertEq(page[2].text, "2");
        assertLt(page[0].writtenAt, page[1].writtenAt);

        (page,) = vellum.getEntries(id, 5, 3);
        assertEq(page.length, 2);
        assertEq(page[0].text, "5");
        assertEq(page[1].text, "6");

        (page, total) = vellum.getEntries(id, 7, 3);
        assertEq(page.length, 0);
        assertEq(total, 7);

        (page,) = vellum.getEntries(id, 0, 0);
        assertEq(page.length, 0);

        (page,) = vellum.getEntries(id, 2, type(uint256).max);
        assertEq(page.length, 5);
    }

    function test_getDiariesOf_pagesNewestFirst() public {
        _create(writer, "one");
        _create(other, "not hers");
        _create(writer, "two");
        _create(writer, "three");
        _write(writer, 2, "in the second");

        (Vellum.DiaryView[] memory page, uint256 total) = vellum.getDiariesOf(writer, 0, 2);
        assertEq(total, 3);
        assertEq(page.length, 2);
        assertEq(page[0].title, "three");
        assertEq(page[0].id, 3);
        assertEq(page[1].title, "two");
        assertEq(page[1].id, 2);
        assertEq(page[1].entries, 1);

        (page,) = vellum.getDiariesOf(writer, 2, 2);
        assertEq(page.length, 1);
        assertEq(page[0].title, "one");
        assertEq(page[0].id, 0);

        (page, total) = vellum.getDiariesOf(writer, 3, 2);
        assertEq(page.length, 0);
        assertEq(total, 3);

        (page, total) = vellum.getDiariesOf(makeAddr("nobody"), 0, 10);
        assertEq(page.length, 0);
        assertEq(total, 0);
    }

    function test_getDiaries_pagesNewestFirst() public {
        _create(writer, "one");
        _create(other, "two");
        _create(writer, "three");

        (Vellum.DiaryView[] memory page, uint256 total) = vellum.getDiaries(1, 5);
        assertEq(total, 3);
        assertEq(page.length, 2);
        assertEq(page[0].title, "two");
        assertEq(page[0].owner, other);
        assertEq(page[1].title, "one");
    }

    // ── Fees ────────────────────────────────────────────────────────────────

    function test_withdraw_sendsTheFeesToTheTreasury() public {
        uint256 id = _create(writer, "Field notes");
        _write(writer, id, "one");
        _write(writer, id, "two");

        vm.expectEmit();
        emit Vellum.Withdrawn(2 * FEE);
        vm.prank(makeAddr("anyone"));
        vellum.withdraw();

        assertEq(treasury.balance, 2 * FEE);
        assertEq(address(vellum).balance, 0);
    }

    function test_withdraw_failsLoudlyWhenTheTreasuryRefuses() public {
        VellumHarness stuck = new VellumHarness(address(new RejectsPayment()));
        stuck.setVela(writer, true);
        vm.startPrank(writer);
        uint256 id = stuck.create("Field notes", 0);
        stuck.write{value: FEE}(id, "one");
        vm.stopPrank();

        vm.expectRevert(Vellum.TransferFailed.selector);
        stuck.withdraw();
        assertEq(address(stuck).balance, FEE);
    }

    function test_plainPaymentsAreRefused() public {
        vm.prank(writer);
        (bool sent,) = address(vellum).call{value: 1 ether}("");
        assertFalse(sent);
    }

    // ── What it costs ───────────────────────────────────────────────────────

    /// Not an assertion about the EVM so much as a record: run with -vv to read it.
    function test_gas_ofAnEntry() public {
        uint256 id = _create(writer, "Field notes");
        _write(writer, id, "the first entry pays for the list itself");

        uint256[4] memory lengths = [uint256(280), 1000, 4000, 24_575];
        for (uint256 i = 0; i < lengths.length; i++) {
            string memory text = _text(lengths[i], i);
            vm.prank(writer);
            uint256 before = gasleft();
            vellum.write{value: FEE}(id, text);
            uint256 used = before - gasleft();
            emit log_named_uint(string.concat("gas to write ", vm.toString(lengths[i]), " bytes"), used);
            // Storage would cost 22,100 a word; this has to stay well under half of that.
            assertLt(used, 60_000 + lengths[i] * 345);
        }
    }
}
