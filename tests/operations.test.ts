/* eslint-disable @n8n/community-nodes/no-restricted-imports, @n8n/community-nodes/no-restricted-globals -- unit tests only: not part of the published package */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SameApiClient } from '../nodes/SameApi/lib/client';
import { prepareDomains } from '../nodes/SameApi/lib/domain';
import { InvalidInputError, SameApiError } from '../nodes/SameApi/lib/errors';
import type { JsonObject, RawResultItem } from '../nodes/SameApi/lib/types';
import { batchLookup } from '../nodes/SameApi/operations/batch';
import { getJob, getJobResults } from '../nodes/SameApi/operations/jobs';
import { getDomainTraffic } from '../nodes/SameApi/operations/traffic';
import { createFakeApi, type FakeOptions } from './fakeApi';

const fixture = JSON.parse(
	readFileSync(join(__dirname, '..', '..', 'tests', 'fixtures', 'example-com.results.json'), 'utf8'),
) as { items: RawResultItem[] };
const rawData = fixture.items[0].raw_data as JsonObject;

const noSleep = async () => undefined;

function setup(options: FakeOptions = {}) {
	const fake = createFakeApi({ rawData, ...options });
	return { fake, client: new SameApiClient(fake.requester, noSleep) };
}

const trafficParams = {
	domain: 'https://www.Example.com/page',
	simplify: true,
	includeCountryList: false,
	removeWww: true,
	pollIntervalMs: 1,
	timeoutMs: 1000,
};

describe('getDomainTraffic', () => {
	it('returns the simplified data without the user seeing a job', async () => {
		const { fake, client } = setup();
		const out = (await getDomainTraffic(client, noSleep, trafficParams)) as { domain: string; ranks: { global: number } };
		assert.equal(out.domain, 'example.com');
		assert.equal(out.ranks.global, 9425);
		assert.equal(fake.calls[0].path, '/lookup/example.com');
	});

	it('keeps only the groups chosen in Include Fields', async () => {
		const { client } = setup();
		const out = (await getDomainTraffic(client, noSleep, {
			...trafficParams,
			includeFields: ['ranks', 'engagement'],
		})) as Record<string, unknown>;
		assert.deepEqual(Object.keys(out), ['domain', 'ranks', 'engagement']);
	});

	it('asks for the light view by default and the full one only on request', async () => {
		const light = setup();
		await getDomainTraffic(light.client, noSleep, trafficParams);
		assert.equal(light.fake.calls.at(-1)?.qs?.view, 'table');

		const full = setup();
		await getDomainTraffic(full.client, noSleep, { ...trafficParams, simplify: false, includeCountryList: true });
		assert.equal(full.fake.calls.at(-1)?.qs?.view, 'full');
	});

	it('returns the raw item when Simplify is off', async () => {
		const { client } = setup();
		const out = (await getDomainTraffic(client, noSleep, { ...trafficParams, simplify: false })) as RawResultItem;
		assert.equal(out.success, true);
		assert.ok(out.raw_data?.EstimatedMonthlyVisits);
	});

	it('refuses a bad domain before calling the API', async () => {
		const { fake, client } = setup();
		await assert.rejects(
			() => getDomainTraffic(client, noSleep, { ...trafficParams, domain: 'not a domain' }),
			InvalidInputError,
		);
		assert.equal(fake.calls.length, 0);
	});

	it('explains a failed domain', async () => {
		const { client } = setup({ failingDomains: ['example.com'] });
		await assert.rejects(
			() => getDomainTraffic(client, noSleep, trafficParams),
			(error: unknown) => error instanceof SameApiError && /boom/.test(error.description),
		);
	});

	it('stops with a clear error when the job fails', async () => {
		const { client } = setup({ finalStatus: 'failed_final' });
		await assert.rejects(() => getDomainTraffic(client, noSleep, trafficParams), /job failed/);
	});

	it('passes through a 402 as a quota error', async () => {
		const { client } = setup({
			scriptedStatuses: [{ statusCode: 402, body: { message: 'You have reached your monthly quota limit.' } }],
		});
		await assert.rejects(
			() => getDomainTraffic(client, noSleep, trafficParams),
			(error: unknown) => error instanceof SameApiError && error.kind === 'quota',
		);
	});
});

function domainList(count: number): string[] {
	return Array.from({ length: count }, (_, i) => `site${i}.com`);
}

function batchParams(domains: string[], extra: Partial<Parameters<typeof batchLookup>[2]> = {}) {
	return {
		prepared: prepareDomains(
			domains.map((value, sourceIndex) => ({ value, sourceIndex })),
			{ skipInvalid: false },
		),
		wait: true,
		simplify: true,
		includeCountryList: false,
		successOnly: false,
		pollIntervalMs: 1,
		timeoutMs: 1000,
		...extra,
	};
}

