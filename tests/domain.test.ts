/* eslint-disable @n8n/community-nodes/no-restricted-imports -- unit tests only: not part of the published package */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeDomain, prepareDomains, splitDomainList } from '../nodes/SameApi/lib/domain';
import { InvalidInputError } from '../nodes/SameApi/lib/errors';

describe('normalizeDomain', () => {
	it('keeps a plain domain', () => {
		assert.equal(normalizeDomain('example.com'), 'example.com');
	});

	it('cleans URLs, case, ports, paths and www', () => {
		assert.equal(normalizeDomain('  HTTPS://www.Example.COM:8080/a/b?x=1#top '), 'example.com');
		assert.equal(normalizeDomain('user:pw@example.org/path'), 'example.org');
		assert.equal(normalizeDomain('example.com.'), 'example.com');
	});

	it('keeps www when asked to', () => {
		assert.equal(normalizeDomain('www.example.com', { removeWww: false }), 'www.example.com');
	});

	it('keeps real subdomains', () => {
		assert.equal(normalizeDomain('blog.example.co.uk'), 'blog.example.co.uk');
	});

	it('converts international names to punycode', () => {
		assert.equal(normalizeDomain('bücher.de'), 'xn--bcher-kva.de');
	});

	for (const bad of ['', '   ', 'localhost', 'not a domain', '192.168.1.1', 'a..com', '-bad.com', 'x.123']) {
		it(`rejects "${bad}"`, () => {
			assert.throws(() => normalizeDomain(bad), InvalidInputError);
		});
	}

	it('rejects values that are not text', () => {
		assert.throws(() => normalizeDomain(undefined), InvalidInputError);
		assert.throws(() => normalizeDomain(42), InvalidInputError);
	});
});

describe('splitDomainList', () => {
	it('splits on commas, spaces, semicolons and new lines', () => {
		assert.deepEqual(splitDomainList('a.com, b.com\nc.com;d.com  e.com'), [
			'a.com',
			'b.com',
			'c.com',
			'd.com',
			'e.com',
		]);
	});
	it('returns nothing for empty input', () => {
		assert.deepEqual(splitDomainList(''), []);
		assert.deepEqual(splitDomainList(undefined), []);
	});
});

describe('prepareDomains', () => {
	const entries = [
		{ value: 'A.com', sourceIndex: 0 },
		{ value: 'https://a.com/x', sourceIndex: 1 },
		{ value: 'nope', sourceIndex: 2 },
		{ value: 'b.com', sourceIndex: 3 },
	];

	it('de-duplicates and remembers where each domain came from', () => {
		const result = prepareDomains([entries[0], entries[1], entries[3]], { skipInvalid: false });
		assert.deepEqual(result.domains, ['a.com', 'b.com']);
		assert.deepEqual(result.sourceIndexes, [0, 3]);
	});

	it('stops on an invalid entry by default', () => {
		assert.throws(() => prepareDomains(entries, { skipInvalid: false }), InvalidInputError);
	});

	it('skips invalid entries when asked and reports them', () => {
		const result = prepareDomains(entries, { skipInvalid: true });
		assert.deepEqual(result.domains, ['a.com', 'b.com']);
		assert.equal(result.skipped.length, 1);
		assert.equal(result.skipped[0].input, 'nope');
	});
});
