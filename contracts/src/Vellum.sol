// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {VelaWallet} from "./VelaWallet.sol";

/// @notice Vellum: diaries kept on Ethereum, by Vela Wallet accounts.
///
/// A Vela account opens as many diaries as it likes, and writes as many
/// entries in each as it likes. Opening a diary is free. Each entry costs
/// `FEE`, on top of the gas that stores it.
///
/// Everything written here is public, and stays. There is no edit and no
/// delete: an entry is as it was written, on the day it was written. The site
/// shows an account its own diaries and nobody else's, but that is the site's
/// manners, not a secret the chain keeps. Anyone can read every diary here.
///
/// An entry's text is kept as the code of a small contract of its own, not in
/// storage. Code costs 200 gas a byte to keep; storage costs 22,100 a word,
/// which is more than three times that. Over a page of writing, that is the
/// difference between a transaction worth making and one that is not.
///
/// There is no owner and no upgrade. The fees can only go to `treasury`.
contract Vellum {
    struct Diary {
        address owner;
        uint48 createdAt;
        uint8 cover;
        string title;
    }

    /// One slot: where the text is, and when it was written.
    struct Entry {
        address pointer;
        uint48 writtenAt;
    }

    /// A diary as it is read: what is stored, its id, and what its entries say about it.
    struct DiaryView {
        uint256 id;
        address owner;
        uint48 createdAt;
        /// Zero until the first entry.
        uint48 lastWrittenAt;
        uint8 cover;
        uint256 entries;
        string title;
    }

    struct EntryView {
        uint48 writtenAt;
        string text;
    }

    /// Where the diaries are read. A contract cannot be changed, so neither can
    /// this: it holds for as long as the address is Vellum's.
    string public constant WEBSITE = "https://vellum.game3.app";

    /// What an entry costs, in the chain's own coin.
    uint256 public constant FEE = 0.001 ether;
    uint256 public constant MAX_TITLE_LENGTH = 64;
    /// A contract's code may be 24,576 bytes, and an entry's begins with one byte that is not text.
    uint256 public constant MAX_ENTRY_LENGTH = 24_575;

    /// Where the fees go, and the only place they can go.
    address public immutable treasury;

    Diary[] private _diaries;
    mapping(uint256 id => Entry[]) private _entries;
    mapping(address owner => uint256[]) private _owned;

    event DiaryCreated(uint256 indexed id, address indexed owner, string title, uint8 cover);
    event EntryWritten(uint256 indexed id, uint256 indexed index, address indexed owner);
    event Withdrawn(uint256 amount);

    error NotVelaWallet();
    error NoTreasury();
    error NoSuchDiary();
    error NoSuchEntry();
    error NotOwner();
    error BadTitle();
    error BadEntry();
    error WrongFee();
    error StoreFailed();
    error TransferFailed();

    constructor(address treasury_) {
        if (treasury_ == address(0)) revert NoTreasury();
        treasury = treasury_;
    }

    /// @notice Opens a diary for the caller, which must be a Vela account.
    /// @param cover Which binding the diary wears. The site knows what each number looks like.
    function create(string calldata title, uint8 cover) external returns (uint256 id) {
        if (!isVelaWallet(msg.sender)) revert NotVelaWallet();
        uint256 length = bytes(title).length;
        if (length == 0 || length > MAX_TITLE_LENGTH) revert BadTitle();

        id = _diaries.length;
        _diaries.push(Diary({owner: msg.sender, createdAt: uint48(block.timestamp), cover: cover, title: title}));
        _owned[msg.sender].push(id);
        emit DiaryCreated(id, msg.sender, title, cover);
    }

    /// @notice Writes an entry in one of the caller's diaries, for `FEE`.
    ///
    /// Only a diary's owner writes in it, and only a Vela account can own one:
    /// that was settled when the diary was opened, and is not asked again.
    function write(uint256 id, string calldata text) external payable returns (uint256 index) {
        Diary storage diary = _diary(id);
        if (msg.sender != diary.owner) revert NotOwner();
        if (msg.value != FEE) revert WrongFee();
        uint256 length = bytes(text).length;
        if (length == 0 || length > MAX_ENTRY_LENGTH) revert BadEntry();

        Entry[] storage entries = _entries[id];
        index = entries.length;
        entries.push(Entry({pointer: _store(bytes(text)), writtenAt: uint48(block.timestamp)}));
        emit EntryWritten(id, index, msg.sender);
    }

    /// @notice Sends the fees collected so far to the treasury. Anyone may call it.
    function withdraw() external {
        uint256 amount = address(this).balance;
        emit Withdrawn(amount);
        (bool sent,) = treasury.call{value: amount}("");
        if (!sent) revert TransferFailed();
    }

    function isVelaWallet(address account) public view virtual returns (bool) {
        return VelaWallet.isVelaWallet(account);
    }

    function diaryCount() external view returns (uint256) {
        return _diaries.length;
    }

    function diaryCountOf(address owner) external view returns (uint256) {
        return _owned[owner].length;
    }

    function entryCount(uint256 id) external view returns (uint256) {
        _diary(id);
        return _entries[id].length;
    }

    function getDiary(uint256 id) external view returns (DiaryView memory) {
        _diary(id);
        return _view(id);
    }

    /// @notice A page of every diary, newest first: `page[i]` is diary `total - 1 - offset - i`.
    function getDiaries(uint256 offset, uint256 limit) external view returns (DiaryView[] memory page, uint256 total) {
        total = _diaries.length;
        uint256 size = _pageSize(total, offset, limit);
        page = new DiaryView[](size);
        for (uint256 i = 0; i < size; i++) {
            page[i] = _view(total - 1 - offset - i);
        }
    }

    /// @notice A page of one account's diaries, newest first.
    function getDiariesOf(address owner, uint256 offset, uint256 limit)
        external
        view
        returns (DiaryView[] memory page, uint256 total)
    {
        uint256[] storage owned = _owned[owner];
        total = owned.length;
        uint256 size = _pageSize(total, offset, limit);
        page = new DiaryView[](size);
        for (uint256 i = 0; i < size; i++) {
            page[i] = _view(owned[total - 1 - offset - i]);
        }
    }

    function getEntry(uint256 id, uint256 index) external view returns (EntryView memory) {
        _diary(id);
        Entry[] storage entries = _entries[id];
        if (index >= entries.length) revert NoSuchEntry();
        return _read(entries[index]);
    }

    /// @notice A page of a diary's entries in the order they were written: `page[i]` is entry `offset + i`.
    function getEntries(uint256 id, uint256 offset, uint256 limit)
        external
        view
        returns (EntryView[] memory page, uint256 total)
    {
        _diary(id);
        Entry[] storage entries = _entries[id];
        total = entries.length;
        uint256 size = _pageSize(total, offset, limit);
        page = new EntryView[](size);
        for (uint256 i = 0; i < size; i++) {
            page[i] = _read(entries[offset + i]);
        }
    }

    function _diary(uint256 id) private view returns (Diary storage) {
        if (id >= _diaries.length) revert NoSuchDiary();
        return _diaries[id];
    }

    function _view(uint256 id) private view returns (DiaryView memory) {
        Diary storage diary = _diaries[id];
        Entry[] storage entries = _entries[id];
        uint256 count = entries.length;
        return DiaryView({
            id: id,
            owner: diary.owner,
            createdAt: diary.createdAt,
            lastWrittenAt: count == 0 ? 0 : entries[count - 1].writtenAt,
            cover: diary.cover,
            entries: count,
            title: diary.title
        });
    }

    function _read(Entry storage entry) private view returns (EntryView memory) {
        return EntryView({writtenAt: entry.writtenAt, text: _load(entry.pointer)});
    }

    function _pageSize(uint256 total, uint256 offset, uint256 limit) private pure returns (uint256) {
        if (offset >= total) return 0;
        uint256 available = total - offset;
        return limit < available ? limit : available;
    }

    /// Keeps `text` as the code of a new contract, and returns that contract.
    function _store(bytes calldata text) private returns (address pointer) {
        // Creation code that returns, as the contract's code, a STOP and then
        // the text. The STOP is what is run if the contract is ever called, so
        // the text never is.
        //
        //   61 size   PUSH2 size       80  DUP1
        //   60 0a     PUSH1 10         3d  RETURNDATASIZE (0)
        //   39        CODECOPY         3d  RETURNDATASIZE (0)
        //   f3        RETURN           00  STOP, the first byte of the code
        bytes memory creation = abi.encodePacked(hex"61", uint16(text.length + 1), hex"80600a3d393df300", text);
        assembly ("memory-safe") {
            pointer := create(0, add(creation, 0x20), mload(creation))
        }
        if (pointer == address(0)) revert StoreFailed();
    }

    /// Reads back what `_store` kept: the contract's code, past its first byte.
    function _load(address pointer) private view returns (string memory text) {
        assembly ("memory-safe") {
            let size := sub(extcodesize(pointer), 1)
            text := mload(0x40)
            // The length, the text, and a clean word after it for whatever pads the text out.
            mstore(0x40, and(add(add(text, size), 0x5f), not(0x1f)))
            mstore(text, size)
            mstore(add(add(text, 0x20), size), 0)
            extcodecopy(pointer, add(text, 0x20), 1, size)
        }
    }
}
