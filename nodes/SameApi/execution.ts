import type { IDataObject, IExecuteFunctions, INode, JsonObject } from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';
import { BASE_URL } from './lib/constants';
import { InvalidInputError, SameApiError } from './lib/errors';
import type { HttpResponse, Requester } from './lib/types';

const REQUEST_TIMEOUT_MS = 60_000;

/** Connects the n8n HTTP helper (which adds the API key) to the SameAPI client. */
export function createRequester(context: IExecuteFunctions): Requester {
	return async (spec): Promise<HttpResponse> => {
		const response = (await context.helpers.httpRequestWithAuthentication.call(
			context,
			'sameApiApi',
			{
				method: spec.method,
				url: `${BASE_URL}${spec.path}`,
				qs: spec.qs,
				body: spec.body,
				json: true,
				returnFullResponse: true,
				ignoreHttpStatusErrors: true,
				timeout: REQUEST_TIMEOUT_MS,
				headers: { Accept: 'application/json', 'User-Agent': 'n8n-nodes-sameapi' },
			},
		)) as { statusCode: number; headers: Record<string, unknown>; body: unknown };
		return { statusCode: response.statusCode, headers: response.headers, body: response.body };
	};
}

/** Wrap our own errors in the n8n error types so the UI shows message and help text. */
export function toNodeError(node: INode, error: unknown, itemIndex?: number): Error {
	if (error instanceof SameApiError) {
		if (error.statusCode !== undefined) {
			return new NodeApiError(
				node,
				{ message: error.message, httpCode: String(error.statusCode) } as JsonObject,
				{
					message: error.message,
					description: error.description,
					httpCode: String(error.statusCode),
					itemIndex,
				},
			);
		}
		return new NodeOperationError(node, error.message, {
			description: error.description,
			itemIndex,
		});
	}
	if (error instanceof InvalidInputError) {
		return new NodeOperationError(node, error.message, {
			description: error.description,
			itemIndex,
		});
	}
	if (error instanceof NodeApiError || error instanceof NodeOperationError) return error;
	return new NodeOperationError(node, error instanceof Error ? error : new Error(String(error)), {
		itemIndex,
	});
}

/** What "Continue on Fail" puts in the output instead of stopping the workflow. */
export function errorToJson(error: unknown): IDataObject {
	if (error instanceof SameApiError) {
		return {
			error: error.message,
			description: error.description,
			...(error.statusCode !== undefined ? { statusCode: error.statusCode } : {}),
		};
	}
	if (error instanceof InvalidInputError) {
		return { error: error.message, description: error.description };
	}
	return { error: error instanceof Error ? error.message : String(error) };
}

export function secondsToMs(value: unknown, fallbackSeconds: number): number {
	const seconds = typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallbackSeconds;
	return Math.round(seconds * 1000);
}
