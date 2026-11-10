import { InvalidInputError } from './errors';

export interface DomainOptions {
	/** Remove a leading "www." (default true). */
	removeWww?: boolean;
}

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

/**
 * Turn what a user typed (a domain, a URL, "https://www.Example.com/page?x=1") into a plain
 * lower-case domain. Throws InvalidInputError when the result cannot be a real domain name.
 * SameAPI itself accepts any text and answers with empty data, so this is checked here.
 */
export function normalizeDomain(input: unknown, options: DomainOptions = {}): string {
	if (typeof input !== 'string' || input.trim() === '') {
		throw new InvalidInputError(
			'The domain is empty',
			'Enter a domain such as example.com, or map a field that contains one.',
		);
	}
	let host = input.trim();
	const schemeEnd = host.indexOf('://');
	if (schemeEnd !== -1) host = host.slice(schemeEnd + 3);
	host = host.split(/[/?#]/)[0];
	host = host.slice(host.lastIndexOf('@') + 1);
	host = host.replace(/:\d+$/, '').replace(/\.+$/, '').toLowerCase();
	if (options.removeWww !== false) host = host.replace(/^www\./, '');

	const ascii = toAscii(host);
	const labels = ascii.split('.');
	const valid =
		ascii.length > 0 &&
		ascii.length <= 253 &&
		labels.length >= 2 &&
		labels.every((label) => LABEL.test(label)) &&
		!/^\d+$/.test(labels[labels.length - 1]);
	if (!valid) {
		throw new InvalidInputError(
			`"${input.trim().slice(0, 80)}" is not a valid domain`,
			'Use a domain name such as example.com. IP addresses and single words are not supported.',
		);
	}
	return ascii;
}

function toAscii(host: string): string {
	if (host === '') return '';
	try {
		// URL punycode-encodes international names (bücher.de -> xn--bcher-kva.de).
		return new URL(`http://${host}`).hostname;
	} catch {
		return '';
	}
}

/** Split a pasted list ("a.com, b.com\nc.com") into its entries. */
export function splitDomainList(text: unknown): string[] {
	if (typeof text !== 'string') return [];
	return text.split(/[\s,;]+/).filter((entry) => entry !== '');
}

export interface PreparedDomains {
	domains: string[];
	/** Index of the input item each domain came from (same length as `domains`). */
	sourceIndexes: number[];
	skipped: Array<{ input: string; reason: string }>;
}

/** Normalize, check and de-duplicate a list. Invalid entries are skipped or raise an error. */
export function prepareDomains(
	entries: Array<{ value: unknown; sourceIndex: number }>,
	options: DomainOptions & { skipInvalid: boolean },
): PreparedDomains {
	const seen = new Set<string>();
	const domains: string[] = [];
	const sourceIndexes: number[] = [];
	const skipped: Array<{ input: string; reason: string }> = [];

	for (const { value, sourceIndex } of entries) {
		const checked = checkDomain(value, options);
		if ('error' in checked) {
			if (!options.skipInvalid) throw checked.error;
			skipped.push({ input: String(value ?? ''), reason: checked.error.message });
			continue;
		}
		if (seen.has(checked.domain)) continue;
		seen.add(checked.domain);
		domains.push(checked.domain);
		sourceIndexes.push(sourceIndex);
	}
	return { domains, sourceIndexes, skipped };
}

/** Like normalizeDomain, but returns the problem instead of throwing it. */
function checkDomain(
	value: unknown,
	options: DomainOptions,
): { domain: string } | { error: InvalidInputError } {
	let problem: InvalidInputError | undefined;
	let domain = '';
	try {
		domain = normalizeDomain(value, options);
	} catch (error) {
		problem =
			error instanceof InvalidInputError ? error : new InvalidInputError('The domain could not be read');
	}
	return problem ? { error: problem } : { domain };
}
