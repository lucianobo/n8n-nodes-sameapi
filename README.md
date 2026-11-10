# n8n-nodes-sameapi

This is an n8n community node for [SameAPI](https://sameapi.io/?utm_source=n8n), an API that estimates the traffic of any website. Look up a domain inside a workflow and get its estimated monthly visits, global, country and category rankings, traffic sources, top countries and visits from AI assistants, without handling asynchronous jobs yourself.

> **Status:** this node has **not** been verified by n8n. See [PUBLISH.md](PUBLISH.md) for the publishing steps.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/sustainable-use-license/) workflow automation platform.

- [Installation](#installation)
- [Credentials](#credentials)
- [Operations](#operations)
- [Output](#output)
- [Limits and errors](#limits-and-errors)
- [Examples](#examples)
- [Compatibility](#compatibility)
- [Resources](#resources)

## Installation

Follow the [community nodes installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) and install the package `n8n-nodes-sameapi`.

In short: **Settings → Community Nodes → Install**, enter `n8n-nodes-sameapi`, accept the notice, and install. Step-by-step instructions are in [USAGE.md](USAGE.md).

## Credentials

You need a SameAPI account on a **Pro plan or higher**. The Basic (free) plan has no API access.

1. Sign in at [sameapi.io](https://sameapi.io/?utm_source=n8n) and open **API Access** in the dashboard.
2. Create an API key.
3. In n8n, create a **SameAPI API** credential and paste the key.

n8n tests the credential with `GET /usage`. If the plan has no API access you will see a clear message that points to the [pricing page](https://sameapi.io/pricing?utm_source=n8n).

## Operations

### SameAPI node

| Resource | Operation | What it does |
| --- | --- | --- |
| Domain | **Get Traffic** | Looks up one domain, waits for SameAPI to finish, and returns the data. Use it for a few domains. |
| Batch | **Look Up Domains** | Looks up up to 10,000 domains in one job. Wait for the results, or get the job ID right away (optionally with a webhook). |
| Job | **Get** | Returns the status and progress of a job. |
| Job | **Get Results** | Returns the results of a job, with **Return All** or a **Limit**. |
| Account | **Get Usage** | Returns your plan, monthly quota and rate limits. |

**Get Traffic** makes one lookup per input item, one after the other (a few seconds each). With more than 50 input items it stops and asks you to use **Batch → Look Up Domains** instead (you can turn that check off in Options).

**Batch → Look Up Domains** reads one domain from each input item, or from a pasted list. Domains are cleaned (`https://www.Example.com/page` becomes `example.com`), checked, and de-duplicated. Invalid entries stop the run with a clear message, or are skipped if you turn on **Skip Invalid Domains**.

Both lookup operations have **Polling Interval** and **Timeout** options. If the timeout runs out, the error shows the job ID: the job keeps running on SameAPI and you can fetch it later with the Job operations.

### SameAPI Trigger node

Starts a workflow when a batch job finishes or fails. Put the node's **Production URL** in the **Webhook URL** option of **Batch → Look Up Domains**, and the same secret in **Webhook Secret**. The node checks SameAPI's signature (`X-Webhook-Signature`) and refuses old or forged deliveries with HTTP 401.

SameAPI only calls public `https://` addresses, so a local n8n on `localhost` cannot receive webhooks. SameAPI sends two events: `job.completed` (the job finished; some domains may still have failed, see `failedDomains`) and `job.failed` (the job could not be processed at all). By default the Trigger starts the workflow only for `job.completed`. In the **Events** field you can add **Job Failed**, so you can warn someone instead of waiting forever. The output has an `event` field you can branch on, see [`examples/06-webhook-receiver-with-failed-job.json`](examples/06-webhook-receiver-with-failed-job.json). Deliveries for events you did not choose are answered with `200` and ignored.

## Output

With **Simplify** on (the default), each domain becomes one item with ten top-level fields. The data is grouped by topic, so you can reach any figure with a short path such as `{{ $json.visits.estimatedMonthlyVisits }}` or `{{ $json.ranks.global }}`. Real example for `example.com` (shortened):

```json
{
  "domain": "example.com",
  "site": {
    "title": "Example Domain",
    "description": null,
    "category": "Computers_Electronics_and_Technology/Programming_and_Developer_Software",
    "isSmall": false,
    "snapshotDate": "2026-10-01T00:00:00+00:00"
  },
  "visits": {
    "latestMonth": "2026-10-01",
    "estimatedMonthlyVisits": 7991641,
    "changeVsPreviousMonthPercent": 3.38,
    "byMonth": { "2026-08-01": 9345666, "2026-09-01": 7730649, "2026-10-01": 7991641 }
  },
  "ranks": {
    "global": 9425,
    "country": { "code": "US", "rank": 13112 },
    "category": { "name": "Computers_Electronics_and_Technology/Programming_and_Developer_Software", "rank": 310 },
    "globalCategory": null
  },
  "engagement": { "bounceRatePercent": 69.4, "pagesPerVisit": 1.9, "avgVisitDurationSeconds": 174.13 },
  "trafficSources": { "direct": 52.03, "searchOrganic": 3.6, "referrals": 8.58, "genAi": 0.48 },
  "topCountries": [{ "countryCode": "US", "sharePercent": 14.88 }],
  "topKeywords": [{ "keyword": "example.com", "estimatedVisits": 2190, "searchVolume": 2810, "cpc": 1.83 }],
  "aiTraffic": {
    "totalVisits": 17329,
    "referralSharePercent": 0.22,
    "visitsBoundary": "<100K",
    "chatbots": [
      {
        "name": "gemini.google.com",
        "rank": 1,
        "sharePercent": 25.73,
        "estimatedVisits": 4458,
        "history": { "2026-08-01": 22.58, "2026-09-01": 14.75, "2026-10-01": 25.73 }
      }
    ]
  },
  "competitors": []
}
```

- **Choose what you need.** In **Options → Include Fields** pick the groups to keep (for example only *Visits* and *Ranks*). Leave it empty to keep all of them. You can also use an **Edit Fields (Set)** node, or point to a single value with an expression as shown above.
- Rates and shares are always **percentages from 0 to 100** (the original data uses fractions from 0 to 1; the node converts them).
- `visits.changeVsPreviousMonthPercent` is calculated by this node from the last two months. It is `null` when there is no previous month or it had no visits.
- `trafficSources` takes its names from the data, so a new source appears by itself.
- `isSmall: true` (inside `site`) means SameAPI has too little data for the site, and the numbers are zero or empty. This is not an error.
- `aiTraffic.chatbots[].sharePercent` is the share of the AI traffic that comes from that assistant (0 to 100). `estimatedVisits` is the AI visits times that share. `history` has the share per month.
- `competitors` is passed on exactly as SameAPI sends it, and is often empty.
- A domain SameAPI cannot process comes back as `{ "domain", "success": false, "error", "details" }` in batch results.

Turn **Simplify** off to get the complete SameAPI response (`raw_data`). The long reference list of 252 countries is left out unless you turn on **Include Country List**, which saves about 16 KB per domain.

## Limits and errors

- **Plans** (see [pricing](https://sameapi.io/pricing?utm_source=n8n)): Basic is free with 200 requests per month and **no API**. API plans: Pro $20 (10,000 requests/month), Ultra $100 (50,000), Mega $500 (1,000,000).
- **Cache:** looking up the same domain again within 5 minutes on the same account is served from cache and does not use quota.
- **Rate limits** per second: Pro 10, Ultra 30, Mega 75. On `429` the node waits as told by `Retry-After` and tries again (at most 5 times, never longer than 30 seconds per wait).
- **Job creation is never repeated** after a server error or a network failure, so one lookup can never be billed twice by a retry.
- **Errors** are explained in plain English: `401` bad key, `402` quota used up or payment overdue, `403` plan without API access, `404` job not found, `429` rate limit. The node supports **Continue on Fail**: the error is put in the output item instead of stopping the workflow.

## Examples

Importable workflows are in [`examples/`](examples). See [USAGE.md](USAGE.md) for a guided first workflow.

## Compatibility

Developed and tested with n8n 2.47.3. No runtime dependencies.

## Resources

- [SameAPI documentation](https://sameapi.io/docs?utm_source=n8n)
- [SameAPI pricing](https://sameapi.io/pricing?utm_source=n8n)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- Support: support@sameapi.io

## License

[MIT](LICENSE)
