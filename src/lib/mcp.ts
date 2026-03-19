import fs from 'fs';
import path from 'path';
import { MCPRegistry, type ITool } from '@everworker/oneringai';

export const loadMCPTools = async (toolsRecord: Record<string, any>) => {
  const configPath = path.join(process.cwd(), 'mcp.json');
  if (!fs.existsSync(configPath)) return;

  try {
    const configContent = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configContent);

    for (const [serverName, serverConfig] of Object.entries(config.mcpServers || {})) {
      const { command, args, env } = serverConfig as any;
      console.log(`Connecting to MCP Server: ${serverName} via OneRingAI...`);
      
      const mcpClient = MCPRegistry.create({
        name: serverName,
        transport: 'stdio',
        transportConfig: {
          command,
          args,
          env: { ...process.env, ...env }
        }
      });

      await mcpClient.connect();
      
      // Discover and map tools to the toolsRecord
      const discoveredTools = mcpClient.listTools();
      for (const t of discoveredTools) {
        // We wrap it in the expected format for agent.ts if needed, 
        // but llm.ts now handles the conversion to OneRingAI tool format.
        toolsRecord[t.definition.function.name] = {
          name: t.definition.function.name,
          description: t.definition.function.description,
          parameters: t.definition.function.parameters,
          handler: t.execute
        };
        console.log(`Loaded MCP tool (OneRingAI): ${t.definition.function.name}`);
      }
    }
  } catch (err: any) {
    console.error('Error initializing MCP servers with OneRingAI:', err);
  }
};

