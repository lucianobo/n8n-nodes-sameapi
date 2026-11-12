import type {
	IDataObject,
	IWebhookFunctions,
	IWebhookResponseData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';
import { checkSignature, parseJobEvent, shouldStartWorkflow } from '../SameApi/lib/webhook';

const DEFAULT_TOLERANCE_SECONDS = 300;

function header(headers: Record<string, unknown>, name: string): string | undefined {
	const value = headers[name];
	return typeof value === 'string' ? value : undefined;
}

export class SameApiTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'SameAPI Trigger',
		name: 'sameApiTrigger',
		icon: { light: 'file:../SameApi/sameapi.svg', dark: 'file:../SameApi/sameapi.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: 'On job finished',
		description: 'Starts a workflow when a SameAPI batch job has finished or has failed',
		defaults: { name: 'SameAPI Trigger' },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'sameapi',
			},
		],
		properties: [
			{
				displayName: 'Webhook Secret',
				name: 'webhookSecret',
				type: 'string',
				typeOptions: { password: true },
				default: '',
				description:
					'Type the same secret as in "Webhook Secret" of Batch → Look Up Domains (Options), where this node\'s Production URL goes in "Webhook URL". When set, deliveries with a wrong or missing signature are refused. Leave empty only for testing.',
			},
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				default: ['job.completed'],
				description:
					'Which SameAPI events start the workflow. Other events are accepted and ignored. Leave empty to start on every event. The event name is in the output field "event".',
				options: [
					{
						name: 'Job Completed',
						value: 'job.completed',
						description: 'The job finished. Some domains may still have failed: see "failedDomains".',
					},
					{
						name: 'Job Failed',
						value: 'job.failed',
						description: 'The job could not be processed at all. Nothing was returned.',
					},
				],
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Signature Tolerance (Seconds)',
						name: 'toleranceSeconds',
						type: 'number',
						typeOptions: { minValue: 10, maxValue: 3600 },
						default: DEFAULT_TOLERANCE_SECONDS,
						description:
							'How old a delivery can be before it is refused as a possible replay. Only used when a secret is set.',
					},
				],
			},
		],
	};

	// SameAPI has no endpoint to register webhooks: the address is sent with each batch job
	// (Batch → Look Up Domains → Options → Webhook URL). So there is nothing to create or delete
	// on SameAPI's side, and n8n only has to listen on this node's URL.
	webhookMethods = {
		default: {
			async checkExists(): Promise<boolean> {
				return true;
			},
			async create(): Promise<boolean> {
				return true;
			},
			async delete(): Promise<boolean> {
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const request = this.getRequestObject();
		const secret = this.getNodeParameter('webhookSecret', '') as string;

		if (secret !== '') {
			const options = this.getNodeParameter('options', {}) as { toleranceSeconds?: number };
			const problem = checkSignature({
				secret,
				rawBody: (request as unknown as { rawBody?: Uint8Array | string }).rawBody,
				timestampHeader: header(this.getHeaderData(), 'x-webhook-timestamp'),
				signatureHeader: header(this.getHeaderData(), 'x-webhook-signature'),
				nowSeconds: Math.floor(Date.now() / 1000),
				toleranceSeconds: options.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS,
			});
			if (problem !== undefined) {
				const response = this.getResponseObject();
				response.status(401).json({ message: `Webhook refused: ${problem}` });
				return { noWebhookResponse: true };
			}
		}

		const event = parseJobEvent(this.getBodyData());
		const selected = this.getNodeParameter('events', ['job.completed']) as string[];
		if (!shouldStartWorkflow(event.event, selected)) {
			// Answer 200 so SameAPI does not retry, but do not start the workflow.
			return { webhookResponse: { message: `Event ignored: ${event.event}` } };
		}
		return { workflowData: [this.helpers.returnJsonArray(event as unknown as IDataObject)] };
	}
}
