# Copy blocks (ready to copy and paste)

All text is English. Nothing here claims the node is "verified": that status only exists after n8n approves it.

## 1. Name and tagline

**Name:** SameAPI

**Package:** n8n-nodes-sameapi

**Tagline (max 80 characters):**

```
Website traffic, rankings and AI visits for any domain, inside n8n
```

## 2. Short description (about 160 characters)

```
Get estimated monthly visits, rankings, traffic sources and AI-assistant visits for any domain. One domain or a whole list in a batch, with no job handling.
```

## 3. Long description (for a directory page)

```
SameAPI adds website traffic data to your n8n workflows. Give it a domain and it returns the estimated monthly visits, global, country and category rankings, the share of traffic by source, the top countries, the top search keywords, engagement figures and the estimated visits that come from AI assistants such as ChatGPT or Gemini.

The lookup runs as a job on SameAPI's side, but you do not have to manage it: "Get Traffic" starts the lookup, waits for it, and hands you the data. For longer lists, "Look Up Domains" sends the whole list as one job (what you can send depends on your plan) and either waits for the results or returns a job ID so the workflow can carry on when the job is finished (with the SameAPI Trigger and a signed webhook, which also reports a job that failed).

Results can be simplified into one flat item per domain with clear units (percentages are always 0 to 100), or returned in full. Errors are explained in plain English, rate limits are respected, and "Continue on Fail" is supported.

An API key from a SameAPI Pro plan or higher is required. The free Basic plan has no API access. Details: https://sameapi.io/pricing?utm_source=n8n
```

## 4. Features

- Estimated monthly visits, with the monthly history
- Global, country and category rankings
- Traffic sources as percentages (direct, search, social, referrals, mail, display ads, AI and more)
- Top countries by share of traffic
- Top search keywords, with estimated visits, volume and CPC
- Month-over-month change in visits
- Choose which groups of data to keep (Include Fields)
- Estimated visits from AI assistants, with a ranking of the assistants
- Engagement: bounce rate, pages per visit, average visit duration
- Automatic waiting: no job handling for single lookups
- Batch of any size your plan allows (long lists are uploaded in calls of 10,000), with optional webhook and a signed-webhook Trigger node
- "Return All" and "Limit" for results, read page by page
- Domains are cleaned and de-duplicated (`https://www.Example.com/page` becomes `example.com`)
- Polling interval and timeout settings
- Waits and retries on rate limits (`Retry-After`), never repeats job creation after a server error
- "Continue on Fail" support
- No runtime dependencies

## 5. Use cases

1. **Enrich a spreadsheet of domains.** Read domains from Google Sheets or Airtable, add visits, rankings and traffic sources, and write them back.
2. **Qualify leads.** Look up the website of each new CRM lead and route the biggest sites to a salesperson.
3. **Monitor competitors.** Run a schedule, compare this month's visits with last month's, and send a Slack message when something moves.
4. **Check AI-assistant visibility.** Track the estimated visits a site receives from AI assistants, and which assistants send them.
5. **Research at scale.** Send a list of thousands of domains as one batch, and continue the workflow when SameAPI calls the webhook.

## 6. Requirements

- n8n with community nodes enabled (developed and tested on n8n 2.47.3)
- A SameAPI account on a **Pro plan or higher** (Basic has no API access)
- An API key from the SameAPI dashboard (API Keys)

## 7. Keywords and categories

**Keywords:** website traffic, traffic estimates, domain analysis, competitor research, SEO, rankings, AI traffic, lead enrichment, bulk domain analysis, n8n community node

**Search phrases to cover:** n8n website traffic API, n8n domain traffic analysis, n8n competitor research, n8n SEO automation, n8n bulk domain analysis, n8n AI traffic analysis

**n8n categories (in the codex file):** Analytics, Marketing & Content

## 8. Credential help text

Label: **API Key**

```
Create a key in your SameAPI dashboard under API Keys. API access needs a Pro plan or higher (https://sameapi.io/pricing?utm_source=n8n).
```

## 9. Operations and fields

### Resource: Domain

**Operation: Get Traffic**
- Description: Look up the traffic of one domain and wait for the data. Makes one lookup per input item; for long lists use Batch → Look Up Domains.
- Action: Get domain traffic
- **Domain** (required): The domain to look up. A full URL also works: the protocol, path and "www." are removed for you. Placeholder: `e.g. example.com`
- **Simplify**: Whether to return a clean summary grouped by topic instead of the full SameAPI response
- Options:
  - **Allow More Than 50 Items**: Whether to allow more than 50 input items. Each item creates its own SameAPI job and takes a few seconds, so Batch is usually the better choice.
  - **Include Country List**: Whether to keep the long reference list of 252 countries in the full response. Only applies when Simplify is off; it adds about 16 KB per domain.
  - **Include Fields**: Which groups of data to keep when Simplify is on (AI Traffic, Competitors, Engagement, Ranks, Site, Top Countries, Top Keywords, Traffic Sources, Visits). Leave empty to keep all of them. The domain is always included.
  - **Polling Interval (Seconds)**: How often to ask SameAPI whether the lookup is finished. Most lookups take 3 to 5 seconds.
  - **Remove "www."**: Whether to remove a leading "www." from the domain before the lookup
  - **Timeout (Seconds)**: How long to wait for the lookup. If it runs out, the error shows the job ID so you can read the data later with the Job operations.

