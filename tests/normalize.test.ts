/* eslint-disable @n8n/community-nodes/no-restricted-imports, @n8n/community-nodes/no-restricted-globals -- unit tests only: not part of the published package */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
	formatResultItem,
	parseJob,
	parseResultsPage,
	parseUsage,
	simplifyTraffic,
} from '../nodes/SameApi/lib/normalize';
import { SameApiError } from '../nodes/SameApi/lib/errors';
import type { RawResultItem } from '../nodes/SameApi/lib/types';

// A real answer recorded from the API on 10 Nov 2026 (example.com, view=table).
const fixture = JSON.parse(
	readFileSync(join(__dirname, '..', '..', 'tests', 'fixtures', 'example-com.results.json'), 'utf8'),
) as { items: RawResultItem[] };
const item = fixture.items[0];

describe('simplifyTraffic (real example.com answer)', () => {
	const out = simplifyTraffic(item);

	it('has the domain and one group per kind of data', () => {
		assert.deepEqual(Object.keys(out), [
			'domain',
			'site',
			'visits',
			'ranks',
			'engagement',
			'trafficSources',
			'topCountries',
			'topKeywords',
			'aiTraffic',
			'competitors',
		]);
		assert.ok(Object.keys(out).length <= 10, 'n8n guideline: at most 10 top-level fields');
	});

	it('site: the real page title, not the domain', () => {
		assert.equal(out.domain, 'example.com');
		assert.deepEqual(out.site, {
			title: 'Example Domain',
			description: null,
			category: 'Computers_Electronics_and_Technology/Programming_and_Developer_Software',
			isSmall: false,
			snapshotDate: '2026-10-01T00:00:00+00:00',
		});
	});

	it('visits: latest month, monthly history and the change against the month before', () => {
		assert.equal(out.visits?.latestMonth, '2026-10-01');
		assert.equal(out.visits?.estimatedMonthlyVisits, 7991641);
		assert.deepEqual(out.visits?.byMonth, {
			'2026-08-01': 9345666,
			'2026-09-01': 7730649,
			'2026-10-01': 7991641,
		});
		// (7991641 - 7730649) / 7730649 * 100 = 3.376...
		assert.equal(out.visits?.changeVsPreviousMonthPercent, 3.38);
	});

	it('ranks: grouped with their country and category', () => {
		assert.deepEqual(out.ranks, {
			global: 9425,
			country: { code: 'US', rank: 13112 },
			category: {
				name: 'Computers_Electronics_and_Technology/Programming_and_Developer_Software',
				rank: 310,
			},
			globalCategory: null,
		});
	});

	it('uses percentages (0-100), never fractions, for rates and shares', () => {
		assert.deepEqual(out.engagement, {
			bounceRatePercent: 69.4,
			pagesPerVisit: 1.9,
			avgVisitDurationSeconds: 174.13,
		});
		assert.equal(out.trafficSources?.direct, 52.03);
		assert.equal(out.trafficSources?.searchOrganic, 3.6);
		assert.deepEqual(out.topCountries?.[0], { countryCode: 'US', sharePercent: 14.88 });
	});

	it('names every traffic source in camelCase, taking the names from the data', () => {
		assert.deepEqual(Object.keys(out.trafficSources ?? {}).sort(), [
			'affiliate',
			'direct',
			'displayAds',
			'genAi',
			'mail',
			'referrals',
			'searchOrganic',
			'searchPaid',
			'socialOrganic',
			'socialPaid',
		]);
	});

	it('keeps the top keywords', () => {
		assert.equal(out.topKeywords?.length, 5);
		assert.deepEqual(out.topKeywords?.[0], {
			keyword: 'example.com',
			estimatedVisits: 2190,
			searchVolume: 2810,
			cpc: 1.83,
		});
	});

	it('keeps the AI assistant data, with each assistant history and estimated visits', () => {
		assert.ok(out.aiTraffic);
		assert.equal(out.aiTraffic.visitsBoundary, '<100K');
		assert.equal(out.aiTraffic.totalVisits, 17329);
		assert.equal(out.aiTraffic.referralSharePercent, 0.22);
		assert.deepEqual(out.aiTraffic.chatbots[0], {
			name: 'gemini.google.com',
			rank: 1,
			sharePercent: 25.73,
			// 17329.183 x 25.726... / 100
			estimatedVisits: 4458,
			history: { '2026-08-01': 22.58, '2026-09-01': 14.75, '2026-10-01': 25.73 },
		});
	});

	it('leaves out the screenshot link and the icons (they point to a third-party service)', () => {
		const text = JSON.stringify(out);
		assert.ok(!text.includes('similarcdn'));
		assert.ok(!text.includes('/image?url='));
	});

	it('works from the convenience fields when the original ones are missing', () => {
		const raw = item.raw_data as Record<string, unknown>;
		const trimmed: RawResultItem = {
			...item,
			raw_data: {
				global_rank: raw.global_rank,
				bounce_rate: raw.bounce_rate,
				visits: raw.visits,
				traffic_sources: raw.traffic_sources,
				top_countries: raw.top_countries,
			},
		};
		const result = simplifyTraffic(trimmed);
		assert.equal(result.ranks?.global, 9425);
		assert.equal(result.engagement?.bounceRatePercent, 69.4);
		assert.equal(result.visits?.estimatedMonthlyVisits, 7991641);
		assert.equal(result.trafficSources?.direct, 52.03);
		assert.equal(result.topCountries?.[0].countryCode, 'US');
		assert.equal(result.aiTraffic, null);
	});

	it('does not break on empty data', () => {
		const empty = simplifyTraffic({ domain: 'x.com', success: true, raw_data: {} });
		assert.equal(empty.visits?.estimatedMonthlyVisits, null);
		assert.equal(empty.visits?.changeVsPreviousMonthPercent, null);
		assert.deepEqual(empty.visits?.byMonth, {});
		assert.equal(empty.ranks?.global, null);
		assert.equal(empty.ranks?.country, null);
		assert.deepEqual(empty.topCountries, []);
		assert.deepEqual(empty.topKeywords, []);
		assert.deepEqual(empty.competitors, []);
	});

	it('gives no change when the month before had no visits', () => {
		const result = simplifyTraffic({
			domain: 'x.com',
			success: true,
			raw_data: { EstimatedMonthlyVisits: { '2026-09-01': 0, '2026-10-01': 500 } },
		});
		assert.equal(result.visits?.changeVsPreviousMonthPercent, null);
	});

	it('passes competitors through as received', () => {
		const result = simplifyTraffic({
			domain: 'x.com',
			success: true,
			raw_data: { Competitors: { TopSimilarityCompetitors: [{ Domain: 'y.com' }, 'ignored'] } },
		});
		assert.deepEqual(result.competitors, [{ Domain: 'y.com' }]);
	});
});

