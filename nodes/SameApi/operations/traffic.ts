import type { SameApiClient } from '../lib/client';
import { normalizeDomain } from '../lib/domain';
import { SameApiError } from '../lib/errors';
import { explainFailure, formatResultItem, type SimplifyGroup } from '../lib/normalize';
import { assertJobUsable, waitForJob } from '../lib/polling';
import type { Sleeper } from '../lib/types';

export interface TrafficParams {
	domain: unknown;
	simplify: boolean;
	includeFields?: readonly SimplifyGroup[];
	includeCountryList: boolean;
	removeWww: boolean;
	pollIntervalMs: number;
	timeoutMs: number;
}

/**
 * Get Domain Traffic: start the lookup, wait for it, return the data.
 * The user never sees the job.
 */
export async function getDomainTraffic(
	client: SameApiClient,
	sleep: Sleeper,
	params: TrafficParams,
): Promise<unknown> {
	const domain = normalizeDomain(params.domain, { removeWww: params.removeWww });

	const started = await client.createLookup(domain);
	const finished = await waitForJob(client, started.id, {
		intervalMs: params.pollIntervalMs,
		timeoutMs: params.timeoutMs,
		sleep,
	});
	assertJobUsable(finished);

	const page = await client.getResultsPage(finished.id, {
		page: 1,
		perPage: 10,
		view: params.includeCountryList && !params.simplify ? 'full' : 'table',
		successOnly: false,
	});
	const item = page.items.find((entry) => entry.domain === domain) ?? page.items[0];
	if (!item) {
		throw new SameApiError(
			'SameAPI returned no data for this domain',
			'unexpected',
			`Job ${finished.id} finished but has no result for "${domain}".`,
		);
	}
	if (!item.success) {
		throw new SameApiError(
			`SameAPI could not process "${domain}"`,
			'unexpected',
			item.error_message
				? `${explainFailure(item.error_message)} (SameAPI said: "${item.error_message}")`
				: 'No reason was given.',
		);
	}
	return formatResultItem(item, params.simplify, params.includeFields);
}
