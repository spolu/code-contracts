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

## Agent skill

```
npx skills add https://github.com/spolu/code-Contracts
```

The reusable [$code-contracts](skills/code-contracts/SKILL.md) skill guides coding and review
agents through writing concise contracts, checking them while changing code, and performing a
bounded semantic audit before commits and pull requests.

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
