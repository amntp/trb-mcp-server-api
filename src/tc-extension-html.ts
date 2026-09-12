import { createTcExtensionHtml as createTcExtensionHtmlBase } from "./tc-extension-html-base.js";
import { injectAgentEyesFilter } from "./agent-eyes-filter.js";

export function createTcExtensionHtml(): string {
  return injectAgentEyesFilter(createTcExtensionHtmlBase());
}
