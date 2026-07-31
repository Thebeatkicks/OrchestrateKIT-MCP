import type { McpServer } from "@modelcontextprotocol/server";
import { registerPlaybookResources } from "./playbookResources.js";

export function registerResources(server: McpServer): void {
  registerPlaybookResources(server);
}
