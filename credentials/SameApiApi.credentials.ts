import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class SameApiApi implements ICredentialType {
	name = 'sameApiApi';

	displayName = 'SameAPI API';

	icon = {
		light: 'file:../nodes/SameApi/sameapi.svg',
		dark: 'file:../nodes/SameApi/sameapi.dark.svg',
	} as const;

	documentationUrl = 'https://sameapi.io/docs?utm_source=n8n';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Create a key in your SameAPI dashboard under API Keys. API access needs a Pro plan or higher (https://sameapi.io/pricing?utm_source=n8n).',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'X-API-Key': '={{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://sameapi.io/api/v1',
			url: '/usage',
			method: 'GET',
		},
	};
}
