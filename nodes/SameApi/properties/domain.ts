import type { INodeProperties } from 'n8n-workflow';

import { includeFieldsOption } from './shared';

const show = { resource: ['domain'], operation: ['getTraffic'] };

export const domainProperties: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['domain'] } },
		options: [
			{
				name: 'Get Traffic',
				value: 'getTraffic',
				description:
					'Look up the traffic of one domain and wait for the data. Makes one lookup per input item; for long lists use Batch → Look Up Domains.',
				action: 'Get domain traffic',
			},
		],
		default: 'getTraffic',
	},
	{
		displayName: 'Domain',
		name: 'domain',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. example.com',
		displayOptions: { show },
		description:
			'The domain to look up. A full URL also works: the protocol, path and "www." are removed for you.',
	},
	{
		displayName: 'Simplify',
		name: 'simplify',
		type: 'boolean',
		default: true,
		displayOptions: { show },
		description: 'Whether to return a clean summary grouped by topic instead of the full SameAPI response',
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
				displayName: 'Allow More Than 50 Items',
				name: 'allowManyItems',
				type: 'boolean',
				default: false,
				description:
					'Whether to allow more than 50 input items. Each item creates its own SameAPI job and takes a few seconds, so Batch is usually the better choice.',
			},
			{
				displayName: 'Include Country List',
				name: 'includeCountryList',
				type: 'boolean',
				default: false,
				description:
					'Whether to keep the long reference list of 252 countries in the full response. Only applies when Simplify is off; it adds about 16 KB per domain.',
			},
			includeFieldsOption,
			{
				displayName: 'Polling Interval (Seconds)',
				name: 'pollIntervalSeconds',
				type: 'number',
				typeOptions: { minValue: 1, maxValue: 30 },
				default: 2,
				description: 'How often to ask SameAPI whether the lookup is finished. Most lookups take 3 to 5 seconds.',
			},
			{
				displayName: 'Remove "www."',
				name: 'removeWww',
				type: 'boolean',
				default: true,
				description: 'Whether to remove a leading "www." from the domain before the lookup',
			},
			{
				displayName: 'Timeout (Seconds)',
				name: 'timeoutSeconds',
				type: 'number',
				typeOptions: { minValue: 10, maxValue: 1800 },
				default: 120,
				description:
					'How long to wait for the lookup. If it runs out, the error shows the job ID so you can read the data later with the Job operations.',
			},
		],
	},
];
