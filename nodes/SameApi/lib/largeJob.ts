import type { SameApiClient } from './client';
import { MAX_DOMAINS_PER_REQUEST } from './constants';
import { SameApiError } from './errors';
import type { Job } from './types';

export interface LargeJobParams {
	prepared: { domains: string[] };
	name?: string;
	webhookUrl?: string;
	webhookSecret?: string;
}

function chunks<T>(list: T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
	return out;
}

async function uploadAll(client: SameApiClient, jobId: string, domains: string[]): Promise<void> {
	for (const part of chunks(domains, MAX_DOMAINS_PER_REQUEST)) {
		await client.uploadDomains(jobId, part);
	}
}

/** The draft was never started: tell the user which job it is and that nothing was billed. */
function explainUploadProblem(problem: unknown, draftId: string): unknown {
	if (!(problem instanceof SameApiError)) return problem;
	return new SameApiError(
		`Could not upload all the domains (draft job ${draftId})`,
		problem.kind,
		`The job was not started and nothing was billed. ${problem.description}`,
		problem.statusCode,
		problem.apiBody,
	);
}

/**
 * A job above the size of one call: draft, upload in calls of up to 10,000 domains, start.
 * The job stays one job. The size limit is the plan (checked by SameAPI when the job starts).
 */
export async function startLargeJob(client: SameApiClient, params: LargeJobParams): Promise<Job> {
	const draft = await client.createDraft({
		name: params.name || `n8n batch ${new Date().toISOString()}`,
		webhookUrl: params.webhookUrl,
		webhookSecret: params.webhookSecret,
	});
	const uploadProblem = await uploadAll(client, draft.id, params.prepared.domains).then(
		() => undefined,
		(error: unknown) => error,
	);
	if (uploadProblem !== undefined) throw explainUploadProblem(uploadProblem, draft.id);
	return client.finalizeJob(draft.id);
}
