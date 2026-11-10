/* eslint-disable @n8n/community-nodes/no-restricted-imports -- unit tests only: not part of the published package */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkSignature, parseJobEvent, shouldStartWorkflow } from '../nodes/SameApi/lib/webhook';

// Produced by the backend's own signing code (app/services/webhook_security.py), 10 Nov 2026.
const vector = {
	body: '{"completed_at":"2026-11-10T13:05:41.100000+00:00","created_at":"2026-11-10T13:05:36.676832+00:00","event":"job.completed","failed_domains":0,"job_id":"be40aaf8-e658-4d66-8622-d47ced04029f","status":"completed","successful_domains":2,"total_domains":2}',
	secret: 'test-secret-123',
	timestamp: 1794315900,
	signature: 'sha256=f435cbd5dc27f2d7943648ed74d25576b25a44bbbfe8a43fc11df3432ed35adf',
};

const base = {
	secret: vector.secret,
	rawBody: vector.body,
	timestampHeader: String(vector.timestamp),
	signatureHeader: vector.signature,
	nowSeconds: vector.timestamp + 5,
	toleranceSeconds: 300,
};

describe('checkSignature', () => {
	it('accepts a genuine delivery signed by the real backend code', () => {
		assert.equal(checkSignature(base), undefined);
	});
	it('accepts the body as bytes too', () => {
		assert.equal(checkSignature({ ...base, rawBody: Buffer.from(vector.body) }), undefined);
	});
	it('rejects a wrong secret', () => {
		assert.equal(checkSignature({ ...base, secret: 'other' }), 'mismatch');
	});
	it('rejects a changed body', () => {
		assert.equal(checkSignature({ ...base, rawBody: vector.body.replace('completed', 'failed__') }), 'mismatch');
	});
	it('rejects an old delivery (replay)', () => {
		assert.equal(checkSignature({ ...base, nowSeconds: vector.timestamp + 301 }), 'too_old');
		assert.equal(checkSignature({ ...base, nowSeconds: vector.timestamp - 301 }), 'too_old');
	});
	it('rejects missing or malformed headers and a missing body', () => {
		assert.equal(checkSignature({ ...base, signatureHeader: undefined }), 'missing');
		assert.equal(checkSignature({ ...base, timestampHeader: undefined }), 'missing');
		assert.equal(checkSignature({ ...base, timestampHeader: 'abc' }), 'missing');
		assert.equal(checkSignature({ ...base, rawBody: undefined }), 'missing');
	});
	it('rejects a signature of the wrong length', () => {
		assert.equal(checkSignature({ ...base, signatureHeader: 'sha256=abc' }), 'mismatch');
	});
});

describe('parseJobEvent', () => {
	it('reads the job.completed payload', () => {
		assert.deepEqual(parseJobEvent(JSON.parse(vector.body)), {
			event: 'job.completed',
			jobId: 'be40aaf8-e658-4d66-8622-d47ced04029f',
			status: 'completed',
			totalDomains: 2,
			successfulDomains: 2,
			failedDomains: 0,
			createdAt: '2026-11-10T13:05:36.676832+00:00',
			completedAt: '2026-11-10T13:05:41.100000+00:00',
			failedAt: null,
			error: null,
		});
	});
	it('reads the job.failed payload (as built by the backend code, not yet recorded from a real delivery)', () => {
		const failed = parseJobEvent({
			event: 'job.failed',
			job_id: 'j-1',
			status: 'failed',
			total_domains: 10,
			successful_domains: 0,
			failed_domains: 0,
			created_at: '2026-11-10T13:00:00+00:00',
			failed_at: '2026-11-10T13:01:00+00:00',
			error: 'The job could not be processed. Please create it again or contact support.',
		});
		assert.equal(failed.event, 'job.failed');
		assert.equal(failed.status, 'failed');
		assert.equal(failed.failedAt, '2026-11-10T13:01:00+00:00');
		assert.equal(failed.completedAt, null);
		assert.match(failed.error ?? '', /could not be processed/);
	});
	it('does not break on strange input', () => {
		assert.equal(parseJobEvent(null).jobId, null);
		assert.equal(parseJobEvent('x').event, null);
		assert.equal(parseJobEvent({ total_domains: 'two' }).totalDomains, null);
	});
});

describe('shouldStartWorkflow', () => {
	it('starts only for the chosen events', () => {
		assert.equal(shouldStartWorkflow('job.completed', ['job.completed']), true);
		assert.equal(shouldStartWorkflow('job.failed', ['job.completed']), false);
		assert.equal(shouldStartWorkflow('job.failed', ['job.completed', 'job.failed']), true);
	});
	it('treats an empty choice as every event', () => {
		assert.equal(shouldStartWorkflow('job.failed', []), true);
	});
	it('lets a payload without an event name through', () => {
		assert.equal(shouldStartWorkflow(null, ['job.completed']), true);
	});
	it('ignores an event it does not know when a choice is made', () => {
		assert.equal(shouldStartWorkflow('job.canceled', ['job.completed', 'job.failed']), false);
	});
});
