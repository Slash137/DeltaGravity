import fs from 'fs';
import path from 'path';

const normalizeDiscoveredTools = (discoveredTools: any): any[] => {
  if (Array.isArray(discoveredTools)) {
    return discoveredTools;
  }
  if (Array.isArray(discoveredTools?.tools)) {
    return discoveredTools.tools;
  }
  if (Array.isArray(discoveredTools?.data)) {
    return discoveredTools.data;
  }
  return [];
};

export const loadMCPTools = async (toolsRecord: Record<string, any>) => {
  const configPath = path.join(process.cwd(), 'mcp.json');
  if (!fs.existsSync(configPath)) return;

  try {
    const { MCPRegistry } = await import('@everworker/oneringai');
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
      const discoveredTools = normalizeDiscoveredTools(await mcpClient.listTools());
      for (const t of discoveredTools) {
        // We wrap it in the expected format for agent.ts if needed, 
        // but llm.ts now handles the conversion to OneRingAI tool format.
        const definition = t?.definition?.function ?? t?.function ?? t;
        const execute = t?.execute ?? t?.handler;
        if (!definition?.name || typeof execute !== 'function') {
          continue;
        }

        toolsRecord[definition.name] = {
          name: definition.name,
          description: definition.description,
          parameters: definition.parameters,
          handler: execute
        };
        console.log(`Loaded MCP tool (OneRingAI): ${definition.name}`);
      }
    }
  } catch (err: any) {
    console.error('Error initializing MCP servers with OneRingAI:', err);
  }
};
