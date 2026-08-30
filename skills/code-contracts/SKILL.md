---
name: code-contracts
description: Define, use, and enforce @cc code-contracts across a codebase.
---

# Code Contracts

A simple open format for specifying structured assumptions and requirements about code to support
faster and better agent-driven software development.

```typescript
/**
 * @cc [author:spolu,label:product] balance-pre-and-fail
 * `from.balance` is expected to be greater than or equal to `invoice.amount`, fails with
 * `InsufficientBalanceError` otherwise.
 */
/**
 * @cc [author:spolu,label:product] balance-post
 * `from.balance` is decreased by `invoice.amount` and `invoice.status` is set to `paid`.
 */
/**
 * @cc [author:spolu,label:product] atomicity
 * The operation is atomic: either `from.balance` is decreased and `invoice.status` is set to
 * `paid`, or neither is changed.
 */
export async function payInvoice(
  invoice: Invoice,
  from: Account,
): Promise<PaidInvoice> {
 ...
}
```

## Why code contracts?

Code contracts are written and used by both humans and agents to reason about code.

They serve three main purposes:

**Specification**: Compared with separate product or system specification files, which tend to
drift from code and are harder to discover, code contracts are embedded locally. Humans use them to
reason about behavior without having to inspect implementation details. Agents use them to guide
implementations and surface important assumptions to humans and future agents.

**Attention**: They reduce the cycles required to reason about code by surfacing important
assumptions and invariants in a structured way, freeing one of the most bottlenecked resources in
modern software development teams: human attention.

**Verification**: Their structure and granularity enable tooling to enforce compliance and ease
maintenance over time. Code contract enforcement provides a verification signal to agents that
improves their performance.

Code contracts enable:

- More efficient collaboration between human developers and coding agents.
- Generative code analysis and verification that improves agent performance.
- Maintenance at scale of invariants, product contracts, and security assumptions at code level.

## Tooling

```sh
npm install --global @spolu/cc-check
```

The `cc-check` command-line interface provides:

- `cc-check check [file-like]`: validates `@cc` grammar and contract-ID uniqueness in a supported
  source or `CONTRACTS` file. Without a path, it recursively checks every supported file in the
  current directory.
- `cc-check list <file-like|location-like>`: lists contracts attached to declarations throughout a
  supported source file, or contracts applicable to the declaration containing a source location
  and its declaration ancestors. Directory-scoped contracts from ancestor `CONTRACTS` files are
  included by default; pass `--no-global` to exclude them.

## Specification and grammar

`@cc` directives are extracted from documentation comments in any supported source language. Each
directive defines one code contract. Contracts are generally colocated with or within function,
class, or method definitions.

Code contracts that are not attached to a declaration live in a file named `CONTRACTS`. They apply
to all code contained in the directory where that file lives and its descendant directories. Their
typical use case is expressing directory-scoped coding rules, such as architectural boundaries,
dependency constraints, or security practices.

`CONTRACTS` file example:

```text
@cc [author:spolu,label:architecture] database-access-thru-resources
Database accesses must happen exclusively through `Resource`-like interfaces.

@cc [author:spolu,label:security] no-sensitive-data-logging
Credentials, tokens, secrets and user data must not be logged.
```

The grammar uses ISO-style EBNF. `SP` is one or more spaces and `NL` is a line break. Comment
delimiters and decorations such as `/**`, `*/`, `//`, `///`, Python docstring triple quotes, and
leading `*` are removed before parsing.

```ebnf
contracts_file
              = { contract, NL } ;
contract      = directive, NL, prose ;
directive     = "@cc", SP, [ metadata, SP ], contract_id ;

metadata      = "[", attribute, { ",", attribute }, "]" ;
attribute     = key, ":", value ;

contract_id   = token ;
key           = token ;
value         = token ;
prose         = prose_line, { NL, prose_line } ;
```

`token` is a non-empty sequence without whitespace, commas, colons, or square brackets. Metadata
keys are extensible; `author` and `label` are initially well-known, and `label` may occur more than
once. `prose_line` is any line that does not begin with an `@cc` directive.

