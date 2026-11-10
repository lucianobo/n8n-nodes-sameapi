import type { SameApiClient } from './client';
import { FAILED_JOB_STATUSES, TERMINAL_JOB_STATUSES } from './constants';
import { SameApiError } from './errors';
import type { Job, Sleeper } from './types';

export interface WaitOptions {
	intervalMs: number;
	timeoutMs: number;
	sleep: Sleeper;
	now?: () => number;
}

export function isTerminal(status: string): boolean {
	return TERMINAL_JOB_STATUSES.includes(status);
}

/**
 * Check the job every `intervalMs` until it reaches a final state. Gives up after `timeoutMs`
 * with an error that names the job, so the user can pick it up later with Get Job.
 * Returns the job in its final state (completed, failed, failed_final or canceled).
 */
export async function waitForJob(
	client: SameApiClient,
	jobId: string,
	options: WaitOptions,
): Promise<Job> {
	const now = options.now ?? Date.now;
	const startedAt = now();
	let last: Job | undefined;
	for (;;) {
		const elapsed = now() - startedAt;
		if (elapsed >= options.timeoutMs) {
			throw new SameApiError(
				'Timed out waiting for the SameAPI job',
				'timeout',
				`Job ${jobId} was still "${last?.status ?? 'pending'}" after ${Math.round(options.timeoutMs / 1000)} seconds. ` +
					'It keeps running on SameAPI: use the Get Job and Get Job Results operations with this job ID later, or raise the timeout.',
			);
		}
		await options.sleep(Math.min(options.intervalMs, options.timeoutMs - elapsed));
		last = await client.getJob(jobId);
		if (isTerminal(last.status)) return last;
	}
}

/** Throws when a finished job produced no usable results. */
export function assertJobUsable(job: Job): void {
	if (!FAILED_JOB_STATUSES.includes(job.status)) return;
	throw new SameApiError(
		`The SameAPI job ${job.status === 'canceled' || job.status === 'cancelled' ? 'was canceled' : 'failed'}`,
		'unexpected',
		`Job ${job.id} ended with status "${job.status}". Nothing was returned. Try again, and contact SameAPI support if it keeps failing.`,
	);
}
