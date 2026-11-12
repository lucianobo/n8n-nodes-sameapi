# Using the SameAPI node in n8n

A step-by-step guide for end users. You need a SameAPI account on a **Pro plan or higher** (the free Basic plan has no API access; see [pricing](https://sameapi.io/pricing?utm_source=n8n)).

## 1. Install the node

1. In n8n, open **Settings → Community Nodes**.
2. Click **Install**.
3. Enter the package name: `n8n-nodes-sameapi`.
4. Tick the box that accepts the risk of installing community code, then click **Install**.
5. When it finishes, search for **SameAPI** in the nodes panel. You should see two nodes: **SameAPI** and **SameAPI Trigger**.

If **Community Nodes** is missing, your administrator may have disabled it (environment variable `N8N_COMMUNITY_PACKAGES_ENABLED`).

## 2. Create the credential

1. Sign in at [sameapi.io](https://sameapi.io/?utm_source=n8n), open **API Keys**, and create an API key. Copy it.
2. In n8n, open any SameAPI node and choose **Create new credential**, or go to **Credentials → Create → SameAPI API**.
3. Paste the key into **API Key** and save.
4. n8n tests the key. A green message means it works. If you see "Your SameAPI plan has no API access", move to a Pro plan or higher.

## 3. Your first workflow: a list of domains to a Slack message

Goal: read domains from a Google Sheet, look up their traffic, and post the big ones to Slack. The same pattern works with a CRM (read companies, then update a field).

A ready-made template is in [`examples/05-sheets-to-sameapi-to-slack-template.json`](examples/05-sheets-to-sameapi-to-slack-template.json). To build it by hand:

1. **Manual Trigger** to start.
2. **Google Sheets** node → *Read rows*. Pick your sheet. It should have a column named `domain`.
3. **SameAPI** node → Resource **Batch**, Operation **Look Up Domains**.
   - *Domains From*: **Each Input Item**.
   - *Domain*: map the column: `{{ $json.domain }}`.
   - *Result*: **Wait for Results**. Leave **Simplify** and **Return All** on.
4. **Filter** node: keep rows where `visits.estimatedMonthlyVisits` is at least 100000.
5. **Slack** node → *Post a message*, with a text such as `{{ $json.domain }}: {{ $json.visits.estimatedMonthlyVisits }} visits last month, global rank {{ $json.ranks.global }}`.
6. Click **Execute workflow**.

To write the numbers back to the sheet instead, finish with a **Google Sheets** node → *Append or Update Row*, matching on `domain`.

**One domain at a time:** if you only have a few domains, use Resource **Domain**, Operation **Get Traffic** instead of Batch. It waits for the result and returns the data directly. Template: [`examples/01-traffic-for-a-few-domains.json`](examples/01-traffic-for-a-few-domains.json). With more than 50 items, use Batch.

## 4. Understand the output

Each domain becomes one item, with the data grouped by topic. Open a group in the output panel, or write the path in an expression, for example `{{ $json.visits.estimatedMonthlyVisits }}`.

| Group | What is inside |
| --- | --- |
| `domain` | The domain you asked for |
| `site` | `title`, `description`, `category`, `snapshotDate`, and `isSmall` (`true` when SameAPI has too little data for the site; numbers are then zero or empty) |
| `visits` | `estimatedMonthlyVisits` (latest month), `latestMonth`, `changeVsPreviousMonthPercent`, and `byMonth` |
| `ranks` | `global`, `country` (`code`, `rank`), `category` (`name`, `rank`), `globalCategory`. Lower is bigger |
| `engagement` | `bounceRatePercent` (0 to 100), `pagesPerVisit`, `avgVisitDurationSeconds` |
| `trafficSources` | Share of traffic per source (`direct`, `searchOrganic`, `referrals`, `genAi`, ...). Each is 0 to 100 |
| `topCountries` | Top countries with `sharePercent` (0 to 100) |
| `topKeywords` | Search keywords with `estimatedVisits`, `searchVolume` and `cpc` |
| `aiTraffic` | `totalVisits`, `referralSharePercent`, and `chatbots`: each assistant with `rank`, `sharePercent`, `estimatedVisits` and a monthly `history` |
| `competitors` | Competitors as SameAPI sends them (often empty) |

**You only want some of it?** Open **Options → Include Fields** and pick the groups to keep, for example *Visits* and *Ranks*. Leave it empty to keep everything. An **Edit Fields (Set)** node works too.

Turn **Simplify** off to receive the complete SameAPI response.

## 5. Batch with a webhook (continue when the job is done)

Use this when the list is large and you do not want a workflow waiting. It needs **two workflows** and a **public https address** (SameAPI refuses `localhost`).

1. Import [`examples/04-batch-with-webhook-receive.json`](examples/04-batch-with-webhook-receive.json). It starts with a **SameAPI Trigger**.
2. In the Trigger, type a secret of your choice in **Webhook Secret**. Open the node and copy its **Production URL**. **Activate (publish) the workflow**, otherwise the Production URL does not listen.
3. Import [`examples/03-batch-with-webhook-start.json`](examples/03-batch-with-webhook-start.json). In its **SameAPI** node, open *Options* and paste the Production URL into **Webhook URL** and the same secret into **Webhook Secret**.
4. Run the second workflow. It returns a job ID at once.
5. When SameAPI finishes the job it calls the Trigger. The Trigger refuses calls with a wrong signature, and otherwise starts workflow 1, which reads the results with **Job → Get Results**.

**If the job fails.** Rarely, SameAPI cannot process a whole job. It then sends `job.failed` instead of `job.completed`. The Trigger ignores it by default, so workflow 1 does not run on a failed job. To get a message in that case, open the Trigger, add **Job Failed** to **Events**, and branch on the `event` field, as in [`examples/06-webhook-receiver-with-failed-job.json`](examples/06-webhook-receiver-with-failed-job.json). The failed event has `status`, `failedAt` and a short `error`. You can create the job again, and **Account → Get Usage** shows what your quota is now.

You can also skip the webhook: choose **Return Job Immediately**, and later use **Job → Get** (status) and **Job → Get Results** with the job ID.

**Running n8n on your own computer (no public address)?** You still get every result, because the webhook is optional:
- **Wait for Results** (the default) keeps the workflow running until the job is finished and returns the data. This needs no webhook.
- **Return Job Immediately** plus a **Schedule Trigger** (or a **Wait** node and a loop) that calls **Job → Get** until the status is `completed`, then **Job → Get Results**.
- Or expose your n8n with a tunnel service and use its https address as the Webhook URL.

## 6. Good to know

- **Quota:** each lookup uses one request of your monthly quota. Looking up the same domain again within 5 minutes on the same account does not. **Account → Get Usage** shows what is left.
- **Rate limits:** Pro 10 requests per second, Ultra 30, Mega 75. The node waits and retries on `429`.
- **Timeout:** if a lookup does not finish in time, the error shows the job ID. The job keeps running; fetch it later with the Job operations.
- **Continue on Fail:** in the node's *Settings*, turn it on so one bad domain does not stop a whole run. The error is placed in the output item.
- **Limits of this guide:** the Google Sheets and Slack parts of the template depend on your own accounts and were not run by the SameAPI team. The SameAPI node itself was tested against the live API.

## Troubleshooting

| Message | What to do |
| --- | --- |
| SameAPI rejected the API key | Check the key in the credential; create a new one in the dashboard |
| Your SameAPI plan has no API access | Upgrade to Pro or higher: https://sameapi.io/pricing?utm_source=n8n |
| SameAPI quota used up or payment overdue | Wait for the next period, upgrade, or fix the payment in the dashboard |
| SameAPI rate limit reached | Run fewer things in parallel, or use Batch for long lists |
| "..." is not a valid domain | Fix that entry, or turn on **Skip Invalid Domains** in Batch |
| Timed out waiting for the SameAPI job | Raise **Timeout**, or fetch the job later with its ID |
