import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fs from 'fs';
import path from 'path';
import type { Tool } from './tools.js';

export const loadMCPTools = async (toolsRecord: Record<string, Tool>) => {
  const configPath = path.join(process.cwd(), 'mcp.json');
  if (!fs.existsSync(configPath)) return;

  try {
    const configContent = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configContent);

    for (const [serverName, serverConfig] of Object.entries(config.mcpServers || {})) {
      const { command, args, env } = serverConfig as any;
      console.log(`Connecting to MCP Server: ${serverName}...`);
      
      const transport = new StdioClientTransport({
        command,
        args,
        env: { ...process.env, ...env }
      });

      const client = new Client(
        { name: "DeltaGravity", version: "1.0.0" },
        { capabilities: {} }
      );

      await client.connect(transport);
      
      const serverTools = await client.listTools();
      
      for (const t of serverTools.tools) {
        toolsRecord[t.name] = {
          name: t.name,
          description: `[MCP: ${serverName}] ${t.description || ''}`,
          parameters: t.inputSchema,
          handler: async (callArgs: any) => {
            const result = await client.callTool({
              name: t.name,
              arguments: callArgs
            });
            // Result content is an array of parts
            return (result.content as any[]).map((c: any) => c.text).join('\n');
          }
        };
        console.log(`Loaded MCP tool: ${t.name}`);
      }
    }
  } catch (err: any) {
    console.error('Error initializing MCP servers:', err);
  }
};
