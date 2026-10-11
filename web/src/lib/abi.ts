import { parseAbi } from 'viem';

export const vellumAbi = parseAbi([
	'struct DiaryView { uint256 id; address owner; uint48 createdAt; uint48 lastWrittenAt; uint8 cover; uint256 entries; string title; }',
	'struct EntryView { uint48 writtenAt; string text; }',
	'function create(string title, uint8 cover) returns (uint256 id)',
	'function write(uint256 id, string text) payable returns (uint256 index)',
	'function isVelaWallet(address account) view returns (bool)',
	'function diaryCountOf(address owner) view returns (uint256)',
	'function entryCount(uint256 id) view returns (uint256)',
	'function getDiary(uint256 id) view returns (DiaryView)',
	'function getDiariesOf(address owner, uint256 offset, uint256 limit) view returns (DiaryView[] page, uint256 total)',
	'function getEntry(uint256 id, uint256 index) view returns (EntryView)',
	'function getEntries(uint256 id, uint256 offset, uint256 limit) view returns (EntryView[] page, uint256 total)',
	'event DiaryCreated(uint256 indexed id, address indexed owner, string title, uint8 cover)',
	'event EntryWritten(uint256 indexed id, uint256 indexed index, address indexed owner)',
	'error NotVelaWallet()',
	'error NoSuchDiary()',
	'error NoSuchEntry()',
	'error NotOwner()',
	'error BadTitle()',
	'error BadEntry()',
	'error WrongFee()',
	'error StoreFailed()'
]);
