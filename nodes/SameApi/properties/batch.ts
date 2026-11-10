import type { INodeProperties } from 'n8n-workflow';

import { includeFieldsOption } from './shared';

const show = { resource: ['batch'], operation: ['lookup'] };
const showWait = { resource: ['batch'], operation: ['lookup'], resultMode: ['wait'] };

export const batchProperties: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['batch'] } },
		options: [
			{
				name: 'Look Up Domains',
				value: 'lookup',
				description: 'Look up many domains in one job. A long list is uploaded in several calls of 10,000 and stays one job.',
				action: 'Look up many domains in a batch',
			},
		],
		default: 'lookup',
	},
	{
		displayName: 'Domains From',
		name: 'domainSource',
		type: 'options',
		default: 'items',
		displayOptions: { show },
		options: [
			{
				name: 'Each Input Item',
				value: 'items',
				description: 'Read one domain from every incoming item (for example, rows of a spreadsheet)',
			},
			{
				name: 'Pasted List',
				value: 'list',
				description: 'Type or paste a list of domains separated by commas, spaces or new lines',
			},
		],
	},
	{
		displayName: 'Domain',
		name: 'domain',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. {{ $json.domain }}',
		displayOptions: { show: { ...show, domainSource: ['items'] } },
		description: 'The domain of each input item. Map the field that holds it.',
	},
	{
		displayName: 'Domain List',
		name: 'domainList',
		type: 'string',
		required: true,
		default: '',
		typeOptions: { rows: 5 },
		placeholder: 'e.g. example.com, example.org',
		displayOptions: { show: { ...show, domainSource: ['list'] } },
		description: 'Domains separated by commas, spaces or new lines. Duplicates are removed.',
	},
	{
		displayName: 'Result',
		name: 'resultMode',
		type: 'options',
		default: 'wait',
		displayOptions: { show },
		options: [
			{
				name: 'Wait for Results',
				value: 'wait',
				description: 'Wait until the job is done, then return one item per domain',
			},
			{
				name: 'Return Job Immediately',
				value: 'start',
				description:
					'Return the job ID at once. Continue later with Get Job Results, or add a webhook in Options to be told when it ends.',
			},
		],
	},
	{
		displayName: 'Simplify',
		name: 'simplify',
		type: 'boolean',
		default: true,
		displayOptions: { show: showWait },
		description: 'Whether to return a clean summary grouped by topic per domain instead of the full SameAPI response',
	},
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: true,
		displayOptions: { show: showWait },
		description: 'Whether to return all results or only up to a given limit',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 50,
		displayOptions: { show: { ...showWait, returnAll: [false] } },
		description: 'Max number of results to return',
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show },
		options: [
			{
				displayName: 'Batch Name',
				name: 'batchName',
				type: 'string',
				default: '',
				placeholder: 'e.g. Competitor list May',
				description: 'A name to recognize the job in your SameAPI dashboard',
			},
			{
				displayName: 'Include Country List',
				name: 'includeCountryList',
				type: 'boolean',
				default: false,
				description:
					'Whether to keep the long reference list of 252 countries in the full response. Only applies when Wait for Results is on and Simplify is off.',
			},
			includeFieldsOption,
			{
				displayName: 'Only Successful Results',
				name: 'successOnly',
				type: 'boolean',
				default: false,
				description: 'Whether to leave out the domains SameAPI could not process',
			},
			{
				displayName: 'Polling Interval (Seconds)',
				name: 'pollIntervalSeconds',
				type: 'number',
				typeOptions: { minValue: 1, maxValue: 60 },
				default: 5,
				description: 'How often to ask SameAPI whether the job is finished. Only used when waiting.',
			},
			{
				displayName: 'Remove "www."',
				name: 'removeWww',
				type: 'boolean',
				default: true,
				description: 'Whether to remove a leading "www." from each domain',
			},
			{
				displayName: 'Skip Invalid Domains',
				name: 'skipInvalidDomains',
				type: 'boolean',
				default: false,
				description:
					'Whether to leave out entries that are not valid domains instead of stopping with an error. The number skipped is shown as a hint.',
			},
			{
				displayName: 'Timeout (Seconds)',
				name: 'timeoutSeconds',
				type: 'number',
				typeOptions: { minValue: 10, maxValue: 3600 },
				default: 900,
				description:
					'How long to wait for the job. If it runs out, the error shows the job ID; the job keeps running on SameAPI. Only used when waiting.',
			},
			{
				displayName: 'Webhook Secret',
				name: 'webhookSecret',
				type: 'string',
				typeOptions: { password: true },
				default: '',
				description:
					'A secret of your choice. SameAPI signs each webhook with it so the receiver can check it is genuine.',
			},
			{
				displayName: 'Webhook URL',
				name: 'webhookUrl',
				type: 'string',
				default: '',
				placeholder: 'e.g. https://example.com/webhook',
				description:
					'A public https:// address that SameAPI calls when the job ends. Local addresses (localhost) are refused by SameAPI.',
			},
		],
	},
];
