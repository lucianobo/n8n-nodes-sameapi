import type { INodeProperties } from 'n8n-workflow';

import { includeFieldsOption } from './shared';

const showAny = { resource: ['job'] };
const showResults = { resource: ['job'], operation: ['getResults'] };

export const jobProperties: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: showAny },
		options: [
			{
				name: 'Get',
				value: 'get',
				description: 'Get the status and progress of a job',
				action: 'Get a job',
			},
			{
				name: 'Get Results',
				value: 'getResults',
				description:
					'Get the domain data of a job, page by page. While the job is running the order is not stable, so check the status first with Job → Get.',
				action: 'Get job results',
			},
		],
		default: 'get',
	},
	{
		displayName: 'Job ID',
		name: 'jobId',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. 5dc22f15-a637-41ce-8a77-a629bc105b70',
		displayOptions: { show: showAny },
		description: 'The ID returned by Batch → Look Up Domains',
	},
	{
		displayName: 'Simplify',
		name: 'simplify',
		type: 'boolean',
		default: true,
		displayOptions: { show: showResults },
		description: 'Whether to return a clean summary grouped by topic per domain instead of the full SameAPI response',
	},
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		displayOptions: { show: showResults },
		description: 'Whether to return all results or only up to a given limit',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 50,
		displayOptions: { show: { ...showResults, returnAll: [false] } },
		description: 'Max number of results to return',
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: showResults },
		options: [
			{
				displayName: 'Include Country List',
				name: 'includeCountryList',
				type: 'boolean',
				default: false,
				description:
					'Whether to keep the long reference list of 252 countries in the full response. Only applies when Simplify is off.',
			},
			includeFieldsOption,
			{
				displayName: 'Only Successful Results',
				name: 'successOnly',
				type: 'boolean',
				default: false,
				description: 'Whether to leave out the domains SameAPI could not process',
			},
		],
	},
];
