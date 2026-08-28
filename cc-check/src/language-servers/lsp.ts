import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  CallHierarchyIncomingCallsRequest,
  CallHierarchyPrepareRequest,
  ConfigurationRequest,
  createProtocolConnection,
  DefinitionRequest,
  DidChangeConfigurationNotification,
  DidCloseTextDocumentNotification,
  DidOpenTextDocumentNotification,
  DocumentSymbolRequest,
  ExitNotification,
  InitializeRequest,
  InitializedNotification,
  PositionEncodingKind,
  ReferencesRequest,
  ShutdownRequest,
  SymbolKind,
  type CallHierarchyIncomingCall,
  type CallHierarchyItem,
  type DocumentSymbol,
  type InitializeParams,
  type Location,
  type LocationLink,
  type Position,
  type ProtocolConnection,
  type Range,
  type SymbolInformation,
} from "vscode-languageserver-protocol/node";

import type {
  Caller,
  LanguageServer,
  SourcePosition,
  SourceRange,
} from "../language-server.js";

const REQUEST_TIMEOUT_MS = 30_000;
const SHUTDOWN_TIMEOUT_MS = 2_000;
const STDERR_LIMIT = 16_384;

export interface StdioLanguageServerOptions {
  command: string;
  args: string[];
  initializationOptions?: Record<string, unknown>;
  languageId: string;
  preloadFilePaths?: string[];
  settings?: Record<string, unknown>;
  workspaceRoot: string;
}

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string,
): Promise<T> => {
  let timeout: NodeJS.Timeout | undefined;
  const expired = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(
      () => reject(new Error(`Language server ${operation} timed out.`)),
      timeoutMs,
    );
  });

  try {
    return await Promise.race([promise, expired]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
};

const configurationValue = (
  settings: Record<string, unknown>,
  section: string | undefined,
): unknown => {
  if (!section) {
    return settings;
  }

  let value: unknown = settings;
  for (const key of section.split(".")) {
    if (typeof value !== "object" || value === null || !(key in value)) {
      return null;
    }
    value = (value as Record<string, unknown>)[key];
  }
  return value;
};

const toSourceRange = (uri: string, range: Range): SourceRange => ({
  filePath: fileURLToPath(uri),
  start: {
    line: range.start.line + 1,
    column: range.start.character + 1,
  },
  end: {
    line: range.end.line + 1,
    column: range.end.character + 1,
  },
});

const callerKey = (item: CallHierarchyItem): string =>
  [
    item.uri,
    item.selectionRange.start.line,
    item.selectionRange.start.character,
    item.selectionRange.end.line,
    item.selectionRange.end.character,
  ].join(":");

const rangeKey = (range: SourceRange): string =>
  [
    range.filePath,
    range.start.line,
    range.start.column,
    range.end.line,
    range.end.column,
  ].join(":");

const normalizeCallers = (calls: CallHierarchyIncomingCall[]): Caller[] => {
  const callers = new Map<string, Caller>();

  for (const call of calls) {
    const key = callerKey(call.from);
    const existing = callers.get(key);
    const callSites = call.fromRanges.map((range) =>
      toSourceRange(call.from.uri, range),
    );

    if (existing) {
      existing.callSites.push(...callSites);
      continue;
    }

    callers.set(key, {
      name: call.from.name,
      declaration: toSourceRange(call.from.uri, call.from.selectionRange),
      callSites,
    });
  }

  return [...callers.values()]
    .map((caller) => ({
      ...caller,
      callSites: [
        ...new Map(
          caller.callSites.map((callSite) => [rangeKey(callSite), callSite]),
        ).values(),
      ].sort(compareRanges),
    }))
    .sort((left, right) => compareRanges(left.declaration, right.declaration));
};

const normalizeReferences = (locations: Location[]): SourceRange[] =>
  [
    ...new Map(
      locations.map((location) => {
        const range = toSourceRange(location.uri, location.range);
        return [rangeKey(range), range];
      }),
    ).values(),
  ].sort(compareRanges);

const definitionRanges = (
  definition: Location | Location[] | LocationLink[] | null,
): SourceRange[] => {
  if (!definition) {
    return [];
  }
  const locations = Array.isArray(definition) ? definition : [definition];
  return locations.map((location) =>
    "targetUri" in location
      ? toSourceRange(
          location.targetUri,
          location.targetSelectionRange ?? location.targetRange,
        )
      : toSourceRange(location.uri, location.range),
  );
};

const compareRanges = (left: SourceRange, right: SourceRange): number =>
  left.filePath.localeCompare(right.filePath) ||
  left.start.line - right.start.line ||
  left.start.column - right.start.column ||
  left.end.line - right.end.line ||
  left.end.column - right.end.column;

const exactPosition = (position: SourcePosition, source: string): Position => {
  const lines = source.split(/\r\n|\r|\n/);
  const line = lines[position.line - 1];
  if (line === undefined) {
    throw new Error(
      `Line ${position.line} is outside ${position.filePath} (${lines.length} lines).`,
    );
  }

  if (position.column === undefined) {
    throw new Error("An exact source position requires a column.");
  }
  if (position.column > line.length + 1) {
    throw new Error(
      `Column ${position.column} is outside line ${position.line} of ${position.filePath}.`,
    );
  }

  return { line: position.line - 1, character: position.column - 1 };
};

const DECLARATION_KINDS = new Set<SymbolKind>([
  SymbolKind.Module,
  SymbolKind.Namespace,
  SymbolKind.Package,
  SymbolKind.Class,
  SymbolKind.Method,
  SymbolKind.Constructor,
  SymbolKind.Enum,
  SymbolKind.Interface,
  SymbolKind.Function,
  SymbolKind.Struct,
  SymbolKind.Event,
  SymbolKind.Operator,
]);

interface DeclarationCandidate {
  depth: number;
  kind: SymbolKind;
  range: Range;
  selectionRange: Range;
  uri: string;
}

const documentSymbolCandidates = (
  symbols: DocumentSymbol[],
  uri: string,
): DeclarationCandidate[] => {
  const candidates: DeclarationCandidate[] = [];

  const visit = (symbol: DocumentSymbol, depth: number): void => {
    candidates.push({
      depth,
      kind: symbol.kind,
      range: symbol.range,
      selectionRange: symbol.selectionRange,
      uri,
    });
    for (const child of symbol.children ?? []) {
      visit(child, depth + 1);
    }
  };

  for (const symbol of symbols) {
    visit(symbol, 0);
  }
  return candidates;
};

const symbolInformationCandidates = (
  symbols: SymbolInformation[],
): DeclarationCandidate[] =>
  symbols.map((symbol) => ({
    depth: 0,
    kind: symbol.kind,
    range: symbol.location.range,
    selectionRange: symbol.location.range,
    uri: symbol.location.uri,
  }));

const isDocumentSymbol = (
  symbol: DocumentSymbol | SymbolInformation,
): symbol is DocumentSymbol => "range" in symbol;

const rangeContainsLine = (range: Range, line: number): boolean =>
  range.start.line <= line && range.end.line >= line;

const rangeLineSpan = (range: Range): number =>
  range.end.line - range.start.line;

const enclosingDeclarationPosition = (
  symbols: DocumentSymbol[] | SymbolInformation[],
  uri: string,
  line: number,
): Position | undefined => {
  const candidates =
    symbols.length === 0
      ? []
      : isDocumentSymbol(symbols[0])
        ? documentSymbolCandidates(symbols as DocumentSymbol[], uri)
        : symbolInformationCandidates(symbols as SymbolInformation[]);

  return candidates
    .filter(
      (candidate) =>
        candidate.uri === uri &&
        DECLARATION_KINDS.has(candidate.kind) &&
        rangeContainsLine(candidate.range, line),
    )
    .sort(
      (left, right) =>
        right.depth - left.depth ||
        rangeLineSpan(left.range) - rangeLineSpan(right.range) ||
        right.range.start.line - left.range.start.line ||
        right.range.start.character - left.range.start.character,
    )[0]?.selectionRange.start;
};

class StdioLanguageServer implements LanguageServer {
  readonly #child: ChildProcessWithoutNullStreams;
  readonly #connection: ProtocolConnection;
  readonly #initializationOptions: Record<string, unknown> | undefined;
  readonly #languageId: string;
  readonly #preloadFilePaths: string[];
  readonly #settings: Record<string, unknown> | undefined;
  readonly #workspaceRoot: string;
  readonly #openDocuments = new Set<string>();
  #disposed = false;
  #stderr = "";

  constructor(
    child: ChildProcessWithoutNullStreams,
    connection: ProtocolConnection,
    options: StdioLanguageServerOptions,
  ) {
    this.#child = child;
    this.#connection = connection;
    this.#initializationOptions = options.initializationOptions;
    this.#languageId = options.languageId;
    this.#preloadFilePaths = options.preloadFilePaths ?? [];
    this.#settings = options.settings;
    this.#workspaceRoot = options.workspaceRoot;

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      this.#stderr = `${this.#stderr}${chunk}`.slice(-STDERR_LIMIT);
    });
  }

  async initialize(): Promise<void> {
    const workspaceUri = pathToFileURL(this.#workspaceRoot).href;
    if (this.#settings) {
      this.#connection.onRequest(ConfigurationRequest.type, (params) =>
        params.items.map((item) =>
          configurationValue(this.#settings ?? {}, item.section),
        ),
      );
    }
    const params: InitializeParams = {
      processId: process.pid,
      clientInfo: {
        name: "cc-check",
      },
      rootUri: workspaceUri,
      workspaceFolders: [
        {
          uri: workspaceUri,
          name: this.#workspaceRoot,
        },
      ],
      capabilities: {
        workspace: {
          configuration: this.#settings !== undefined,
        },
        general: {
          positionEncodings: [PositionEncodingKind.UTF16],
        },
        textDocument: {
          callHierarchy: {
            dynamicRegistration: false,
          },
          definition: {
            dynamicRegistration: false,
            linkSupport: true,
          },
          documentSymbol: {
            dynamicRegistration: false,
            hierarchicalDocumentSymbolSupport: true,
          },
          references: {
            dynamicRegistration: false,
          },
        },
      },
      initializationOptions: this.#initializationOptions,
    };

    const result = await withTimeout(
      this.#connection.sendRequest(InitializeRequest.type, params),
      REQUEST_TIMEOUT_MS,
      "initialization",
    );
    if (!result.capabilities.callHierarchyProvider) {
      throw new Error("Language server does not support call hierarchy.");
    }
    if (!result.capabilities.documentSymbolProvider) {
      throw new Error("Language server does not support document symbols.");
    }
    if (!result.capabilities.definitionProvider) {
      throw new Error("Language server does not support definitions.");
    }
    if (!result.capabilities.referencesProvider) {
      throw new Error("Language server does not support references.");
    }

    await this.#connection.sendNotification(InitializedNotification.type, {});
    if (this.#settings) {
      await this.#connection.sendNotification(
        DidChangeConfigurationNotification.type,
        { settings: this.#settings },
      );
    }
  }

  async #targetPosition(position: SourcePosition): Promise<{
    position: Position;
    uri: string;
  }> {
    if (this.#disposed) {
      throw new Error("Language server session has been disposed.");
    }

    for (const filePath of this.#preloadFilePaths) {
      await this.#openDocument(filePath);
    }
    const { source, uri } = await this.#openDocument(position.filePath);

    if (position.column !== undefined) {
      return { position: exactPosition(position, source), uri };
    }

    const symbols = await withTimeout(
      this.#connection.sendRequest(DocumentSymbolRequest.type, {
        textDocument: { uri },
      }),
      REQUEST_TIMEOUT_MS,
      "document symbol request",
    );
    const declaration = enclosingDeclarationPosition(
      symbols ?? [],
      uri,
      position.line - 1,
    );
    if (!declaration) {
      throw new Error(
        `No enclosing declaration found at ${position.filePath}:${position.line}.`,
      );
    }

    return { position: declaration, uri };
  }

  async #openDocument(filePath: string): Promise<{
    source: string;
    uri: string;
  }> {
    const source = await readFile(filePath, "utf8");
    const uri = pathToFileURL(filePath).href;
    if (this.#openDocuments.has(uri)) {
      return { source, uri };
    }
    await this.#connection.sendNotification(
      DidOpenTextDocumentNotification.type,
      {
        textDocument: {
          uri,
          languageId: this.#languageId,
          version: 1,
          text: source,
        },
      },
    );
    this.#openDocuments.add(uri);
    return { source, uri };
  }

  async callers(position: SourcePosition): Promise<Caller[]> {
    const target = await this.#targetPosition(position);
    const items = await withTimeout(
      this.#connection.sendRequest(CallHierarchyPrepareRequest.type, {
        textDocument: { uri: target.uri },
        position: target.position,
      }),
      REQUEST_TIMEOUT_MS,
      "call hierarchy preparation",
    );
    if (!items || items.length === 0) {
      throw new Error(
        `No callable declaration found at ${position.filePath}:${position.line}${
          position.column === undefined ? "" : `:${position.column}`
        }.`,
      );
    }

    const incoming = await Promise.all(
      items.map((item) =>
        withTimeout(
          this.#connection.sendRequest(CallHierarchyIncomingCallsRequest.type, {
            item,
          }),
          REQUEST_TIMEOUT_MS,
          "incoming calls request",
        ),
      ),
    );

    return normalizeCallers(incoming.flatMap((calls) => calls ?? []));
  }

  async references(position: SourcePosition): Promise<SourceRange[]> {
    const target = await this.#targetPosition(position);
    const [locations, definition] = await Promise.all([
      withTimeout(
        this.#connection.sendRequest(ReferencesRequest.type, {
          textDocument: { uri: target.uri },
          position: target.position,
          context: {
            includeDeclaration: false,
          },
        }),
        REQUEST_TIMEOUT_MS,
        "references request",
      ),
      withTimeout(
        this.#connection.sendRequest(DefinitionRequest.type, {
          textDocument: { uri: target.uri },
          position: target.position,
        }),
        REQUEST_TIMEOUT_MS,
        "definition request",
      ),
    ]);
    const definitions = new Set(
      definitionRanges(definition).map((range) => rangeKey(range)),
    );

    return normalizeReferences(locations ?? []).filter(
      (reference) => !definitions.has(rangeKey(reference)),
    );
  }

  async dispose(): Promise<void> {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;

    for (const uri of this.#openDocuments) {
      try {
        await this.#connection.sendNotification(
          DidCloseTextDocumentNotification.type,
          { textDocument: { uri } },
        );
      } catch {
        break;
      }
    }
    this.#openDocuments.clear();

    try {
      await withTimeout(
        this.#connection.sendRequest(ShutdownRequest.type),
        SHUTDOWN_TIMEOUT_MS,
        "shutdown",
      );
      await this.#connection.sendNotification(ExitNotification.type);
    } catch {
      // The process is terminated below if graceful shutdown is unavailable.
    } finally {
      this.#connection.dispose();
      if (this.#child.exitCode === null && this.#child.signalCode === null) {
        this.#child.kill();
      }
    }
  }

  errorContext(): string {
    return this.#stderr.trim();
  }
}

/**
 * @cc [author:spolu,label:architecture] stdio-lsp-lifecycle
 * Starting a stdio language server performs the LSP initialize handshake before returning. Failed
 * process startup or initialization terminates the child process and does not return a partial
 * session.
 */
export async function startStdioLanguageServer(
  options: StdioLanguageServerOptions,
): Promise<LanguageServer> {
  const child = spawn(options.command, options.args, {
    cwd: options.workspaceRoot,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const spawnFailure = new Promise<never>((_resolve, reject) => {
    child.once("error", (error) => {
      reject(
        new Error(
          `Failed to start language server "${options.command}": ${error.message}`,
          { cause: error },
        ),
      );
    });
  });
  const connection = createProtocolConnection(child.stdout, child.stdin);
  connection.listen();
  const server = new StdioLanguageServer(child, connection, options);

  try {
    await Promise.race([server.initialize(), spawnFailure]);
    return server;
  } catch (error) {
    const context = server.errorContext();
    await server.dispose();
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(context ? `${message}\n${context}` : message, {
      cause: error,
    });
  }
}
