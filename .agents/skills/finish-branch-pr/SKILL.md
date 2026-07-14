---
name: finish-branch-pr
description: Finalize completed repository work by updating documentation, running checks, committing intended changes, pushing a work branch, and opening a draft pull request. Use when implementation is complete and the user asks to finish, ship, commit, push, publish a branch, or create a PR. Respect explicit boundaries such as commit-only, push-only, or draft-PR-only. Do not review, approve, mark ready, or merge pull requests.
---

# Finish Branch PR

Complete the handoff from finished local work to a draft pull request without widening the implementation scope. Follow repository instructions and the user's explicit scope over this generic workflow.

For an unqualified request to finish or ship completed work, run the complete workflow through draft PR creation. For a request explicitly limited to commit, push, draft PR creation, or another boundary, stop at that boundary and report the remaining stages.

## Workflow

### 1. Establish the completion scope

- Read the applicable `AGENTS.md` files and inspect Git status, the current branch, and the complete diff.
- Identify user-owned or unrelated changes and preserve them. Do not stage them.
- Confirm that the requested behavior is implemented before starting release work. If implementation remains, finish it under the original task instructions first.
- Do not include generated data, local databases, extracted assets, logs, credentials, machine-specific paths, or other private files.

### 2. Update documentation

- Update code-adjacent documentation affected by the change: setup steps, configuration examples, schemas, migrations, public contracts, operational notes, and user-visible behavior.
- Keep documentation proportional to the change. Do not add speculative documents or rewrite unrelated sections.
- Update external project records such as Notion only when repository instructions or the user require it and the required connector is available.

### 3. Verify the finished work

- Run formatting and linting for affected packages.
- Run type checking, relevant unit or integration tests, and production builds for affected applications.
- For UI changes, visually inspect the affected route and exercise its primary interactions.
- If a required check cannot run, record the exact reason. Never report an unrun check as passing.
- Reinspect the final diff for accidental files, private information, unsafe public/private imports, and unintended changes.

### 4. Prepare the branch and commit

- Fetch remote state when network access is available.
- Never commit finished feature work directly to the repository default branch. If currently on the default branch, create a repository-compliant work branch before committing.
- Follow repository branch naming rules. If none exist, use a concise `feature/`, `fix/`, `docs/`, or `chore/` prefix that matches the change.
- Stage only the intended files. Review the staged diff before committing.
- Use a focused Conventional Commit message that describes the completed outcome.
- Do not rewrite history, amend user commits, force-push, or bypass hooks unless the user explicitly authorizes it.

### 5. Push and open a draft pull request

- Push the current work branch and set its upstream without force.
- Open a draft pull request against the repository default branch unless the user explicitly requested an earlier stopping point.
- Write the PR title as a concise Conventional Commit-style summary.
- Include in the PR body:
  - the outcome and motivation;
  - the important implementation and documentation changes;
  - checks actually run and their results;
  - remaining risks, unavailable checks, and manual follow-up.
- Return the branch name, commit identifier, PR URL, draft state, checks run, remaining risks, and any manual follow-up.

## Stop conditions

Stop before the next state-changing stage when:

- the intended scope cannot be separated from unrelated changes;
- required documentation or validation reveals incomplete or unsafe behavior;
- branch creation, remote selection, base branch, or publication scope is materially ambiguous;
- the operation would expose private data or cross the repository's public/private boundary;
- credentials, permissions, required approvals, or network access are unavailable.
- required checks fail or blocking review findings remain unresolved.

Explain the blocker and request only the decision or authority needed to continue.

## Excluded follow-up

Do not review, approve, mark ready, or merge the PR created by this workflow. Those actions remain manual unless the user separately authorizes another workflow.
