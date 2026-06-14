// server/src/mcp/mcpManager.ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export class MCPManager {
  private clients: Map<string, Client> = new Map();

  async connectServer(name: string, command: string, args: string[]) {
    try {
      const transport = new StdioClientTransport({ command, args });
      const client = new Client({ name: 'sandbox-client', version: '1.0.0' }, { capabilities: {} });
      await client.connect(transport);
      this.clients.set(name, client);
      console.log(`[MCP] Server [${name}] 已成功连接`);
    } catch (err) {
      console.error(`[MCP] 连接 Server [${name}] 失败:`, err);
    }
  }

  async getAllTools() {
    const allTools = [];
    for (const [name, client] of this.clients) {
      const response = await client.listTools();
      allTools.push(...(response.tools || []).map(t => ({ ...t, _mcpServer: name })));
    }
    return allTools;
  }

  async callTool(serverName: string, toolName: string, args: any) {
    const client = this.clients.get(serverName);
    if (!client) throw new Error(`MCP Server ${serverName} 未连接`);
    return await client.callTool({ name: toolName, arguments: args });
  }
}
export const mcpManager = new MCPManager();