describe('batchLookup', () => {
	it('can return the job right away, with webhook settings sent to SameAPI', async () => {
		const { fake, client } = setup();
		const out = await batchLookup(
			client,
			noSleep,
			batchParams(['a.com', 'b.com'], {
				wait: false,
				name: 'Run 1',
				webhookUrl: 'https://example.com/hook',
				webhookSecret: 's3cret',
			}),
		);
		assert.equal(out.results, undefined);
		assert.equal(out.job.status, 'pending');
		assert.deepEqual(fake.calls[0].body, {
			domains: ['a.com', 'b.com'],
			name: 'Run 1',
			webhook_url: 'https://example.com/hook',
			webhook_secret: 's3cret',
		});
		assert.equal(fake.calls.length, 1); // no polling, no results
	});

	it('waits and returns one result per domain', async () => {
		const { client } = setup({ failingDomains: ['b.com'] });
		const out = await batchLookup(client, noSleep, batchParams(['a.com', 'b.com', 'c.com']));
		assert.equal(out.results?.length, 3);
		assert.deepEqual(out.results?.[1].json, {
			domain: 'b.com',
			success: false,
			error: 'boom',
			details: 'boom',
		});
	});

	it('can leave failed domains out', async () => {
		const { client } = setup({ failingDomains: ['b.com'] });
		const out = await batchLookup(client, noSleep, batchParams(['a.com', 'b.com', 'c.com'], { successOnly: true }));
		assert.deepEqual(out.results?.map((r) => r.domain), ['a.com', 'c.com']);
	});

	it('handles the maximum of 10,000 domains by reading 10 pages of 1,000', async () => {
		const { fake, client } = setup();
		const out = await batchLookup(client, noSleep, batchParams(domainList(10_000)));
		assert.equal(out.results?.length, 10_000);
		const pages = fake.calls.filter((call) => call.path.endsWith('/results'));
		assert.equal(pages.length, 10);
		assert.ok(pages.every((call) => call.qs?.per_page === 1000));
		assert.equal(new Set(out.results?.map((r) => r.domain)).size, 10_000);
	});

	it('stops reading once the limit is reached', async () => {
		const { fake, client } = setup();
		const out = await batchLookup(client, noSleep, batchParams(domainList(2500), { limit: 1200 }));
		assert.equal(out.results?.length, 1200);
		assert.equal(fake.calls.filter((call) => call.path.endsWith('/results')).length, 2);
	});

	it('rejects an empty list without calling the API', async () => {
		const { fake, client } = setup();
		await assert.rejects(() => batchLookup(client, noSleep, batchParams([])), /no valid domains/);
		assert.equal(fake.calls.length, 0);
	});

	it('times out with the job ID so the user can continue later', async () => {
		const { client } = setup({ processingPolls: 100_000 });
		let clock = 0;
		const sleep = async (ms: number) => void (clock += ms);
		const realNow = Date.now;
		Date.now = () => clock;
		try {
			await assert.rejects(
				() => batchLookup(client, sleep, batchParams(['a.com'], { pollIntervalMs: 100, timeoutMs: 500 })),
				(error: unknown) => error instanceof SameApiError && error.kind === 'timeout',
			);
		} finally {
			Date.now = realNow;
		}
	});
});

