# Code Contracts

A simple open format for specifying structured assumptions and requirements about code to support
faster agent-driven software development.

"Specification as code"

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

## Grammar

`@cc` directives are extracted from documentation comments in any supported source language. Each
directive defines one code contract. How a documentation comment attaches to a declaration is
defined by the adapter for that source language.

Code contracts that are not attached to a declaration live in a file named `CONTRACTS.cc`. They
apply to all code contained in the directory where that file lives and its descendant directories.
Code in a nested directory inherits contracts from every `CONTRACTS.cc` file in its chain of parent
directories. Their typical use case is expressing directory-scoped coding rules, such as
architectural boundaries, dependency constraints, or security practices.

For example:

```text
@cc [author:spolu,label:architecture] database-access
Code in this directory accesses the database only through repository interfaces.

@cc [author:spolu,label:security] secret-logging
Code in this directory does not log credentials, tokens, or other secrets.
```

The grammar uses ISO-style EBNF. `SP` is one or more spaces and `NL` is a line break. Comment
delimiters and decorations such as `/**`, `*/`, `///`, and leading `*` are removed before parsing.

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
directive in a `CONTRACTS.cc` file, or the end of that file. It may contain any text and span any
number of lines. The core format does not prescribe vocabulary, sentence shape, modality, or a
requirements notation. Authoring skills and analysis tools may recommend conventions such as EARS
or BCP 14 without changing what constitutes a valid code contract.

A documentation comment contains one `@cc` directive. Multiple consecutive contract comments may
attach to the same declaration, as in the example above. Contract IDs are unique and stable within
the declaration to which they are attached; the same ID may be used on a different declaration.
Contracts in a `CONTRACTS.cc` file are not attached to a declaration, and their IDs are unique and
stable within that file and across all parent `CONTRACTS.cc` files. A nested `CONTRACTS.cc` cannot
reuse an ID inherited from a parent, while `CONTRACTS.cc` files in sibling directory trees may use
the same ID.

The identity of an attached contract is the language-specific identity of its declaration plus its
contract ID. The identity of a directory contract is the repository-relative path of its
`CONTRACTS.cc` file plus its contract ID.