describe('simplifyTraffic with include (choose the groups)', () => {
	it('keeps only the chosen groups, and always the domain', () => {
		const out = simplifyTraffic(item, ['visits', 'keywordsDoNotExist' as never, 'topKeywords']);
		assert.deepEqual(Object.keys(out), ['domain', 'visits', 'topKeywords']);
	});
	it('treats an empty choice as "all groups"', () => {
		assert.equal(Object.keys(simplifyTraffic(item, [])).length, 10);
	});
	it('is passed through formatResultItem, and ignored when Simplify is off', () => {
		assert.deepEqual(Object.keys(formatResultItem(item, true, ['ranks'])), ['domain', 'ranks']);
		assert.equal(formatResultItem(item, false, ['ranks']), item);
	});
});

describe('formatResultItem', () => {
	it('returns the item untouched when not simplifying', () => {
		assert.equal(formatResultItem(item, false), item);
	});
	it('turns a failed domain into a clear record', () => {
		const failed: RawResultItem = { domain: 'bad.com', success: false, error_message: 'No data' };
		assert.deepEqual(formatResultItem(failed, true), {
			domain: 'bad.com',
			success: false,
			error: 'No data',
			details: 'No data',
		});
	});
	it('explains the failure text SameAPI really sends for refused domains (recorded 10 Nov 2026)', () => {
		const failed: RawResultItem = {
			domain: '1.2.3.4',
			success: false,
			error_message: 'http_4xx_definitive:400 - HTTP 400',
			raw_data: { error: 'http_4xx_definitive:400 - HTTP 400' },
		};
		assert.deepEqual(formatResultItem(failed, false), {
			domain: '1.2.3.4',
			success: false,
			error: 'SameAPI rejected this domain as invalid',
			details: 'http_4xx_definitive:400 - HTTP 400',
		});
	});
});

describe('parsers', () => {
	it('parseJob reads the job fields', () => {
		const job = parseJob({
			id: 'j1',
			name: 'N',
			status: 'completed',
			total_domains: 2,
			processed_domains: 2,
			successful_domains: 1,
			failed_domains: 1,
			warning_message: 'careful',
		});
		assert.equal(job.id, 'j1');
		assert.equal(job.failedDomains, 1);
		assert.equal(job.warning, 'careful');
	});
	it('parseJob rejects strange answers', () => {
		assert.throws(() => parseJob({ nope: true }), SameApiError);
		assert.throws(() => parseJob(null), SameApiError);
	});
	it('parseUsage reads plan, quota and limits', () => {
		const usage = parseUsage({
			plan: 'pro',
			quota: { monthly_limit: 10000, used: 5, remaining: 9995 },
			rate_limits: { requests_per_second: 10, concurrent_jobs: 5, max_inflight: 50 },
		});
		assert.deepEqual(usage, {
			plan: 'pro',
			monthlyLimit: 10000,
			used: 5,
			remaining: 9995,
			requestsPerSecond: 10,
			concurrentJobs: 5,
			maxInflight: 50,
		});
	});
	it('parseResultsPage flags a partial stream', () => {
		assert.throws(
			() => parseResultsPage({ items: [], total: 0, error: 'internal_error', partial: true }),
			/only part of the results/,
		);
	});
});
