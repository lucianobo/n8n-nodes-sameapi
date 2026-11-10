import type { INodeProperties } from 'n8n-workflow';

/** One entry of the "Include Fields" option. Keep in step with SIMPLIFY_GROUPS in lib/normalize.ts. */
export const includeFieldsOption: INodeProperties = {
	displayName: 'Include Fields',
	name: 'includeFields',
	type: 'multiOptions',
	default: [],
	description:
		'Which groups of data to keep when Simplify is on. Leave empty to keep all of them. The domain is always included.',
	options: [
		{ name: 'AI Traffic', value: 'aiTraffic', description: 'Visits from AI assistants, per assistant and per month' },
		{ name: 'Competitors', value: 'competitors', description: 'Competitors, when SameAPI has them' },
		{ name: 'Engagement', value: 'engagement', description: 'Bounce rate, pages per visit and visit duration' },
		{ name: 'Ranks', value: 'ranks', description: 'Global, country and category rankings' },
		{ name: 'Site', value: 'site', description: 'Title, description, category and snapshot date' },
		{ name: 'Top Countries', value: 'topCountries', description: 'Countries with the biggest share of traffic' },
		{ name: 'Top Keywords', value: 'topKeywords', description: 'Search keywords that bring visits' },
		{ name: 'Traffic Sources', value: 'trafficSources', description: 'Share of traffic per source' },
		{ name: 'Visits', value: 'visits', description: 'Monthly visits and the change against the month before' },
	],
};
