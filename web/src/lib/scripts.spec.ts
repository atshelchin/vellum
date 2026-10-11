import { describe, expect, it } from 'vitest';
import { fromTheRight, runsOf, scriptsIn, SCRIPTS } from './scripts';

const brief = (text: string) => runsOf(text).map((run) => [run.script?.id ?? 'text', run.text]);

describe('a line, by the faces that write it', () => {
	it('is one stretch when the text face writes all of it', () => {
		expect(brief('Dear diary, 11 October.')).toEqual([['text', 'Dear diary, 11 October.']]);
		expect(brief('Привет, дневник')).toEqual([['text', 'Привет, дневник']]);
		expect(brief('Καλημέρα, ημερολόγιο')).toEqual([['text', 'Καλημέρα, ημερολόγιο']]);
		expect(brief('Hôm nay trời đẹp quá.')).toEqual([['text', 'Hôm nay trời đẹp quá.']]);
	});

	it('gives Chinese to its own face, punctuation and all', () => {
		expect(brief('没那么简单，也许好也许坏。')).toEqual([['han', '没那么简单，也许好也许坏。']]);
		expect(brief('繁體字憂鬱')).toEqual([['han', '繁體字憂鬱']]);
	});

	it('gives kana to the face that writes Chinese', () => {
		expect(brief('こんにちは、日記')).toEqual([['han', 'こんにちは、日記']]);
	});

	it('gives Korean, Thai and Hindi each to their own', () => {
		expect(brief('안녕하세요')).toEqual([['hangul', '안녕하세요']]);
		expect(brief('สวัสดี')).toEqual([['thai', 'สวัสดี']]);
		expect(brief('नमस्ते')).toEqual([['devanagari', 'नमस्ते']]);
	});

	it('changes face where the writing changes, and keeps every character', () => {
		const line = '买了一个御守 omamori，希望 2027 年顺利。 안녕!';
		expect(brief(line)).toEqual([
			['han', '买了一个御守'],
			['text', ' omamori'],
			['han', '，希望'],
			['text', ' 2027 '],
			['han', '年顺利。'],
			['text', ' '],
			['hangul', '안녕'],
			['text', '!']
		]);
	});

	it('keeps a phrase written from the right in one piece, spaces and all', () => {
		// Drawn a word at a time from the left, it would come out backwards.
		expect(brief('مرحبا يا دفتري العزيز')).toEqual([['arabic', 'مرحبا يا دفتري العزيز']]);
		expect(brief('שלום, יומן יקר')).toEqual([['hebrew', 'שלום, יומן יקר']]);
		// What follows it in another writing is not taken with it.
		expect(brief('שלום world')).toEqual([
			['hebrew', 'שלום'],
			['text', ' world']
		]);
	});

	it('loses nothing, whatever it is given', () => {
		for (const line of [
			'',
			'a',
			'你',
			'a你b',
			'مرحبا 123 مرحبا!',
			'🙂 你好 🙂',
			'ไทย English 中文 한국어 हिन्दी'
		]) {
			expect(
				runsOf(line)
					.map((run) => run.text)
					.join('')
			).toBe(line);
		}
	});

	it('can be asked twice', () => {
		// A pattern that remembers where it stopped would start the second line in the wrong place.
		expect(brief('你好')).toEqual(brief('你好'));
	});
});

describe('the writings in a text', () => {
	it('are each named once', () => {
		expect(scriptsIn('你好 world 再见 안녕').map((script) => script.id)).toEqual(['han', 'hangul']);
		expect(scriptsIn('only the text face')).toEqual([]);
	});
});

describe('a line that reads from the right', () => {
	it('is one whose first letter does', () => {
		expect(fromTheRight('مرحبا world')).toBe(true);
		expect(fromTheRight('  "שלום"')).toBe(true);
		expect(fromTheRight('Hello مرحبا')).toBe(false);
		expect(fromTheRight('你好')).toBe(false);
		expect(fromTheRight('123 ...')).toBe(false);
	});
});

describe('the list of writings', () => {
	it('gives every one a face, a place its files come from, and characters of its own', () => {
		for (const script of SCRIPTS) {
			expect(script.family).not.toBe('');
			expect(script.source).not.toBe('');
			expect(script.ranges.length).toBeGreaterThan(0);
			expect(script.advance).toBeGreaterThan(0.3);
		}
	});

	it('gives no character to two writings', () => {
		// A face is offered for its own characters and nothing else. Two that
		// claimed the same character would both be asked to draw it.
		const all = SCRIPTS.flatMap((script) =>
			script.ranges.map((range) => ({ id: script.id, range }))
		);
		for (const one of all) {
			for (const other of all) {
				if (one.id === other.id) continue;
				const apart = one.range[1] < other.range[0] || other.range[1] < one.range[0];
				expect(apart, `${one.id} and ${other.id} overlap`).toBe(true);
			}
		}
	});
});
