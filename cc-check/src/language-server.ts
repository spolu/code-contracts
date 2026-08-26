/**
 * @cc [author:spolu,label:architecture] source-position-coordinates
 * Source positions use absolute file paths and one-based lines and columns. A missing column
 * targets the innermost enclosing declaration; a provided column targets the symbol at that exact
 * position.
 */
export interface SourcePosition {
  filePath: string;
  line: number;
  column?: number;
}

/**
 * @cc [author:spolu,label:architecture] source-range-coordinates
 * Source ranges use absolute file paths and one-based coordinates, and their end position is
 * exclusive.
 */
export interface SourceRange {
  filePath: string;
  start: {
    line: number;
    column: number;
  };
  end: {
    line: number;
    column: number;
  };
}

/**
 * @cc [author:spolu,label:product] caller-result-semantics
 * Each caller represents one direct caller declaration. `callSites` contains every direct call
 * from that declaration to the target; transitive callers are not included.
 */
export interface Caller {
  name: string;
  declaration: SourceRange;
  callSites: SourceRange[];
}

/**
 * @cc [author:spolu,label:architecture] callers-interface-semantics
 * `callers` rejects locations that do not identify a call-hierarchy-capable declaration. An empty
 * result means that the identified declaration has no direct callers.
 */
/**
 * @cc [author:spolu,label:architecture] language-server-lifecycle
 * `dispose` is idempotent and releases every process and protocol resource owned by the session.
 * No operation is valid after disposal.
 */
/**
 * @cc [author:spolu,label:product] references-interface-semantics
 * `references` returns every statically recognized usage location for the selected declaration,
 * excluding the declaration itself. Results are deduplicated and sorted by source location.
 */
export interface LanguageServer {
  callers(position: SourcePosition): Promise<Caller[]>;
  references(position: SourcePosition): Promise<SourceRange[]>;
  dispose(): Promise<void>;
}

/**
 * @cc [author:spolu,label:architecture] uncached-language-server
 * Each factory call starts and initializes a fresh language-server process. Sessions are never
 * cached or reused across calls.
 */
export type LanguageServerFactory = (
  position: SourcePosition,
) => Promise<LanguageServer>;