describe('batchLookup with more than 10,000 domains (chunked upload)', () => {
	const paths = (calls: Array<{ method: string; path: string }>) => calls.map((c) => `${c.method} ${c.path}`);

	it('keeps one single call up to 10,000 domains', async () => {
		const { fake, client } = setup();
		await batchLookup(client, noSleep, batchParams(domainList(10_000), { wait: false }));
		assert.deepEqual(paths(fake.calls), ['POST /lookup/batch']);
	});

	it('creates a draft, uploads the domains in calls of 10,000 and starts the job', async () => {
		const { fake, client } = setup();
		const out = await batchLookup(client, noSleep, batchParams(domainList(25_000), { wait: false }));
		assert.deepEqual(paths(fake.calls), [
			'POST /jobs',
			`POST /jobs/${out.job.id}/domains`,
			`POST /jobs/${out.job.id}/domains`,
			`POST /jobs/${out.job.id}/domains`,
			`POST /jobs/${out.job.id}/finalize`,
		]);
		const sizes = fake.calls.filter((c) => c.path.endsWith('/domains')).map((c) => (c.body?.domains as string[]).length);
		assert.deepEqual(sizes, [10_000, 10_000, 5_000]);
		assert.equal(out.job.status, 'pending');
	});

	it('does 10,001 domains as 10,000 plus 1', async () => {
		const { fake, client } = setup();
		await batchLookup(client, noSleep, batchParams(domainList(10_001), { wait: false }));
		const sizes = fake.calls.filter((c) => c.path.endsWith('/domains')).map((c) => (c.body?.domains as string[]).length);
		assert.deepEqual(sizes, [10_000, 1]);
	});

	it('sends name and webhook settings with the draft only', async () => {
		const { fake, client } = setup();
		await batchLookup(
			client,
			noSleep,
			batchParams(domainList(10_500), {
				wait: false,
				name: 'Big run',
				webhookUrl: 'https://example.com/hook',
				webhookSecret: 's3cret',
			}),
		);
		assert.deepEqual(fake.calls[0].body, {
			name: 'Big run',
			webhook_url: 'https://example.com/hook',
			webhook_secret: 's3cret',
		});
		for (const call of fake.calls.slice(1)) assert.deepEqual(Object.keys(call.body ?? {}), call.path.endsWith('/domains') ? ['domains'] : []);
	});

	it('names the draft when no name is given (the API needs one)', async () => {
		const { fake, client } = setup();
		await batchLookup(client, noSleep, batchParams(domainList(10_001), { wait: false }));
		assert.equal(typeof fake.calls[0].body?.name, 'string');
		assert.ok((fake.calls[0].body?.name as string).length > 0);
	});

	it('waits and returns one result per domain for a job above 10,000', async () => {
		const { client } = setup();
		const out = await batchLookup(client, noSleep, batchParams(domainList(12_000)));
		assert.equal(out.results?.length, 12_000);
		assert.equal(new Set(out.results?.map((r) => r.domain)).size, 12_000);
	});

	it('does not start the job when an upload fails, and says so with the draft job ID', async () => {
		const { fake, client } = setup({
			failOnce: [{ match: /POST \/jobs\/[^/]+\/domains/, statusCode: 400, body: { message: 'Max 10,000 domains per request.' } }],
		});
		await assert.rejects(
			() => batchLookup(client, noSleep, batchParams(domainList(25_000), { wait: false })),
			(error: unknown) =>
				error instanceof SameApiError &&
				error.message.includes('job-1') &&
				/not started and nothing was billed/i.test(error.description),
		);
		assert.equal(fake.calls.some((c) => c.path.endsWith('/finalize')), false);
	});

	it('repeats an upload after a server error (the API ignores duplicates)', async () => {
		const { fake, client } = setup({
			failOnce: [{ match: /POST \/jobs\/[^/]+\/domains/, statusCode: 502 }],
		});
		const out = await batchLookup(client, noSleep, batchParams(domainList(10_001), { wait: false }));
		assert.equal(out.job.status, 'pending');
		assert.equal(fake.calls.filter((c) => c.path.endsWith('/domains')).length, 3); // 1 failed + 2 chunks
	});

	it('never repeats the start or the draft after a server error (no double job, no double bill)', async () => {
		const fin = setup({ failOnce: [{ match: /POST \/jobs\/[^/]+\/finalize/, statusCode: 502 }] });
		await assert.rejects(() => batchLookup(fin.client, noSleep, batchParams(domainList(10_001), { wait: false })));
		assert.equal(fin.fake.calls.filter((c) => c.path.endsWith('/finalize')).length, 1);

		const draft = setup({ failOnce: [{ match: /POST \/jobs$/, statusCode: 502 }] });
		await assert.rejects(() => batchLookup(draft.client, noSleep, batchParams(domainList(10_001), { wait: false })));
		assert.equal(draft.fake.calls.filter((c) => c.path === '/jobs').length, 1);
		assert.equal(draft.fake.calls.length, 1);
	});

	it('shows the quota error of the start step in plain words', async () => {
		const { client } = setup({
			failOnce: [{ match: /POST \/jobs\/[^/]+\/finalize/, statusCode: 402, body: { message: 'You have reached your monthly quota limit.' } }],
		});
		await assert.rejects(
			() => batchLookup(client, noSleep, batchParams(domainList(10_001), { wait: false })),
			(error: unknown) => error instanceof SameApiError && error.kind === 'quota',
		);
	});
});

describe('job operations', () => {
	it('gets a job', async () => {
		const { client } = setup();
		const job = await batchLookup(client, noSleep, batchParams(['a.com'], { wait: false }));
		const again = await getJob(client, ` ${job.job.id} `);
		assert.equal(again.id, job.job.id);
	});

	it('explains a missing job', async () => {
		const { client } = setup();
		await assert.rejects(
			() => getJob(client, 'nope'),
			(error: unknown) => error instanceof SameApiError && error.kind === 'not_found',
		);
		await assert.rejects(() => getJob(client, ''), InvalidInputError);
	});

	it('returns all results across pages, or only up to the limit', async () => {
		const { client } = setup();
		const job = await batchLookup(client, noSleep, batchParams(domainList(1500), { wait: false }));
		const all = await getJobResults(client, {
			jobId: job.job.id,
			simplify: true,
			includeCountryList: false,
			successOnly: false,
		});
		assert.equal(all.length, 1500);
		const some = await getJobResults(client, {
			jobId: job.job.id,
			simplify: true,
			includeCountryList: false,
			successOnly: false,
			limit: 7,
		});
		assert.equal(some.length, 7);
	});
});
