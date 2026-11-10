## Unreleased

- **Batch → Look Up Domains** no longer stops above 10,000 domains. A longer list becomes one job: the node creates a draft, uploads the domains in calls of up to 10,000 and starts it (the same steps the SameAPI dashboard uses). The size limit is your plan. Up to 10,000 domains still use a single call.
- If an upload fails, the error shows the draft job ID and says that nothing was started or billed.
- Texts now say **API Keys**, the name of the menu in the SameAPI dashboard.

## 0.1.0

- First release: SameAPI node (Domain, Batch, Job, Account) and SameAPI Trigger.
