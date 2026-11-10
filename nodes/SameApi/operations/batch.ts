import type { SameApiClient } from '../lib/client';
import { MAX_DOMAINS_PER_REQUEST } from '../lib/constants';
import { startLargeJob } from '../lib/largeJob';
import type { PreparedDomains } from '../lib/domain';
import { InvalidInputError } from '../lib/errors';
import { formatResultItem, type SimplifyGroup } from '../lib/normalize';
import { assertJobUsable, waitForJob } from '../lib/polling';
import { collectResults } from '../lib/results';
import type { Job, Sleeper } from '../lib/types';

export interface BatchParams {
	prepared: PreparedDomains;
	name?: string;
	webhookUrl?: string;
	webhookSecret?: string;
	/** true: wait for the job and return the results; false: return the job right away. */
	wait: boolean;
	simplify: boolean;
	includeFields?: readonly SimplifyGroup[];
	includeCountryList: boolean;
	successOnly: boolean;
	/** undefined = all results. */
	limit?: number;
	pollIntervalMs: number;
	timeoutMs: number;
}

export interface BatchOutcome {
	job: Job;
	/** Present only when the node waited for the results. */
	results?: Array<{ domain: string; json: unknown }>;
	skipped: PreparedDomains['skipped'];
}

function checkNotEmpty(domains: string[]): void {
	if (domains.length === 0) {
		throw new InvalidInputError(
			'There are no valid domains to look up',
			'Add at least one domain, or check the field that holds them.',
		);
	}
}

/** Batch Lookup: one job for the whole list, however long (up to what the plan allows). */
export async function batchLookup(
	client: SameApiClient,
	sleep: Sleeper,
	params: BatchParams,
): Promise<BatchOutcome> {
	checkNotEmpty(params.prepared.domains);

	const started =
		params.prepared.domains.length > MAX_DOMAINS_PER_REQUEST
			? await startLargeJob(client, params)
			: await client.createBatch({
					domains: params.prepared.domains,
					name: params.name,
					webhookUrl: params.webhookUrl,
					webhookSecret: params.webhookSecret,
				});
	if (!params.wait) return { job: started, skipped: params.prepared.skipped };

	const finished = await waitForJob(client, started.id, {
		intervalMs: params.pollIntervalMs,
		timeoutMs: params.timeoutMs,
		sleep,
	});
	assertJobUsable(finished);

	const results = await collectResults(client, finished.id, {
		limit: params.limit,
		successOnly: params.successOnly,
		view: params.includeCountryList && !params.simplify ? 'full' : 'table',
		map: (item) => ({ domain: item.domain, json: formatResultItem(item, params.simplify, params.includeFields) }),
	});
	return { job: finished, results, skipped: params.prepared.skipped };
}
