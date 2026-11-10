import { SameApiError } from './errors';
import type { Job, JsonObject, RawResultItem, ResultsPage, Usage } from './types';

/**
 * The only place that knows the shape of SameAPI answers. If the API changes, change it here;
 * the HTTP layer and the operations do not look inside the data.
 */

function isObject(value: unknown): value is JsonObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toNumber(value: unknown): number | null {
	if (typeof value === 'number') return Number.isFinite(value) ? value : null;
	if (typeof value === 'string' && value.trim() !== '') {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
}

function toStringOrNull(value: unknown): string | null {
	return typeof value === 'string' ? value : null;
}

function round(value: number | null, digits = 2): number | null {
	if (value === null) return null;
	const factor = 10 ** digits;
	return Math.round(value * factor) / factor;
}

/** A 0..1 fraction as a 0..100 percentage. */
function fractionToPercent(value: unknown): number | null {
	const fraction = toNumber(value);
	return fraction === null ? null : round(fraction * 100);
}

function unexpected(what: string, body: unknown): SameApiError {
	return new SameApiError(
		`Unexpected answer from SameAPI (${what})`,
		'unexpected',
		'The answer did not have the expected shape. If this keeps happening, update the node or contact SameAPI support.',
		undefined,
		body,
	);
}

// ---------------------------------------------------------------------------------------------
// Jobs, results pages, usage
// ---------------------------------------------------------------------------------------------

export function parseJob(body: unknown): Job {
	if (!isObject(body) || typeof body.id !== 'string' || typeof body.status !== 'string') {
		throw unexpected('job', body);
	}
	return {
		id: body.id,
		name: toStringOrNull(body.name) ?? '',
		status: body.status,
		totalDomains: toNumber(body.total_domains) ?? 0,
		processedDomains: toNumber(body.processed_domains) ?? 0,
		successfulDomains: toNumber(body.successful_domains) ?? 0,
		failedDomains: toNumber(body.failed_domains) ?? 0,
		droppedDomainCount: toNumber(body.dropped_domain_count) ?? 0,
		warning: toStringOrNull(body.warning_message),
		createdAt: toStringOrNull(body.created_at),
		startedAt: toStringOrNull(body.started_at),
		completedAt: toStringOrNull(body.completed_at),
	};
}

export function parseResultsPage(body: unknown): ResultsPage {
	if (!isObject(body) || !Array.isArray(body.items)) throw unexpected('results', body);
	if (typeof body.error === 'string') {
		throw new SameApiError(
			'SameAPI returned only part of the results',
			'partial',
			'The server had a problem while sending the results. Run the node again in a moment.',
			undefined,
			body,
		);
	}
	const items = body.items.filter(isObject).map((item) => item as unknown as RawResultItem);
	return { items, total: toNumber(body.total) ?? items.length };
}

export function parseUsage(body: unknown): Usage {
	if (!isObject(body) || !isObject(body.quota)) throw unexpected('usage', body);
	const limits = isObject(body.rate_limits) ? body.rate_limits : {};
	return {
		plan: toStringOrNull(body.plan) ?? 'unknown',
		monthlyLimit: toNumber(body.quota.monthly_limit) ?? 0,
		used: toNumber(body.quota.used) ?? 0,
		remaining: toNumber(body.quota.remaining) ?? 0,
		requestsPerSecond: toNumber(limits.requests_per_second),
		concurrentJobs: toNumber(limits.concurrent_jobs),
		maxInflight: toNumber(limits.max_inflight),
	};
}

// ---------------------------------------------------------------------------------------------
// Traffic data for one domain
// ---------------------------------------------------------------------------------------------

/** The groups of the simplified answer. `domain` is always present; each group can be left out. */
export const SIMPLIFY_GROUPS = [
	'site',
	'visits',
	'ranks',
	'engagement',
	'trafficSources',
	'topCountries',
	'topKeywords',
	'aiTraffic',
	'competitors',
] as const;

export type SimplifyGroup = (typeof SIMPLIFY_GROUPS)[number];

export interface SiteInfo {
	title: string | null;
	description: string | null;
	category: string | null;
	isSmall: boolean | null;
	snapshotDate: string | null;
}

export interface VisitsInfo {
	/** First day of the latest month in the data, for example "2026-10-01". */
	latestMonth: string | null;
	/** Visits in the latest month of the data. */
	estimatedMonthlyVisits: number | null;
	/** Change of the latest month against the month before it, in percent. Calculated by this node. */
	changeVsPreviousMonthPercent: number | null;
	/** Visits per month, keyed by the first day of the month, oldest first. */
	byMonth: Record<string, number>;
}

export interface RanksInfo {
	global: number | null;
	country: { code: string | null; rank: number | null } | null;
	category: { name: string | null; rank: number | null } | null;
	globalCategory: number | null;
}

export interface EngagementInfo {
	/** 0-100. */
	bounceRatePercent: number | null;
	pagesPerVisit: number | null;
	avgVisitDurationSeconds: number | null;
}

export interface KeywordInfo {
	keyword: string;
	estimatedVisits: number | null;
	searchVolume: number | null;
	cpc: number | null;
}

export interface ChatbotInfo {
	name: string;
	rank: number | null;
	/** Share of the AI traffic that comes from this assistant, 0-100. */
	sharePercent: number | null;
	/** totalVisits x sharePercent / 100, when both are known. */
	estimatedVisits: number | null;
	/** Share per month, keyed by the first day of the month, oldest first. */
	history: Record<string, number>;
}

export interface AiTraffic {
	/** Estimated visits coming from AI assistants. */
	totalVisits: number | null;
	/** Share of the domain's traffic that comes from AI assistants, 0-100. */
	referralSharePercent: number | null;
	/** Upper bound shown by SameAPI when the AI traffic is small (for example "<100K"). */
	visitsBoundary: string | null;
	chatbots: ChatbotInfo[];
}

export interface SimplifiedTraffic {
	domain: string;
	site?: SiteInfo;
	visits?: VisitsInfo;
	ranks?: RanksInfo;
	engagement?: EngagementInfo;
	/** Each source as 0-100 (they add up to about 100). The names come from the data. */
	trafficSources?: Record<string, number>;
	/** Share of the domain's traffic per country, 0-100. */
	topCountries?: Array<{ countryCode: string; sharePercent: number }>;
	topKeywords?: KeywordInfo[];
	aiTraffic?: AiTraffic | null;
	/** Competitors exactly as SameAPI sends them (often empty). */
	competitors?: JsonObject[];
}

function camelKey(key: string): string {
	const words = key.split(/[\s_-]+/).filter(Boolean);
	return words
		.map((word, index) =>
			index === 0 ? word.charAt(0).toLowerCase() + word.slice(1) : word.charAt(0).toUpperCase() + word.slice(1),
		)
		.join('');
}

function nonEmpty(value: unknown): string | null {
	return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function visitsByMonth(raw: JsonObject): Record<string, number> {
	const source = isObject(raw.EstimatedMonthlyVisits)
		? raw.EstimatedMonthlyVisits
		: isObject(raw.visits)
			? raw.visits
			: {};
	const result: Record<string, number> = {};
	for (const month of Object.keys(source).sort()) {
		const value = toNumber(source[month]);
		if (value !== null) result[month] = value;
	}
	return result;
}

function visitsInfo(raw: JsonObject): VisitsInfo {
	const months = visitsByMonth(raw);
	const keys = Object.keys(months);
	const latestMonth = keys.length > 0 ? keys[keys.length - 1] : null;
	const latest = latestMonth === null ? null : months[latestMonth];
	const previous = keys.length > 1 ? months[keys[keys.length - 2]] : null;
	return {
		latestMonth,
		estimatedMonthlyVisits: latest,
		changeVsPreviousMonthPercent:
			latest !== null && previous !== null && previous > 0
				? round(((latest - previous) / previous) * 100)
				: null,
		byMonth: months,
	};
}

function siteInfo(item: RawResultItem, raw: JsonObject): SiteInfo {
	return {
		// The page title is in raw_data; the item's own title is only the domain name.
		title: nonEmpty(raw.Title) ?? nonEmpty(item.title) ?? nonEmpty(raw.title),
		description: nonEmpty(raw.Description),
		category: nonEmpty(raw.category) ?? nonEmpty(raw.Category),
		isSmall: typeof raw.IsSmall === 'boolean' ? raw.IsSmall : null,
		snapshotDate: toStringOrNull(raw.SnapshotDate),
	};
}

function ranksInfo(raw: JsonObject): RanksInfo {
	const global = isObject(raw.GlobalRank) ? toNumber(raw.GlobalRank.Rank) : toNumber(raw.global_rank);
	const countryRank = isObject(raw.CountryRank) ? raw.CountryRank : {};
	const categoryRank = isObject(raw.CategoryRank) ? raw.CategoryRank : {};
	const countryValue = toNumber(countryRank.Rank) ?? toNumber(raw.country_rank);
	const countryCode = nonEmpty(countryRank.CountryCode) ?? nonEmpty(raw.country);
	const categoryValue = toNumber(categoryRank.Rank) ?? toNumber(raw.category_rank);
	const categoryName = nonEmpty(categoryRank.Category) ?? nonEmpty(raw.category) ?? nonEmpty(raw.Category);
	const globalCategory = isObject(raw.GlobalCategoryRank)
		? toNumber(raw.GlobalCategoryRank.Rank)
		: toNumber(raw.GlobalCategoryRank);
	return {
		global,
		country:
			countryValue === null && countryCode === null ? null : { code: countryCode, rank: countryValue },
		category:
			categoryValue === null && categoryName === null ? null : { name: categoryName, rank: categoryValue },
		globalCategory,
	};
}

function engagementInfo(raw: JsonObject): EngagementInfo {
	const engagement = isObject(raw.Engagments) ? raw.Engagments : {};
	return {
		bounceRatePercent: fractionToPercent(engagement.BounceRate) ?? round(toNumber(raw.bounce_rate)),
		pagesPerVisit: round(toNumber(engagement.PagePerVisit) ?? toNumber(raw.pages_per_visit)),
		avgVisitDurationSeconds: round(toNumber(engagement.TimeOnSite) ?? toNumber(raw.avg_visit_duration)),
	};
}

function trafficSources(raw: JsonObject): Record<string, number> {
	const result: Record<string, number> = {};
	if (isObject(raw.TrafficSources)) {
		// Original data: fractions (0..1). The names come from the data, so new sources appear by themselves.
		for (const [key, value] of Object.entries(raw.TrafficSources)) {
			const percent = fractionToPercent(value);
			if (percent !== null) result[camelKey(key)] = percent;
		}
	} else if (isObject(raw.traffic_sources)) {
		// Convenience copy: already percentages.
		for (const [key, value] of Object.entries(raw.traffic_sources)) {
			const percent = round(toNumber(value));
			if (percent !== null) result[camelKey(key)] = percent;
		}
	}
	return result;
}

function topCountries(raw: JsonObject): NonNullable<SimplifiedTraffic['topCountries']> {
	if (Array.isArray(raw.TopCountryShares)) {
		return raw.TopCountryShares.filter(isObject).flatMap((entry) => {
			const code = toStringOrNull(entry.CountryCode);
			const share = fractionToPercent(entry.Value);
			return code && share !== null ? [{ countryCode: code, sharePercent: share }] : [];
		});
	}
	if (Array.isArray(raw.top_countries)) {
		return raw.top_countries.filter(isObject).flatMap((entry) => {
			const code = toStringOrNull(entry.country);
			const share = round(toNumber(entry.percentage));
			return code && share !== null ? [{ countryCode: code, sharePercent: share }] : [];
		});
	}
	return [];
}

function topKeywords(raw: JsonObject): KeywordInfo[] {
	if (!Array.isArray(raw.TopKeywords)) return [];
	return raw.TopKeywords.filter(isObject).flatMap((entry) =>
		typeof entry.Name === 'string'
			? [
					{
						keyword: entry.Name,
						estimatedVisits: toNumber(entry.EstimatedValue),
						searchVolume: toNumber(entry.Volume),
						cpc: toNumber(entry.Cpc),
					},
				]
			: [],
	);
}

/** Month history of one assistant, from the chart data, oldest first. */
function chatbotHistory(chart: JsonObject[], name: string): Record<string, number> {
	const entry = chart.find((candidate) => candidate.Name === name);
	const points = entry && Array.isArray(entry.History) ? entry.History.filter(isObject) : [];
	const result: Record<string, number> = {};
	const dated = points.flatMap((point) => {
		const date = toStringOrNull(point.Date);
		const value = round(toNumber(point.Value));
		return date !== null && value !== null ? [{ date, value }] : [];
	});
	for (const { date, value } of dated.sort((a, b) => a.date.localeCompare(b.date))) {
		result[date] = value;
	}
	return result;
}

function aiTraffic(raw: JsonObject): AiTraffic | null {
	const details = raw.AiTrafficDetails;
	if (!isObject(details)) return null;
	const traffic = isObject(details.Traffic) ? details.Traffic : {};
	const split = Array.isArray(traffic.Split) ? traffic.Split.filter(isObject) : [];
	const distribution = isObject(traffic.Distribution) ? traffic.Distribution : {};
	const chart = Array.isArray(distribution.Chart) ? distribution.Chart.filter(isObject) : [];
	const shares = new Map<string, number | null>();
	if (Array.isArray(distribution.Chatbots)) {
		for (const entry of distribution.Chatbots.filter(isObject)) {
			if (typeof entry.Name === 'string') shares.set(entry.Name, toNumber(entry.Value));
		}
	}
	const exactTotal = toNumber(details.TotalVisits);
	return {
		totalVisits: round(exactTotal, 0),
		referralSharePercent: fractionToPercent(details.ReferralTraffic),
		visitsBoundary: toStringOrNull(distribution.Boundary),
		chatbots: split.flatMap((entry) => {
			if (typeof entry.Name !== 'string') return [];
			const exactShare = shares.get(entry.Name) ?? null;
			return [
				{
					name: entry.Name,
					rank: toNumber(entry.Rank),
					sharePercent: round(exactShare),
					// Calculated from the unrounded figures, as the SameAPI dashboard does.
					estimatedVisits:
						exactTotal !== null && exactShare !== null ? Math.round((exactTotal * exactShare) / 100) : null,
					history: chatbotHistory(chart, entry.Name),
				},
			];
		}),
	};
}

function competitors(raw: JsonObject): JsonObject[] {
	const block = raw.Competitors;
	const list = isObject(block) ? block.TopSimilarityCompetitors : undefined;
	return Array.isArray(list) ? list.filter(isObject) : [];
}

/**
 * The "simplified" view of one successful domain result: a few groups, each with the related figures.
 * `include` picks the groups to keep; empty or missing means all of them.
 */
export function simplifyTraffic(
	item: RawResultItem,
	include?: readonly SimplifyGroup[],
): SimplifiedTraffic {
	const raw: JsonObject = isObject(item.raw_data) ? item.raw_data : {};
	const wanted = (group: SimplifyGroup): boolean =>
		include === undefined || include.length === 0 || include.includes(group);

	const result: SimplifiedTraffic = { domain: item.domain };
	if (wanted('site')) result.site = siteInfo(item, raw);
	if (wanted('visits')) result.visits = visitsInfo(raw);
	if (wanted('ranks')) result.ranks = ranksInfo(raw);
	if (wanted('engagement')) result.engagement = engagementInfo(raw);
	if (wanted('trafficSources')) result.trafficSources = trafficSources(raw);
	if (wanted('topCountries')) result.topCountries = topCountries(raw);
	if (wanted('topKeywords')) result.topKeywords = topKeywords(raw);
	if (wanted('aiTraffic')) result.aiTraffic = aiTraffic(raw);
	if (wanted('competitors')) result.competitors = competitors(raw);
	return result;
}

export interface FailedDomain {
	domain: string;
	success: false;
	/** A plain-English reason. */
	error: string;
	/** The text SameAPI sent, for support requests. */
	details: string | null;
}

/** SameAPI reports a domain it refuses as "http_4xx_definitive:400 - HTTP 400". */
export function explainFailure(message: string | null | undefined): string {
	if (!message) return 'SameAPI could not process this domain';
	if (/^http_4xx_definitive/i.test(message)) return 'SameAPI rejected this domain as invalid';
	return message;
}

/** Output for one result: simplified data, a failure record, or the item exactly as received. */
export function formatResultItem(
	item: RawResultItem,
	simplify: boolean,
	include?: readonly SimplifyGroup[],
): SimplifiedTraffic | FailedDomain | RawResultItem {
	if (!item.success) {
		return {
			domain: item.domain,
			success: false,
			error: explainFailure(item.error_message),
			details: item.error_message ?? null,
		};
	}
	return simplify ? simplifyTraffic(item, include) : item;
}
