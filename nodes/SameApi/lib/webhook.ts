import { createHmac } from 'crypto';

/**
 * SameAPI webhook helpers: signature check and payload shape.
 * SameAPI signs each delivery like this: header X-Webhook-Signature = "sha256=" + hex(HMAC-SHA256(
 * secret, "<X-Webhook-Timestamp>.<raw body>")). The timestamp is in Unix seconds.
 */

export type SignatureProblem = 'missing' | 'too_old' | 'mismatch';

export interface SignatureInput {
	secret: string;
	rawBody: string | Uint8Array | undefined;
	timestampHeader: string | undefined;
	signatureHeader: string | undefined;
	nowSeconds: number;
	toleranceSeconds: number;
}

/** Compare two strings without stopping at the first difference. */
function sameText(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let difference = 0;
	for (let i = 0; i < a.length; i += 1) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return difference === 0;
}

/** Returns undefined when the delivery is genuine and fresh, otherwise the reason it is not. */
export function checkSignature(input: SignatureInput): SignatureProblem | undefined {
	const { rawBody, timestampHeader, signatureHeader } = input;
	if (rawBody === undefined || !timestampHeader || !signatureHeader) return 'missing';
	const timestamp = Number(timestampHeader);
	if (!Number.isInteger(timestamp)) return 'missing';
	if (Math.abs(input.nowSeconds - timestamp) > input.toleranceSeconds) return 'too_old';

	const body = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : Buffer.from(rawBody);
	const expected =
		'sha256=' +
		createHmac('sha256', input.secret)
			.update(`${timestampHeader}.`)
			.update(body)
			.digest('hex');
	return sameText(expected, signatureHeader.trim()) ? undefined : 'mismatch';
}

export interface JobEvent {
	event: string | null;
	jobId: string | null;
	status: string | null;
	totalDomains: number | null;
	successfulDomains: number | null;
	failedDomains: number | null;
	createdAt: string | null;
	/** Set by job.completed. */
	completedAt: string | null;
	/** Set by job.failed. */
	failedAt: string | null;
	/** A fixed, plain-English reason, sent by job.failed. */
	error: string | null;
}

/** The events SameAPI sends. */
export const JOB_EVENTS = ['job.completed', 'job.failed'] as const;

/**
 * Whether a delivery should start the workflow. An empty choice means every event; an event
 * the payload does not name (strange input) is let through, as before events could be chosen.
 */
export function shouldStartWorkflow(event: string | null, selected: readonly string[]): boolean {
	if (selected.length === 0 || event === null) return true;
	return selected.includes(event);
}

function text(value: unknown): string | null {
	return typeof value === 'string' ? value : null;
}

function count(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** The webhook body as clean, camelCase fields. Unknown or missing fields become null. */
export function parseJobEvent(body: unknown): JobEvent {
	const data = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
	return {
		event: text(data.event),
		jobId: text(data.job_id),
		status: text(data.status),
		totalDomains: count(data.total_domains),
		successfulDomains: count(data.successful_domains),
		failedDomains: count(data.failed_domains),
		createdAt: text(data.created_at),
		completedAt: text(data.completed_at),
		failedAt: text(data.failed_at),
		error: text(data.error),
	};
}
