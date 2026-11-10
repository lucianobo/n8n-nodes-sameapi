import {
	MAX_RATE_LIMIT_RETRIES,
	MAX_RESULTS_PER_PAGE,
	MAX_RETRY_WAIT_MS,
	MAX_TRANSIENT_RETRIES,
} from './constants';
import { buildApiError, SameApiError } from './errors';
import { parseJob, parseResultsPage, parseUsage } from './normalize';
import type {
	HttpResponse,
	Job,
	JsonObject,
	Requester,
	RequestSpec,
	ResultsPage,
	ResultsView,
	Sleeper,
	Usage,
} from './types';

function retryAfterMs(headers: Record<string, unknown>, attempt: number): number {
	const header = headers['retry-after'] ?? headers['Retry-After'];
	const seconds = typeof header === 'string' || typeof header === 'number' ? Number(header) : NaN;
	const base = Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : 1000;
	// Never shorter than a growing floor, never longer than the cap: no endless waiting.
	return Math.min(MAX_RETRY_WAIT_MS, Math.max(base, 1000 * attempt));
}

function describeNetworkProblem(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * Typed access to the SameAPI endpoints. Handles the answers that need a second try:
 * 429 (waits as told by Retry-After, up to a few times) and, for read-only calls, 5xx and
 * network failures. Calls that create a job are never repeated after a server error, so a
 * retry can never bill the same lookup twice.
 */
export class SameApiClient {
	constructor(
		private readonly requester: Requester,
		private readonly sleep: Sleeper,
	) {}

	private async request(spec: RequestSpec): Promise<unknown> {
		let rateLimitRetries = 0;
		let transientRetries = 0;
		for (;;) {
			let response: HttpResponse | undefined;
			let networkProblem: unknown;
			try {
				response = await this.requester(spec);
			} catch (error) {
				networkProblem = error;
			}
			if (response === undefined) {
				if (spec.idempotent && transientRetries < MAX_TRANSIENT_RETRIES) {
					transientRetries += 1;
					await this.sleep(1000 * transientRetries);
					continue;
				}
				throw new SameApiError(
					'Could not reach SameAPI',
					'network',
					`The request failed before an answer arrived: ${describeNetworkProblem(networkProblem)}`,
				);
			}

			if (response.statusCode >= 200 && response.statusCode < 300) return response.body;

			if (response.statusCode === 429 && rateLimitRetries < MAX_RATE_LIMIT_RETRIES) {
				rateLimitRetries += 1;
				await this.sleep(retryAfterMs(response.headers, rateLimitRetries));
				continue;
			}
			if (response.statusCode >= 500 && spec.idempotent && transientRetries < MAX_TRANSIENT_RETRIES) {
				transientRetries += 1;
				await this.sleep(1000 * transientRetries);
				continue;
			}
			throw buildApiError(response.statusCode, response.body);
		}
	}

	async getUsage(): Promise<Usage> {
		return parseUsage(await this.request({ method: 'GET', path: '/usage', idempotent: true }));
	}

	/** Starts a one-domain job. Not repeated on server errors (see class comment). */
	async createLookup(domain: string): Promise<Job> {
		const body = await this.request({
			method: 'GET',
			path: `/lookup/${encodeURIComponent(domain)}`,
			idempotent: false,
		});
		return parseJob(body);
	}

	async createBatch(input: {
		domains: string[];
		name?: string;
		webhookUrl?: string;
		webhookSecret?: string;
	}): Promise<Job> {
		const body: JsonObject = { domains: input.domains };
		if (input.name) body.name = input.name;
		if (input.webhookUrl) body.webhook_url = input.webhookUrl;
		if (input.webhookSecret) body.webhook_secret = input.webhookSecret;
		return parseJob(
			await this.request({ method: 'POST', path: '/lookup/batch', body, idempotent: false }),
		);
	}

	async getJob(jobId: string): Promise<Job> {
		return parseJob(
			await this.request({
				method: 'GET',
				path: `/jobs/${encodeURIComponent(jobId)}`,
				idempotent: true,
			}),
		);
	}

	async getResultsPage(
		jobId: string,
		options: { page: number; perPage: number; view: ResultsView; successOnly: boolean },
	): Promise<ResultsPage> {
		return parseResultsPage(
			await this.request({
				method: 'GET',
				path: `/jobs/${encodeURIComponent(jobId)}/results`,
				qs: {
					page: options.page,
					per_page: Math.min(options.perPage, MAX_RESULTS_PER_PAGE),
					view: options.view,
					success_only: options.successOnly ? true : undefined,
				},
				idempotent: true,
			}),
		);
	}
}
