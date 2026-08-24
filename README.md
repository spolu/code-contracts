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

### Open Questions

- Syntax and placement:
  - See JML https://www.openjml.org/tutorial/Syntax (syntax for logical conditions)
  - See Doxygen https://www.doxygen.nl/manual/requirements.html (@requirement)
  - See EARS https://alistairmavin.com/ears/ (system requirements)
  - See BCP 14 https://www.rfc-editor.org/info/bcp14 (requirement levels)
  - See Gherkin https://cucumber.io/docs/gherkin/reference/ (feature files)
  - See OpenFastTrace
    https://github.com/itsallcode/openfasttrace/blob/main/doc/user_guide/user_guide.md (product
    requirement files)
  - See Sphinx-Needs: https://sphinx-needs.readthedocs.io/en/stable/index.html (doc as code and
    requirement)

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
directive defines one code contract and is attached to the next class, function, method, or other
declaration in the source file.

The grammar uses ISO-style EBNF. `SP` is one or more spaces and `NL` is a line break. Comment
delimiters and decorations such as `/**`, `*/`, `///`, and leading `*` are removed before parsing.

```ebnf
contract      = directive, NL, prose ;
directive     = "@cc", SP, [ metadata, SP ], contract_id ;

metadata      = "[", attribute, { ",", attribute }, "]" ;
attribute     = key, ":", value ;

contract_id   = token ;
key           = token ;
value         = token ;
prose         = prose_character, { prose_character } ;
```

`token` is a non-empty sequence without whitespace, commas, colons, or square brackets. Metadata
keys are extensible; `author` and `label` are initially well-known, and `label` may occur more than
once.

The prose body is non-empty and extends to the end of the documentation comment. It may contain any
text and span any number of lines. The core format does not prescribe vocabulary, sentence shape,
modality, or a requirements notation. Authoring skills and analysis tools may recommend conventions
such as EARS or BCP 14 without changing what constitutes a valid code contract.

A documentation comment contains one `@cc` directive. Multiple consecutive contract comments may
attach to the same declaration, as in the example above. Contract IDs are unique and stable within
a repository; moving or reimplementing the attached declaration does not change its contract IDs.
