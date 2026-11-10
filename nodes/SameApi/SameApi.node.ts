import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError, sleep } from 'n8n-workflow';
import { createRequester, errorToJson, secondsToMs, toNodeError } from './execution';
import { SameApiClient } from './lib/client';
import { MAX_SINGLE_LOOKUP_ITEMS } from './lib/constants';
import { prepareDomains, splitDomainList } from './lib/domain';
import { SIMPLIFY_GROUPS, type SimplifyGroup } from './lib/normalize';
import { batchLookup } from './operations/batch';
import { getJob, getJobResults } from './operations/jobs';
import { getDomainTraffic } from './operations/traffic';
import { accountProperties } from './properties/account';
import { batchProperties } from './properties/batch';
import { domainProperties } from './properties/domain';
import { jobProperties } from './properties/job';

type Options = Record<string, unknown>;

/** The "Include Fields" option, reduced to the group names this node knows. */
function readIncludeFields(options: Options): SimplifyGroup[] {
	const chosen = Array.isArray(options.includeFields) ? options.includeFields : [];
	return SIMPLIFY_GROUPS.filter((group) => chosen.includes(group));
}

const asJson = (value: unknown): IDataObject => value as IDataObject;

export class SameApi implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'SameAPI',
		name: 'sameApi',
		icon: { light: 'file:sameapi.svg', dark: 'file:sameapi.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{ $parameter["resource"] + ": " + $parameter["operation"] }}',
		description: 'Get website traffic estimates, rankings and AI-assistant visits for any domain',
		defaults: { name: 'SameAPI' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'sameApiApi', required: true }],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Account', value: 'account' },
					{ name: 'Batch', value: 'batch' },
					{ name: 'Domain', value: 'domain' },
					{ name: 'Job', value: 'job' },
				],
				default: 'domain',
			},
			...domainProperties,
			...batchProperties,
			...jobProperties,
			...accountProperties,
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const client = new SameApiClient(createRequester(this), sleep);
		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;

		if (resource === 'batch') return [await runBatch(this, client)];
		if (resource === 'account') return [await runUsage(this, client)];

		const items = this.getInputData();
		if (resource === 'domain') guardItemCount(this, items.length);

		const output: INodeExecutionData[] = [];
		for (let i = 0; i < items.length; i += 1) {
			try {
				if (resource === 'domain' && operation === 'getTraffic') {
					const options = this.getNodeParameter('options', i, {}) as Options;
					const data = await getDomainTraffic(client, sleep, {
						domain: this.getNodeParameter('domain', i),
						simplify: this.getNodeParameter('simplify', i) as boolean,
						includeFields: readIncludeFields(options),
						includeCountryList: options.includeCountryList === true,
						removeWww: options.removeWww !== false,
						pollIntervalMs: secondsToMs(options.pollIntervalSeconds, 2),
						timeoutMs: secondsToMs(options.timeoutSeconds, 120),
					});
					output.push({ json: asJson(data), pairedItem: { item: i } });
				} else if (resource === 'job' && operation === 'get') {
					const job = await getJob(client, this.getNodeParameter('jobId', i));
					output.push({ json: asJson(job), pairedItem: { item: i } });
				} else if (resource === 'job' && operation === 'getResults') {
					const options = this.getNodeParameter('options', i, {}) as Options;
					const returnAll = this.getNodeParameter('returnAll', i) as boolean;
					const results = await getJobResults(client, {
						jobId: this.getNodeParameter('jobId', i),
						simplify: this.getNodeParameter('simplify', i) as boolean,
						includeFields: readIncludeFields(options),
						includeCountryList: options.includeCountryList === true,
						successOnly: options.successOnly === true,
						limit: returnAll ? undefined : (this.getNodeParameter('limit', i) as number),
					});
					for (const result of results) {
						output.push({ json: asJson(result.json), pairedItem: { item: i } });
					}
				} else {
					throw new NodeOperationError(this.getNode(), `Unknown operation: ${resource}/${operation}`, {
						itemIndex: i,
					});
				}
			} catch (error) {
				if (this.continueOnFail()) {
					output.push({ json: errorToJson(error), pairedItem: { item: i } });
					continue;
				}
				throw toNodeError(this.getNode(), error, i);
			}
		}
		return [output];
	}
}