The prose body is non-empty and extends to the end of the documentation comment, the next `@cc`
directive in a `CONTRACTS` file, or the end of that file. It may contain any text and span any
number of lines. The core format does not prescribe vocabulary, sentence shape, modality, or a
requirements notation, but Markdown is generally expected.

A documentation comment contains one `@cc` directive. Multiple consecutive contract comments may
attach to the same declaration. Contract IDs are unique and stable within the declaration to which
they are attached; the same ID may be used on a different declaration. Contracts in a `CONTRACTS`
file are not attached to a declaration, and their IDs are unique and stable within that file and
across all parent `CONTRACTS` files.

The identity of an attached contract is the language-specific identity of its declaration plus its
contract ID. The identity of a directory contract is the repository-relative path of its `CONTRACTS`
file plus its contract ID.

## Discovering applicable contracts

Before changing or reviewing code, identify the contracts that govern the target. You can do so
manually or with the `cc-check` tool.

Treat all applicable local and directory contracts as simultaneous obligations. Surface conflicting,
obsolete, or impossible contracts instead of choosing one silently.

### `cc-check list`

The `list` command lists all code contracts related to a declaration or an entire file. The `list`
command will output the locally defined code-contracts as well as the global ones from parent
directories' `CONTRACTS` files.

```text
cc-check list path/to/file.ts:42
cc-check list path/to/file.ts
```

`--no-global` lets you intentionally isolate local contracts. Avoid using it as the basis for a
compliance conclusion since `CONTRACTS` file contracts are deemed applicable.

If `cc-check` is unavailable, inspect the target's documentation comments and every parent
`CONTRACTS` file manually. State that automated discovery was not run; do not silently skip the
step.

## Writing effective contracts

Code contracts are effective when they are simple, concise, and precise. Put a declaration-specific
expectation in that language's supported documentation comment or docstring. Put a rule governing a
directory tree in `CONTRACTS`, normally for architectural, security, or coding constraints.

Each source documentation block contains exactly one directive. Keep attached IDs unique and stable
within their declaration. Keep a `CONTRACTS` ID unique and stable within that file and its parent
`CONTRACTS` files. Set `author` to the current user's GitHub username; use their authenticated
GitHub identity when available, and ask rather than guessing when it cannot be determined. Preserve
established repository metadata conventions.

Write contract prose so a human or agent reviewer can compare it directly with code:

- Express one durable obligation per contract. Split independent requirements.
- Prefer one concise, dense and clear sentence; add another only when a material exception or
  failure behavior needs stating.
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

## Working against contracts

While implementing or reviewing a change:

- Read applicable contracts before choosing the design.
- Translate each contract into concrete code paths and observable outcomes affected by the change.
- Reconcile the implementation, relevant tests, and contract prose after each meaningful behavior
  change.
- When behavior intentionally changes, update the contract in the same change if that specification
  change is in scope. Never delete or weaken a contract merely to make an implementation appear
  compliant.
- Treat a code/contract mismatch as a finding. Fix it or surface it clearly; do not assume either
  side is automatically correct.
- Validate edited contract syntax early and again after the final edit:

```text
cc-check check path/to/file.ts
cc-check check # checks all files
```

`cc-check check` validates grammar and ID uniqueness within the check perimeter. It does not prove
that the prose is true or that code complies. Use normal project formatting, type checking, tests,
and review in addition to semantic contract inspection.

## Performing a bounded final audit

Before submitting a commit or pull request, perform a best-effort semantic audit of the exact diff.
This is a focused risk check, not a claim of exhaustive verification.

1. Identify changed declarations and behavior from the complete intended diff, including staged and
   unstaged changes where relevant.
2. Review applicable directory contracts for every changed file. This global review is mandatory and
   does not consume the reference budget.
3. For each materially changed declaration, list its applicable contracts and identify
   callers/references when the change can affect consumers.
4. Rank investigation targets by expected risk and information value (contract-bearing or
   high-fanout symbols).
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
