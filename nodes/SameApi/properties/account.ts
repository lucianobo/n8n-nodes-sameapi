import type { INodeProperties } from 'n8n-workflow';

export const accountProperties: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['account'] } },
		options: [
			{
				name: 'Get Usage',
				value: 'getUsage',
				description: 'Get your plan, monthly quota and rate limits',
				action: 'Get account usage',
			},
		],
		default: 'getUsage',
	},
];
