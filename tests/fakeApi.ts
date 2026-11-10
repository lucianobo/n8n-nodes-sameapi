import type { HttpResponse, JsonObject, RequestSpec } from '../nodes/SameApi/lib/types';

/** A small in-memory SameAPI. It answers like the real one (shapes recorded on 10 Nov 2026). */

export interface FakeOptions {
	/** How many status checks a job answers "processing" before it completes. */
	processingPolls?: number;
	/** Answer these statuses to the next calls, in order, before behaving normally. */
	scriptedStatuses?: Array<{ statusCode: number; headers?: Record<string, unknown>; body?: unknown }>;
	/** Result item used for every domain. */
	rawData?: JsonObject;
	/** Domains that fail inside the job. */
	failingDomains?: string[];
	finalStatus?: string;
}

export interface FakeApi {
	requester: (spec: RequestSpec) => Promise<HttpResponse>;
	calls: RequestSpec[];
}

const ok = (body: unknown, statusCode = 200): HttpResponse => ({ statusCode, headers: {}, body });

export function createFakeApi(options: FakeOptions = {}): FakeApi {
	const calls: RequestSpec[] = [];
	const scripted = [...(options.scriptedStatuses ?? [])];
	const jobs = new Map<string, { domains: string[]; polls: number }>();
	let counter = 0;

	const jobBody = (id: string, status: string): JsonObject => {
		const job = jobs.get(id);
		const total = job?.domains.length ?? 0;
		return {
			id,
			user_id: 'u1',
			name: `Job ${id}`,
			status,
			total_domains: total,
			processed_domains: status === 'completed' ? total : 0,
			successful_domains: status === 'completed' ? total : 0,
			failed_domains: 0,
			dropped_domain_count: 0,
			warning_message: null,
			created_at: '2026-11-10T12:00:00Z',
			started_at: null,
			completed_at: null,
		};
	};

	const requester = async (spec: RequestSpec): Promise<HttpResponse> => {
		calls.push(spec);
		const next = scripted.shift();
		if (next) return { statusCode: next.statusCode, headers: next.headers ?? {}, body: next.body ?? {} };

		if (spec.path === '/usage') {
			return ok({
				plan: 'pro',
				quota: { monthly_limit: 10000, used: 10, remaining: 9990 },
				rate_limits: { requests_per_second: 10, concurrent_jobs: 5, max_inflight: 50 },
			});
		}
		if (spec.path.startsWith('/lookup/batch')) {
			const domains = (spec.body?.domains as string[]) ?? [];
			const id = `job-${(counter += 1)}`;
			jobs.set(id, { domains, polls: 0 });
			return ok(jobBody(id, 'pending'), 201);
		}
		if (spec.path.startsWith('/lookup/')) {
			const id = `job-${(counter += 1)}`;
			jobs.set(id, { domains: [decodeURIComponent(spec.path.slice('/lookup/'.length))], polls: 0 });
			return ok(jobBody(id, 'pending'), 202);
		}
		const resultsMatch = /^\/jobs\/([^/]+)\/results$/.exec(spec.path);
		if (resultsMatch) {
			const job = jobs.get(resultsMatch[1]);
			if (!job) return { statusCode: 404, headers: {}, body: { message: 'Job not found' } };
			const perPage = Number(spec.qs?.per_page ?? 100);
			const page = Number(spec.qs?.page ?? 1);
			const all = job.domains.map((domain) => ({
				id: `r-${domain}`,
				domain,
				success: !(options.failingDomains ?? []).includes(domain),
				title: domain,
				country: '',
				raw_data: (options.failingDomains ?? []).includes(domain)
					? { error: 'boom' }
					: (options.rawData ?? {}),
				error_message: (options.failingDomains ?? []).includes(domain) ? 'boom' : null,
				processed_at: '2026-11-10T12:00:03Z',
			}));
			const filtered = spec.qs?.success_only ? all.filter((item) => item.success) : all;
			return ok({ items: filtered.slice((page - 1) * perPage, page * perPage), total: filtered.length });
		}
		const jobMatch = /^\/jobs\/([^/]+)$/.exec(spec.path);
		if (jobMatch) {
			const job = jobs.get(jobMatch[1]);
			if (!job) return { statusCode: 404, headers: {}, body: { message: 'Job not found' } };
			job.polls += 1;
			const waiting = job.polls <= (options.processingPolls ?? 1);
			return ok(jobBody(jobMatch[1], waiting ? 'processing' : (options.finalStatus ?? 'completed')));
		}
		return { statusCode: 404, headers: {}, body: { message: 'Not Found' } };
	};
	return { requester, calls };
}
