import { PRICING_URL } from './constants';

export type SameApiErrorKind =
	| 'auth'
	| 'quota'
	| 'plan'
	| 'not_found'
	| 'bad_request'
	| 'rate_limit'
	| 'server'
	| 'network'
	| 'partial'
	| 'timeout'
	| 'unexpected';

/** Anything that went wrong while talking to SameAPI. `description` is the longer help text. */
export class SameApiError extends Error {
	constructor(
		message: string,
		readonly kind: SameApiErrorKind,
		readonly description: string,
		readonly statusCode?: number,
		readonly apiBody?: unknown,
	) {
		super(message);
		this.name = 'SameApiError';
	}
}

/** The user's input is wrong (bad domain, too many domains...). Nothing was sent. */
export class InvalidInputError extends Error {
	constructor(
		message: string,
		readonly description: string = '',
	) {
		super(message);
		this.name = 'InvalidInputError';
	}
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** SameAPI errors come as {"message": "..."}, {"detail": [...]} (422) or {"message": {...}}. */
export function extractApiMessage(body: unknown): string {
	if (typeof body === 'string') return body.slice(0, 300);
	if (!isObject(body)) return '';
	const value = body.message ?? body.detail;
	if (typeof value === 'string') return value;
	if (Array.isArray(value)) {
		return value
			.map((entry) => {
				if (!isObject(entry) || typeof entry.msg !== 'string') return String(entry);
				const where = Array.isArray(entry.loc) ? entry.loc.slice(1).join('.') : '';
				return where ? `${where}: ${entry.msg}` : entry.msg;
			})
			.join('; ');
	}
	if (isObject(value)) {
		return typeof value.message === 'string' ? value.message : JSON.stringify(value);
	}
	return '';
}

function withApiText(help: string, apiMessage: string): string {
	return apiMessage ? `${help} SameAPI said: "${apiMessage}"` : help;
}

/** Turn an HTTP error answer into an error with a plain-English explanation. */
export function buildApiError(statusCode: number, body: unknown): SameApiError {
	const apiMessage = extractApiMessage(body);
	const lower = apiMessage.toLowerCase();

	if (statusCode === 401) {
		return new SameApiError(
			'SameAPI rejected the API key',
			'auth',
			withApiText(
				'Check the API key in your SameAPI credential. You can create a new key in the SameAPI dashboard under API Keys.',
				apiMessage,
			),
			statusCode,
			body,
		);
	}
	if (statusCode === 402) {
		return new SameApiError(
			'SameAPI quota used up or payment overdue',
			'quota',
			withApiText(
				`Your monthly request quota is used up, or a renewal payment failed. Upgrade your plan or turn on overage in the dashboard: ${PRICING_URL}.`,
				apiMessage,
			),
			statusCode,
			body,
		);
	}
	if (statusCode === 403 && lower.includes('pro plan')) {
		return new SameApiError(
			'Your SameAPI plan has no API access',
			'plan',
			`This node needs a Pro plan or higher (Basic accounts have no API access). See the plans at ${PRICING_URL}.`,
			statusCode,
			body,
		);
	}
	if (statusCode === 403) {
		return new SameApiError(
			'SameAPI refused the request',
			'plan',
			withApiText(
				'Check that your email address is verified and that your plan includes API access.',
				apiMessage,
			),
			statusCode,
			body,
		);
	}
	if (statusCode === 404) {
		return new SameApiError(
			'Not found',
			'not_found',
			withApiText(
				'The job does not exist, belongs to another account, or its results have expired.',
				apiMessage,
			),
			statusCode,
			body,
		);
	}
	if (statusCode === 429) {
		return new SameApiError(
			'SameAPI rate limit reached',
			'rate_limit',
			withApiText(
				'Too many requests, or too many jobs running at once. The node waited and retried several times without success. Lower the number of parallel workflows or use Batch Lookup for long lists.',
				apiMessage,
			),
			statusCode,
			body,
		);
	}
	if (statusCode >= 500) {
		return new SameApiError(
			'SameAPI is temporarily unavailable',
			'server',
			withApiText('Try again in a few minutes.', apiMessage),
			statusCode,
			body,
		);
	}
	return new SameApiError(
		'SameAPI rejected the request',
		'bad_request',
		withApiText('Check the values you entered.', apiMessage),
		statusCode,
		body,
	);
}