/** Get Domain Traffic makes a job per item: stop early when the list is clearly a batch job. */
function guardItemCount(context: IExecuteFunctions, count: number): void {
	if (count <= MAX_SINGLE_LOOKUP_ITEMS) return;
	const options = context.getNodeParameter('options', 0, {}) as Options;
	if (options.allowManyItems === true) return;
	throw new NodeOperationError(
		context.getNode(),
		`Too many items for Get Traffic (${count})`,
		{
			description: `Get Traffic runs one lookup per item, one after the other (${MAX_SINGLE_LOOKUP_ITEMS} items is the default maximum). Use Batch → Look Up Domains for long lists, or turn on "Allow More Than ${MAX_SINGLE_LOOKUP_ITEMS} Items" in Options.`,
		},
	);
}

async function runUsage(context: IExecuteFunctions, client: SameApiClient): Promise<INodeExecutionData[]> {
	try {
		const usage = await client.getUsage();
		return [{ json: asJson(usage), pairedItem: { item: 0 } }];
	} catch (error) {
		if (context.continueOnFail()) return [{ json: errorToJson(error), pairedItem: { item: 0 } }];
		throw toNodeError(context.getNode(), error);
	}
}

async function runBatch(context: IExecuteFunctions, client: SameApiClient): Promise<INodeExecutionData[]> {
	try {
		const options = context.getNodeParameter('options', 0, {}) as Options;
		const source = context.getNodeParameter('domainSource', 0) as string;
		const entries =
			source === 'list'
				? splitDomainList(context.getNodeParameter('domainList', 0)).map((value, index) => ({
						value,
						sourceIndex: index,
					}))
				: context.getInputData().map((_, index) => ({
						value: context.getNodeParameter('domain', index),
						sourceIndex: index,
					}));
		const prepared = prepareDomains(entries, {
			removeWww: options.removeWww !== false,
			skipInvalid: options.skipInvalidDomains === true,
		});
		const wait = context.getNodeParameter('resultMode', 0) === 'wait';
		const returnAll = wait ? (context.getNodeParameter('returnAll', 0) as boolean) : true;

		const outcome = await batchLookup(client, sleep, {
			prepared,
			name: typeof options.batchName === 'string' ? options.batchName : undefined,
			webhookUrl: typeof options.webhookUrl === 'string' ? options.webhookUrl : undefined,
			webhookSecret: typeof options.webhookSecret === 'string' ? options.webhookSecret : undefined,
			wait,
			simplify: wait ? (context.getNodeParameter('simplify', 0) as boolean) : true,
			includeFields: readIncludeFields(options),
			includeCountryList: options.includeCountryList === true,
			successOnly: options.successOnly === true,
			limit: returnAll ? undefined : (context.getNodeParameter('limit', 0) as number),
			pollIntervalMs: secondsToMs(options.pollIntervalSeconds, 5),
			timeoutMs: secondsToMs(options.timeoutSeconds, 900),
		});

		if (outcome.skipped.length > 0) {
			context.addExecutionHints({
				message: `${outcome.skipped.length} invalid entries were skipped.`,
				type: 'info',
			});
		}
		if (outcome.job.warning) {
			context.addExecutionHints({ message: `SameAPI warning: ${outcome.job.warning}`, type: 'warning' });
		}

		if (!outcome.results) return [{ json: asJson(outcome.job) }];
		const indexByDomain = new Map(prepared.domains.map((d, k) => [d, prepared.sourceIndexes[k]]));
		return outcome.results.map((result) => {
			const index = indexByDomain.get(result.domain);
			return index === undefined || source === 'list'
				? { json: asJson(result.json) }
				: { json: asJson(result.json), pairedItem: { item: index } };
		});
	} catch (error) {
		if (context.continueOnFail()) return [{ json: errorToJson(error) }];
		throw toNodeError(context.getNode(), error);
	}
}
