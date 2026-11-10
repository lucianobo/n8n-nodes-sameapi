## 0.1.0

First release.

- **SameAPI** node: Domain, Get Traffic (waits for the data); Batch, Look Up Domains; Job, Get and Get Results; Account, Get Usage.
- **Batch, Look Up Domains** takes a list of any length. Up to 10,000 domains go in one call. A longer list becomes one job: the node creates a draft, uploads the domains in calls of up to 10,000 and starts it (the same steps the SameAPI dashboard uses). The size limit is your plan. If an upload fails, the error shows the draft job ID and says that nothing was started or billed.
- **SameAPI Trigger** node: receives the signed SameAPI webhook for `job.completed` and `job.failed`, with an **Events** choice (Job Completed by default).
- Simplified output grouped by topic (site, visits, ranks, engagement, trafficSources, topCountries, topKeywords, aiTraffic, competitors) and an **Include Fields** option.
- Waits and retries on rate limits; never repeats the creation of a job after a server or network error.
