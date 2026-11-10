export const BASE_URL = 'https://sameapi.io/api/v1';
export const PRICING_URL = 'https://sameapi.io/pricing?utm_source=n8n';
export const DOCS_URL = 'https://sameapi.io/docs?utm_source=n8n';

/** A job in one of these states will not change any more. */
export const TERMINAL_JOB_STATUSES: readonly string[] = [
	'completed',
	'failed',
	'failed_final',
	'canceled',
	'cancelled',
];

/** Terminal states that mean "no usable results". */
export const FAILED_JOB_STATUSES: readonly string[] = [
	'failed',
	'failed_final',
	'canceled',
	'cancelled',
];

/** One API call carries at most this many domains. A bigger job is uploaded in several calls. */
export const MAX_DOMAINS_PER_REQUEST = 10_000;
export const MAX_RESULTS_PER_PAGE = 1000;

/** Get Domain Traffic makes one job per input item: above this, point users to Batch Lookup. */
export const MAX_SINGLE_LOOKUP_ITEMS = 50;

export const MAX_RATE_LIMIT_RETRIES = 5;
export const MAX_TRANSIENT_RETRIES = 2;
export const MAX_RETRY_WAIT_MS = 30_000;