### Resource: Batch

**Operation: Look Up Domains**
- Description: Look up many domains in one job. A long list is uploaded in several calls of 10,000 and stays one job.
- Action: Look up many domains in a batch
- **Domains From**: *Each Input Item* (read one domain from every incoming item) or *Pasted List* (commas, spaces or new lines)
- **Domain**: The domain of each input item. Map the field that holds it. Placeholder: `e.g. {{ $json.domain }}`
- **Domain List**: Domains separated by commas, spaces or new lines. Duplicates are removed.
- **Result**: *Wait for Results* (wait until the job is done, then return one item per domain) or *Return Job Immediately* (return the job ID at once; continue later with Get Results, or add a webhook in Options)
- **Simplify**, **Return All**, **Limit**: as above (used when waiting)
- Options: **Batch Name**, **Include Country List**, **Include Fields**, **Only Successful Results**, **Polling Interval (Seconds)**, **Remove "www."**, **Skip Invalid Domains**, **Timeout (Seconds)**, **Webhook Secret**, **Webhook URL** (a public https:// address that SameAPI calls when the job ends, for example the Production URL of a SameAPI Trigger node; local addresses are refused)

### Resource: Job

- **Get**: Get the status and progress of a job. Action: Get a job
- **Get Results**: Get the domain data of a job, page by page. While the job is running the order is not stable, so check the status first with Job → Get. Action: Get job results
- **Job ID** (required): The ID returned by Batch → Look Up Domains

### Resource: Account

**Operation: Get Usage**
- Description: Get your plan, monthly quota and rate limits
- Action: Get account usage

### SameAPI Trigger node

- Description: Starts a workflow when a SameAPI batch job has finished or has failed
- **Webhook Secret**: Type the same secret as in "Webhook Secret" of Batch → Look Up Domains (Options), where this node's Production URL goes in "Webhook URL". When set, deliveries with a wrong or missing signature are refused. Leave empty only for testing.
- **Events**: Which SameAPI events start the workflow: Job Completed (default) or Job Failed. Other events are accepted and ignored. Leave empty to start on every event. The event name is in the output field "event".
- **Signature Tolerance (Seconds)**: How old a delivery can be before it is refused as a possible replay. Only used when a secret is set.

## 10. Error messages

Each error has a short message and a longer explanation in the node.

| Situation | Message | Explanation (summary) |
| --- | --- | --- |
| HTTP 401 | SameAPI rejected the API key | Check the API key in your SameAPI credential; create a new one under API Keys. |
| HTTP 402 | SameAPI quota used up or payment overdue | The monthly quota is used up or a renewal payment failed. Upgrade or turn on overage: https://sameapi.io/pricing?utm_source=n8n |
| HTTP 403, no API | Your SameAPI plan has no API access | This node needs a Pro plan or higher. See https://sameapi.io/pricing?utm_source=n8n |
| HTTP 403, other | SameAPI refused the request | Check that your email address is verified and that your plan includes API access. |
| HTTP 404 | Not found | The job does not exist, belongs to another account, or its results have expired. |
| HTTP 429 | SameAPI rate limit reached | Too many requests or jobs at once; the node already waited and retried. Lower parallel runs or use Batch. |
| HTTP 5xx | SameAPI is temporarily unavailable | Try again in a few minutes. |
| No answer | Could not reach SameAPI | The request failed before an answer arrived. |
| Job too slow | Timed out waiting for the SameAPI job | The job keeps running; use Get Job and Get Job Results with the job ID later, or raise the timeout. |
| Job failed | The SameAPI job failed / was canceled | Nothing was returned. Try again; contact support if it repeats. |
| Partial results | SameAPI returned only part of the results | The server had a problem while sending results. Run the node again. |
| Bad input | "..." is not a valid domain | Use a domain name such as example.com. IP addresses and single words are not supported. |
| Bad input | There are no valid domains to look up | Add at least one domain, or check the field that holds them. |
| Bad input | Too many items for Get Traffic (N) | Use Batch → Look Up Domains, or turn on "Allow More Than 50 Items". |
| Domain refused | SameAPI rejected this domain as invalid | Returned inside batch results as `success: false` with `details` holding the original text. |
