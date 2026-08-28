---
name: code-contracts
description: Define, use, and enforce @cc code contracts across a codebase.
---

# Code Contracts

Code contracts are concise, reviewable, structured assumptions and requirements that stay close to
the code they govern to support faster and better agent-driven software development. They serve as
a high-bandwidth localized specification and trust layer that humans and agents can use to
collaborate and reason about code changes.

## Write effective contracts

Put a declaration-specific expectation in that language's supported documentation comment or
docstring. Put a rule governing a directory tree in `CONTRACTS`, normally for architectural,
security, or coding constraints.

Use this core form:

```text
@cc [author:github-username,label:category] stable-contract-id
One concise, concrete obligation stated in plain prose.
```

Each source documentation block contains exactly one directive. Keep attached IDs unique and stable
within their declaration. Keep a `CONTRACTS` ID unique and stable within that file and its parent
`CONTRACTS` files. Set `author` to the current user's GitHub username; use their authenticated GitHub
identity when available, and ask rather than guessing when it cannot be determined. Preserve
established repository metadata conventions.

Write contract prose so a reviewer can compare it directly with code:

- Express one durable obligation per contract. Split independent requirements.
- Prefer one concise sentence; add another only when a material exception or failure behavior needs
  stating.
- Name the subject and the observable behavior, outcome, boundary, or invariant.
- Use decisive language. Prefer `must`, `never`, or a direct present-tense invariant; use `should`
  only when discretion is intentional.
- Name relevant identifiers, states, errors, or boundaries precisely, using backticks where helpful.
- State preconditions, postconditions, failure behavior, atomicity, ordering, or side effects only
  when they are part of the expectation.
- Avoid vague terms such as "properly", "appropriately", "robust", "safe", or "as needed" unless
  the contract defines what they mean.
- Avoid rationale, implementation narration, examples, and restating types unless they materially
  constrain acceptable code.
- Do not encode speculative behavior or make a contract broader than the evidence or user intent.

For example, replace “Handles invalid amounts appropriately” with “`createInvoice` rejects a
non-positive amount with `InvalidAmountError` and does not persist the invoice.”

## Discover applicable contracts

Before changing or reviewing code, identify the contracts that govern the target:

```text
cc-check list path/to/file.ts:42
cc-check list path/to/file.ts
```

- Use a location for the contracts applying to one declaration and its applicable parents.
- Use a file for every declaration-attached contract in that file.
- Keep directory contracts enabled. `CONTRACTS` files from repository root through the target
  directory apply by default.
- Use `--no-global` only when intentionally isolating local contracts, never as the basis for a
  compliance conclusion.
- If `cc-check` is unavailable, inspect the target's documentation comments and every parent
  `CONTRACTS` file manually. State that automated discovery was not run; do not silently skip the
  step.

Treat all applicable local and directory contracts as simultaneous obligations. Surface conflicting,
obsolete, or impossible contracts instead of choosing one silently.

## Work against contracts

While implementing or reviewing a change:

1. Read applicable contracts before choosing the design.
2. Translate each contract into concrete code paths and observable outcomes affected by the change.
3. Reconcile the implementation, relevant tests, and contract prose after each meaningful behavior
   change.
4. When behavior intentionally changes, update the contract in the same change if that specification
   change is in scope. Never delete or weaken a contract merely to make an implementation appear
   compliant.
5. Treat a code/contract mismatch as a finding. Fix it or surface it clearly; do not assume either
   side is automatically correct.
6. Validate edited contract syntax early and again after the final edit:

```text
cc-check check path/to/file.ts
cc-check check
```

`cc-check check` validates grammar only. It does not prove that the prose is true, that code complies,
or that IDs are unique. Use normal project formatting, type checking, tests, and review in addition
to semantic contract inspection.

## Perform the bounded final audit

Before submitting a commit or pull request, perform a best-effort semantic audit of the exact diff.
This is a focused risk check, not a claim of exhaustive verification.

1. Identify changed declarations and behavior from the complete intended diff, including staged and
   unstaged changes where relevant.
2. Review applicable directory contracts for every changed file. This global review is mandatory and
   does not consume the reference budget.
3. For each materially changed declaration, list its applicable contracts and identify callers or
   references when the change can affect consumers:

```text
cc-check list path/to/file.ts:42
cc-check callers path/to/file.ts:42
cc-check references path/to/file.ts:42
```

4. Rank investigation targets by expected risk and information value:
   - Contract-bearing or externally visible declarations changed by the diff.
   - Security, authorization, persistence, transaction, concurrency, error, and data-integrity paths.
   - Direct callers of changed behavior and cross-package or cross-layer consumers.
   - References with distinct usage patterns, plus representative tests for those patterns.
   - High-fanout symbols, sampled across different consumer groups rather than by file order alone.
5. Inspect at most 32 distinct declaration or caller/reference targets. Revisiting the same target
   after a fix does not spend another slot. Automated grammar checking and applicable directory
   contract review are outside this budget.
6. When more than 32 candidates exist, use relationship results to understand the fanout, select the
   most consequential and diverse sites, then stop at the bound. Do not imply that every reference
   was reviewed.
7. Run `cc-check check` and the relevant project quality gates after resolving findings.

A known contract violation is not excused by the audit bound. Fix it before submission or report it
as an explicit blocker. In the commit or pull-request validation summary, state the contract checks
performed, any high-fanout sampling, and unresolved limitations when they are material.
