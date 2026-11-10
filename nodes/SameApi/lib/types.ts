/** Shapes shared by the HTTP layer, the normalizers and the operations. No n8n imports here. */

export type JsonObject = Record<string, unknown>;

export interface RequestSpec {
	method: 'GET' | 'POST';
	path: string;
	qs?: Record<string, string | number | boolean | undefined>;
	body?: JsonObject;
	/** Safe to repeat after a server error or a network failure (read-only calls). */
	idempotent: boolean;
}

export interface HttpResponse {
	statusCode: number;
	headers: Record<string, unknown>;
	body: unknown;
}

/** Sends one HTTP request. The node supplies an n8n-backed one, tests supply a fake. */
export type Requester = (spec: RequestSpec) => Promise<HttpResponse>;

export type Sleeper = (ms: number) => Promise<void>;

export type ResultsView = 'full' | 'table';

export interface Job {
	id: string;
	name: string;
	status: string;
	totalDomains: number;
	processedDomains: number;
	successfulDomains: number;
	failedDomains: number;
	droppedDomainCount: number;
	warning: string | null;
	createdAt: string | null;
	startedAt: string | null;
	completedAt: string | null;
}

/** One item of GET /jobs/{id}/results, as the API returns it. */
export interface RawResultItem {
	id?: string;
	domain: string;
	success: boolean;
	title?: string | null;
	country?: string | null;
	raw_data?: JsonObject | null;
	error_message?: string | null;
	processed_at?: string | null;
}

export interface ResultsPage {
	items: RawResultItem[];
	total: number;
}

export interface Usage {
	plan: string;
	monthlyLimit: number;
	used: number;
	remaining: number;
	requestsPerSecond: number | null;
	concurrentJobs: number | null;
	maxInflight: number | null;
}
