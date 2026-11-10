# Publishing `n8n-nodes-sameapi`

Maintainer notes. Requirements below were read on **10 November 2026** from the official pages linked in each section. They change: re-read them before you publish.

## Three different goals

1. **Published on npm.** Anyone can `npm install` the package.
2. **Installable as a community node in n8n.** Follows from 1: self-hosted n8n can install any public npm package named `n8n-nodes-*` (Settings → Community Nodes).
3. **Verified by n8n.** n8n reviews the node and lists it in the nodes panel, including on n8n Cloud. This is a separate request and n8n can say no. **Never write "verified" anywhere before n8n approves it.**

## What n8n requires today

Sources: [Submit community nodes](https://docs.n8n.io/integrations/creating-nodes/deploy/submit-community-nodes/), [Verification guidelines](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/verification-guidelines/), [UX guidelines](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/ux-guidelines/), [npm: trusted publishing](https://docs.npmjs.com/trusted-publishers/).

| Requirement | Status in this repo |
| --- | --- |
| Package name starts with `n8n-nodes-` | Done (`n8n-nodes-sameapi`) |
| Keyword `n8n-community-node-package` | Done |
| Nodes and credentials listed in `package.json` → `n8n` | Done (2 nodes, 1 credential) |
| Created with the `n8n-node` tool, `@n8n/node-cli` 0.23.0 or later | Done (0.56.1 at the time of writing) |
| `npm run lint` passes (cloud support enabled) | Done |
| MIT license | Done (`LICENSE`) |
| **No runtime dependencies** | Done (`peerDependencies` has only `n8n-workflow`) |
| No access to environment variables or the file system | Done (the node reads only its parameters) |
| English only (interface, errors, docs) | Done |
| One service per package; a Trigger for the same service is allowed (programmatic style) | Done |
| README with install steps, usage and examples | Done (`README.md`, `USAGE.md`, `examples/`) |
| Package source check: npm repository URL matches a public GitHub repo; author matches | **To do** (needs the real repo) |
| **Published from GitHub Actions with a provenance statement** (required since 1 May 2026) | **To do** |
| `npx @n8n/scan-community-package n8n-nodes-sameapi` passes | **To do** (runs on the published package) |
| Review by n8n (Creator Portal) | **To do**; can take up to four weeks |

n8n also says it may reject nodes that compete with its own paid features. That does not apply to SameAPI as far as we can tell, but the decision is n8n's.

### Points where review could push back (be ready)

- **Simplify output is nested.** It has 10 top-level fields (the UX guidelines suggest at most 10), with the detail grouped inside, and an **Include Fields** option to keep only some groups. The shape is built in one place (`nodes/SameApi/lib/normalize.ts`).
- **The Trigger has empty `webhookMethods`** (nothing to create or delete on SameAPI, because the webhook address travels with each batch). The code comment explains it.
- **The main node is programmatic**, not declarative, because it must poll a job and page through results.
- **Resource Locator and CRUD naming:** the node has no list to pick from; the job ID is typed or mapped.

## Before you publish (checklist)

**The SameAPI backend change that sends `job.failed` must be live before the package is published.** The README, USAGE and the Trigger's "Job Failed" choice describe it. Status: deployed on 10 November 2026 (backend, workers, beat and scheduler restarted from 17:01 UTC; checked on the server).

Run from the repository root:

```bash
npm ci
npm run lint
npm test
npm run build
```

Also check:
- `package.json` → `repository.url`, `author`, `homepage` are the real values (see "Confirm" below).
- `CHANGELOG.md` has an entry for the version.
- `git status` is clean and the branch is up to date.
- No secrets in the repo (`git grep -n -i "api.key\|secret"` and read the hits).

## Steps

Each step is done one at a time, together, because it happens on websites you control.

1. **Create the GitHub repository** (public, MIT): done, `https://github.com/lucianobo/n8n-nodes-sameapi`. The name matches `repository.url` in `package.json`. Commit messages must not contain `Co-Authored-By` lines.

2. **Create an npm account** with two-factor authentication: done (user `sameapi`, security key, recovery codes saved).

3. **Authorize GitHub Actions to publish.** `.github/workflows/publish.yml` runs when a version tag is pushed. npm's current documentation says the Trusted Publisher setting is in the *package's* settings, so the package must already exist: the **first** release uses a token, and the trusted publisher is set up afterwards.
   - **First release (token).** A *granular access token* (read and write, all packages, bypass 2FA, shortest expiry) is stored as the GitHub secret `NPM_TOKEN`. The workflow writes it to the npm config before publishing, and provenance still works. Done on 10 November 2026.
   - **After the first release (trusted publisher, no long-lived token).** On npmjs.com: the package, Settings, Trusted Publisher, GitHub Actions. Repository owner `lucianobo`, repository `n8n-nodes-sameapi`, workflow file `publish.yml`. The first publish through it must happen within 2 days of creating the setting. Then **delete the `NPM_TOKEN` secret on GitHub and revoke the token on npm.** Requires npm 11.5.1 or later and Node 22.14 or later in the workflow.
   - Do **not** publish from your own computer if you plan to submit the node for verification: n8n requires GitHub Actions and provenance.

4. **Release.** Set `version` in `package.json` and the matching `CHANGELOG.md` entry, commit and push to `main`, wait for the CI run, then push a tag with the same number:

   ```bash
   git tag 0.1.0
   git push origin 0.1.0
   ```

   The tag triggers the workflow, which lints, builds and publishes to npm with provenance. Watch the run in the repository's Actions tab. (`npm run release` is the alternative for later versions: it asks for the version, rewrites the changelog from the commit history, commits, tags and pushes. It does not publish by itself.) A published version number can never be reused.

5. **Check the published package:**

   ```bash
   npm view n8n-nodes-sameapi
   npx @n8n/scan-community-package n8n-nodes-sameapi
   ```

   On the npm package page you should see the provenance badge. Then install it in a test n8n from Settings → Community Nodes and run the example workflows.

6. **Submit for verification** at the [n8n Creator Portal](https://creators.n8n.io/nodes): sign in or sign up, submit the package, and answer n8n's emails. n8n fetches the package from npm for its checks.

   **If n8n asks for a way to test the node:** the Basic plan has no API access, so give the reviewers an API key from a paid account (the owner decided to use the `me@lucianobonanno.com` account, which is on a paid plan). Send it only through the channel n8n asks for, never put it in the repository, and revoke it in the SameAPI dashboard (API Keys) once the review is finished.

7. **After approval:** update the SameAPI site and docs (see the list in the maintainer's handover) and only then use the word "verified".

## Decisions already made

- **Author email** in `package.json`: `support@sameapi.io` (a public address already on the site).
- **GitHub owner and repository name:** `lucianobo/n8n-nodes-sameapi`.
- **License holder** in `LICENSE`: "SameAPI".
- **Public texts:** they avoid naming other companies' trademarks.

## What was and was not tested

- Tested: 105 automated tests; the node in n8n 2.47.3 against the live SameAPI API (usage, single lookup, batch, job status and results, errors 401, 403, 404, 429); the 402 and quota-warning paths against SameAPI's backend code run locally; the Trigger with signed and forged requests; and one real webhook delivery: a 2-domain batch on the live SameAPI service called the Trigger through a temporary public https tunnel, the signature was accepted and the workflow ran (10 November 2026, n8n 2.47.3).
- **`job.failed`:** the Trigger's event filter and the payload parser are covered by unit tests, and signed simulated requests in n8n 2.47.3 confirmed that `job.failed` is ignored by default and starts the workflow when chosen. The backend change is live (10 November 2026), but no real `job.failed` delivery has been recorded yet: it needs a job that fails with a webhook URL.
- **Batches above 10,000 domains:** the draft, upload and start steps were run against the live service with 3 domains (completed, all successful) and the chunking is covered by tests with a fake API. A real list above 10,000 domains has not been run.
- **Not tested:** other n8n versions, and the Google Sheets and Slack nodes in `examples/05-...` (template only).
