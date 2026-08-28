import { extname } from "node:path";

import ts from "typescript";

const SCRIPT_KINDS = new Map<string, ts.ScriptKind>([
  [".ts", ts.ScriptKind.TS],
  [".tsx", ts.ScriptKind.TSX],
  [".mts", ts.ScriptKind.TS],
  [".cts", ts.ScriptKind.TS],
]);

export interface TypeScriptContractDocument {
  source: string;
  lineOffset: number;
  sourceColumns: number[];
}

export const typeScriptScriptKind = (
  filePath: string,
): ts.ScriptKind | undefined =>
  SCRIPT_KINDS.get(extname(filePath).toLowerCase());

const normalizeDocumentationCommentLines = (
  comment: string,
  firstLineColumn = 0,
): { source: string; sourceColumns: number[] } => {
  const body = comment.slice(3, -2);
  const sourceColumns: number[] = [];
  const source = body
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .split("\n")
    .map((line, index) => {
      if (index === 0) {
        const decorationLength = line.startsWith(" ") ? 1 : 0;
        sourceColumns.push(firstLineColumn + 4 + decorationLength);
        return line.slice(decorationLength);
      }
      const decorationLength = /^[ \t]*\* ?/.exec(line)?.[0].length ?? 0;
      sourceColumns.push(decorationLength + 1);
      return line.slice(decorationLength);
    })
    .join("\n");

  return { source, sourceColumns };
};

export const normalizeDocumentationComment = (comment: string): string =>
  normalizeDocumentationCommentLines(comment).source;

export const hasPotentialContractDirective = (source: string): boolean =>
  source.split("\n").some((line) => /^@cc(?![\p{L}\p{N}_])/u.test(line));

/**
 * @cc [author:spolu,label:architecture] typescript-contract-document-extraction
 * TypeScript file checks scan every `/**` documentation comment containing a potential `@cc`
 * directive, including comments not attached to a supported declaration. Comment delimiters and
 * leading `*` decorations are removed before the shared grammar parser receives the document.
 */
export function extractTypeScriptContractDocuments(
  filePath: string,
  source: string,
): TypeScriptContractDocument[] {
  const scriptKind = typeScriptScriptKind(filePath);
  if (scriptKind === undefined) {
    throw new Error(`Unsupported source file type: ${filePath}`);
  }

  const languageVariant =
    scriptKind === ts.ScriptKind.TSX
      ? ts.LanguageVariant.JSX
      : ts.LanguageVariant.Standard;
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    languageVariant,
    source,
  );
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );
  const documents: TypeScriptContractDocument[] = [];

  for (
    let token = scanner.scan();
    token !== ts.SyntaxKind.EndOfFileToken;
    token = scanner.scan()
  ) {
    if (token !== ts.SyntaxKind.MultiLineCommentTrivia) {
      continue;
    }

    const comment = scanner.getTokenText();
    if (!comment.startsWith("/**")) {
      continue;
    }
    const start = sourceFile.getLineAndCharacterOfPosition(
      scanner.getTokenPos(),
    );
    const normalized = normalizeDocumentationCommentLines(
      comment,
      start.character,
    );
    if (!hasPotentialContractDirective(normalized.source)) {
      continue;
    }

    documents.push({
      source: normalized.source,
      lineOffset: start.line,
      sourceColumns: normalized.sourceColumns,
    });
  }

  return documents;
}
