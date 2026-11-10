import type { SameApiClient } from './client';
import { MAX_RESULTS_PER_PAGE } from './constants';
import type { RawResultItem, ResultsView } from './types';

export interface CollectOptions<T> {
	/** Stop after this many results; undefined means all of them. */
	limit?: number;
	successOnly: boolean;
	view: ResultsView;
	/** Applied to each item as soon as its page arrives, so raw pages are not kept in memory. */
	map: (item: RawResultItem) => T;
}

/** Read a job's results page by page (1,000 per call) until all, or `limit`, are collected. */
export async function collectResults<T>(
	client: SameApiClient,
	jobId: string,
	options: CollectOptions<T>,
): Promise<T[]> {
	const out: T[] = [];
	const limit = options.limit ?? Number.POSITIVE_INFINITY;
	const perPage = Math.min(MAX_RESULTS_PER_PAGE, Number.isFinite(limit) ? limit : MAX_RESULTS_PER_PAGE);
	let fetched = 0;

	for (let page = 1; out.length < limit; page += 1) {
		const result = await client.getResultsPage(jobId, {
			page,
			perPage,
			view: options.view,
			successOnly: options.successOnly,
		});
		for (const item of result.items) {
			if (out.length >= limit) break;
			out.push(options.map(item));
		}
		fetched += result.items.length;
		if (result.items.length === 0 || fetched >= result.total) break;
	}
	return out;
}
