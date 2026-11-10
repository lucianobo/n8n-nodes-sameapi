import type { SameApiClient } from '../lib/client';
import { InvalidInputError } from '../lib/errors';
import { formatResultItem, type SimplifyGroup } from '../lib/normalize';
import { collectResults } from '../lib/results';
import type { Job } from '../lib/types';

function requireJobId(jobId: unknown): string {
	if (typeof jobId !== 'string' || jobId.trim() === '') {
		throw new InvalidInputError('The job ID is empty', 'Paste the job ID returned by Batch Lookup.');
	}
	return jobId.trim();
}

export async function getJob(client: SameApiClient, jobId: unknown): Promise<Job> {
	return client.getJob(requireJobId(jobId));
}

export interface JobResultsParams {
	jobId: unknown;
	simplify: boolean;
	includeFields?: readonly SimplifyGroup[];
	includeCountryList: boolean;
	successOnly: boolean;
	/** undefined = all results. */
	limit?: number;
}

export async function getJobResults(
	client: SameApiClient,
	params: JobResultsParams,
): Promise<Array<{ domain: string; json: unknown }>> {
	return collectResults(client, requireJobId(params.jobId), {
		limit: params.limit,
		successOnly: params.successOnly,
		view: params.includeCountryList && !params.simplify ? 'full' : 'table',
		map: (item) => ({ domain: item.domain, json: formatResultItem(item, params.simplify, params.includeFields) }),
	});
}
