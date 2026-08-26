import type {
  LanguageServer,
  LanguageServerFactory,
  SourcePosition,
} from "../language-server.js";
import { startTypeScriptLanguageServer } from "./typescript.js";

/**
 * @cc [author:spolu,label:architecture] language-adapter-selection
 * Language selection is isolated in this factory. Callers and other consumers depend only on the
 * language-agnostic `LanguageServer` interface.
 */
export const startLanguageServer: LanguageServerFactory = async (
  position: SourcePosition,
): Promise<LanguageServer> => startTypeScriptLanguageServer(position);
