---
name: pr-babysitter
description: Monitor an existing GitHub draft pull request after another bot performs code review. Use when Codex should poll external review and CI results, keep the PR in draft while findings or checks remain, mark it ready only after strict gates pass, enable GitHub auto-merge, and stop monitoring when the PR is merged or closed. Do not perform code review, fix findings, approve reviews, or bypass repository protections.
---

# PR Babysitter

Monitor one pull request at a time. Treat GitHub state as authoritative and make readiness a mechanical transition immediately before enabling auto-merge.

## Required input

- Require the repository full name and pull request number or URL.
- Require the expected external review workflow and check names. For this repository, use workflow `Claude Code Review` and check `review`.
- Require explicit authorization to enable auto-merge. Monitoring alone does not authorize merging.
- Refuse to infer an acceptance signal from prose comments when the expected check identity is missing.

## Polling workflow

### 1. Read current pull request state

- Prefer the GitHub integration; use `gh` only when the integration cannot expose a required field.
- Read the PR state, draft flag, base and head branches, current head SHA, mergeability, reviews, review threads, and check runs for the current head SHA.
- If the PR is merged or closed, stop the originating scheduled task and report the terminal state once.
- If the PR is open but its head or base branch identity no longer matches the monitored branch names, stop without mutation and report the mismatch. A new commit on the same head branch is not an identity mismatch; evaluate its new SHA on the next poll.

### 2. Evaluate gates

Require every condition below:

- The PR is open and mergeable, with no reported merge conflict.
- The expected external review check exists for the current head SHA and completed successfully.
- Every exposed required check for the current head SHA is complete with an acceptable conclusion. Treat pending, queued, missing, cancelled, timed out, action-required, stale, or failed checks as not ready.
- No review has an active `CHANGES_REQUESTED` decision.
- No unresolved review thread exists, regardless of author.
- Repository rules do not report a blocking requirement.

Do not treat a successful review workflow alone as proof that the review found no issues. The absence of unresolved review threads is a separate mandatory gate.

If any gate is not satisfied, keep the PR in draft and do not enable auto-merge. Report only a newly observed blocker or state change; avoid repeating unchanged status on every poll.

### 3. Revalidate before mutation

- Fetch the PR again immediately before changing state.
- Confirm it is still open and the head SHA is unchanged from the evaluated SHA.
- If the head changed, perform no mutation and evaluate the new head on the next poll.

### 4. Mark ready and enable auto-merge

- If the PR is still a draft, mark it ready for review. This transition is required because GitHub cannot merge draft pull requests.
- Fetch the PR once more and confirm it remains open and still points to the evaluated head SHA.
- Enable GitHub auto-merge. Prefer repository-selected merge settings; do not bypass branch protection or use administrator overrides.
- Do not submit an approval review and do not merge immediately as a fallback when auto-merge is unavailable.
- Verify that auto-merge is enabled or that GitHub merged the PR as an immediate result of satisfying all repository requirements.

### 5. Finish monitoring

- Stop the originating scheduled task after the PR is merged or closed.
- If auto-merge is enabled but requirements remain, continue polling until merged, closed, or blocked.
- Keep monitoring and report the blocker when auto-merge cannot be enabled because of permissions, repository settings, or an unsupported merge policy.
- Never archive the parent Codex task unless the user explicitly requested archival.

## Safety boundaries

- Do not perform an independent code review or reinterpret external findings.
- Do not change code, resolve review threads, dismiss reviews, or push commits.
- Do not approve the PR on the user's behalf.
- Do not weaken required checks, branch protection, rulesets, or reviewer requirements.
- Do not process multiple PRs from one monitor unless the user explicitly requests a repository-wide automation.
