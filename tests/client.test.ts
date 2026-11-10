/* eslint-disable @n8n/community-nodes/no-restricted-imports -- unit tests only: not part of the published package */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SameApiClient } from '../nodes/SameApi/lib/client';
import { extractApiMessage, SameApiError } from '../nodes/SameApi/lib/errors';
import { assertJobUsable, waitForJob } from '../nodes/SameApi/lib/polling';
import type { HttpResponse, RequestSpec } from '../nodes/SameApi/lib/types';
import { createFakeApi } from './fakeApi';

function recordingSleep() {
	const waits: number[] = [];
	return { waits, sleep: async (ms: number) => void waits.push(ms) };
}

function answers(...responses: Array<HttpResponse | Error>) {
	const calls: RequestSpec[] = [];
	const requester = async (spec: RequestSpec): Promise<HttpResponse> => {
		calls.push(spec);
		const next = responses.shift();
		if (!next) throw new Error('no more scripted answers');
		if (next instanceof Error) throw next;
		return next;
	};
	return { requester, calls };
}

const jobBody = { id: 'j1', status: 'pending', name: 'n', total_domains: 1 };
const reply = (statusCode: number, body: unknown, headers: Record<string, unknown> = {}): HttpResponse => ({
	statusCode,
	headers,
	body,
});

describe('error messages', () => {
	const cases: Array<[number, unknown, string, RegExp]> = [
		[401, { message: 'Not authenticated.' }, 'auth', /API key/],
		// The two 402 texts exactly as the backend code sends them (lookup.py and services/quota.py).
		[
			402,
			{
				message:
					'You have reached your monthly quota limit. Please upgrade your account to continue analyzing domains.',
			},
			'quota',
			/sameapi\.io\/pricing/,
		],
		[
			402,
			{
				message:
					'Your last payment failed and the 7-day grace period is over: update your card in Settings > Manage billing to continue. Contact billing@sameapi.io if you need help.',
			},
			'quota',
			/payment failed|update your card/,
		],
		[403, { message: 'API access requires Pro plan or higher' }, 'plan', /Pro plan or higher/],
		[403, { message: 'Verify your email first' }, 'plan', /Verify your email first/],
		[404, { message: 'Job not found' }, 'not_found', /Job not found/],
		[500, { message: 'Internal server error' }, 'server', /few minutes/],
	];
	for (const [status, body, kind, text] of cases) {
		it(`explains HTTP ${status} (${kind})`, async () => {
			const { requester } = answers(reply(status, body));
			const client = new SameApiClient(requester, async () => undefined);
			await assert.rejects(
				() => client.createLookup('example.com'),
				(error: unknown) => {
					assert.ok(error instanceof SameApiError);
					assert.equal(error.kind, kind);
					assert.equal(error.statusCode, status);
					assert.match(`${error.message} ${error.description}`, text);
					return true;
				},
			);
		});
	}

	it('reads every error body format', () => {
		assert.equal(extractApiMessage({ message: 'plain' }), 'plain');
		assert.equal(
			extractApiMessage({ detail: [{ loc: ['query', 'per_page'], msg: 'Input should be >= 1' }] }),
			'per_page: Input should be >= 1',
		);
		assert.equal(extractApiMessage({ message: { error: 'x', message: 'nested text' } }), 'nested text');
		assert.equal(extractApiMessage(undefined), '');
	});
});

describe('retries', () => {
	it('waits for Retry-After on 429 and then succeeds', async () => {
		const { requester, calls } = answers(
			reply(429, { message: 'Rate limit exceeded (global)' }, { 'retry-after': '2' }),
			reply(200, jobBody),
		);
		const { waits, sleep } = recordingSleep();
		const job = await new SameApiClient(requester, sleep).getJob('j1');
		assert.equal(job.id, 'j1');
		assert.equal(calls.length, 2);
		assert.deepEqual(waits, [2000]);
	});

	it('gives up after a few 429s instead of retrying forever', async () => {
		const tooMany = () => reply(429, { message: 'Rate limit exceeded' }, { 'retry-after': '1' });
		const { requester, calls } = answers(...Array.from({ length: 10 }, tooMany));
		const { sleep } = recordingSleep();
		await assert.rejects(
			() => new SameApiClient(requester, sleep).getJob('j1'),
			(error: unknown) => error instanceof SameApiError && error.kind === 'rate_limit',
		);
		assert.equal(calls.length, 6); // first try + 5 retries
	});

	it('never waits longer than the cap, whatever Retry-After says', async () => {
		const { requester } = answers(reply(429, {}, { 'retry-after': '9999' }), reply(200, jobBody));
		const { waits, sleep } = recordingSleep();
		await new SameApiClient(requester, sleep).getJob('j1');
		assert.deepEqual(waits, [30000]);
	});

	it('retries read-only calls after a server error', async () => {
		const { requester, calls } = answers(reply(503, {}), reply(200, jobBody));
		const { sleep } = recordingSleep();
		await new SameApiClient(requester, sleep).getJob('j1');
		assert.equal(calls.length, 2);
	});

	it('retries read-only calls after a network failure', async () => {
		const { requester, calls } = answers(new Error('ECONNRESET'), reply(200, jobBody));
		const { sleep } = recordingSleep();
		await new SameApiClient(requester, sleep).getJob('j1');
		assert.equal(calls.length, 2);
	});

	it('does NOT repeat a call that creates a job after a server error', async () => {
		const { requester, calls } = answers(reply(503, {}), reply(200, jobBody));
		const { sleep } = recordingSleep();
		await assert.rejects(() => new SameApiClient(requester, sleep).createLookup('example.com'), SameApiError);
		assert.equal(calls.length, 1);
	});

	it('does NOT repeat a batch creation after a network failure', async () => {
		const { requester, calls } = answers(new Error('socket hang up'), reply(201, jobBody));
		const { sleep } = recordingSleep();
		await assert.rejects(
			() => new SameApiClient(requester, sleep).createBatch({ domains: ['a.com'] }),
			(error: unknown) => error instanceof SameApiError && error.kind === 'network',
		);
		assert.equal(calls.length, 1);
	});

	it('does retry a job creation that was refused with 429 (nothing was created)', async () => {
		const { requester, calls } = answers(reply(429, {}, { 'retry-after': '1' }), reply(202, jobBody));
		const { sleep } = recordingSleep();
		await new SameApiClient(requester, sleep).createLookup('example.com');
		assert.equal(calls.length, 2);
	});
});

describe('request shapes', () => {
	it('sends the batch body with only the fields that are set', async () => {
		const { requester, calls } = answers(reply(201, jobBody));
		await new SameApiClient(requester, async () => undefined).createBatch({
			domains: ['a.com', 'b.com'],
			name: 'My batch',
			webhookUrl: 'https://example.com/hook',
		});
		assert.equal(calls[0].method, 'POST');
		assert.equal(calls[0].path, '/lookup/batch');
		assert.deepEqual(calls[0].body, {
			domains: ['a.com', 'b.com'],
			name: 'My batch',
			webhook_url: 'https://example.com/hook',
		});
	});

	it('caps the page size at 1000', async () => {
		const { requester, calls } = answers(reply(200, { items: [], total: 0 }));
		await new SameApiClient(requester, async () => undefined).getResultsPage('j1', {
			page: 1,
			perPage: 5000,
			view: 'table',
			successOnly: false,
		});
		assert.equal(calls[0].qs?.per_page, 1000);
		assert.equal(calls[0].qs?.view, 'table');
	});
});

describe('waitForJob', () => {
	it('checks until the job completes', async () => {
		const fake = createFakeApi({ processingPolls: 2 });
		const client = new SameApiClient(fake.requester, async () => undefined);
		const started = await client.createLookup('example.com');
		const { waits, sleep } = recordingSleep();
		const done = await waitForJob(client, started.id, { intervalMs: 2000, timeoutMs: 60000, sleep });
		assert.equal(done.status, 'completed');
		assert.deepEqual(waits, [2000, 2000, 2000]);
	});

	it('times out with the job ID in the message', async () => {
		const fake = createFakeApi({ processingPolls: 1000 });
		const client = new SameApiClient(fake.requester, async () => undefined);
		const started = await client.createLookup('example.com');
		let clock = 0;
		await assert.rejects(
			() =>
				waitForJob(client, started.id, {
					intervalMs: 2000,
					timeoutMs: 7000,
					sleep: async (ms) => void (clock += ms),
					now: () => clock,
				}),
			(error: unknown) => {
				assert.ok(error instanceof SameApiError);
				assert.equal(error.kind, 'timeout');
				assert.match(error.description, new RegExp(started.id));
				assert.match(error.description, /Get Job/);
				return true;
			},
		);
	});

	it('returns failed jobs and lets assertJobUsable explain them', async () => {
		for (const status of ['failed', 'failed_final', 'canceled']) {
			const fake = createFakeApi({ processingPolls: 0, finalStatus: status });
			const client = new SameApiClient(fake.requester, async () => undefined);
			const started = await client.createLookup('example.com');
			const done = await waitForJob(client, started.id, {
				intervalMs: 1,
				timeoutMs: 1000,
				sleep: async () => undefined,
			});
			assert.equal(done.status, status);
			assert.throws(() => assertJobUsable(done), SameApiError);
		}
	});
});
