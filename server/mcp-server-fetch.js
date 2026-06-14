// server/mcp-server-fetch.js
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

// 1. 初始化服务
const server = new Server(
  { name: "local-fetch-server", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// 2. 注册工具声明
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "fetch",
        description: "抓取并获取指定 URL 网页的 HTML、纯文本或 JSON 内容",
        inputSchema: {
          type: "object",
          properties: {
            url: { type: "string", description: "需要请求的完整网页链接 (例如 https://example.com)" }
          },
          required: ["url"]
        }
      }
    ]
  };
});

// 3. 编写真实的联网抓取逻辑
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "fetch") {
    const url = request.params.arguments?.url;
    
    try {
      console.error(`[MCP Fetching] 正在请求外网地址: ${url}`);
      
      // 🌟 利用 Node.js 原生自带的全局 fetch 
      const response = await fetch(url, {
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
        },
        signal: AbortSignal.timeout(8000) // 8秒超时防御，防止网络卡死 Agent
      });

      if (!response.ok) {
        throw new Error(`HTTP 错误! 状态码: ${response.status}`);
      }

      const htmlText = await response.text();
      
      // 截取前 15000 个字符，防止网页源码过长撑爆大模型的上下文（Token 溢出保护）
      const cleanedText = htmlText.length > 15000 
        ? htmlText.slice(0, 15000) + "\n...[内容过长，已截断]..."
        : htmlText;

      return {
        content: [{ type: "text", text: cleanedText }]
      };

    } catch (err) {
      console.error(`[MCP Fetch Error] 抓取 ${url} 失败:`, err.message);
      return {
        content: [{ type: "text", text: `抓取网页失败，错误原因: ${err.message}` }],
        isError: true
      };
    }
  }
  throw new Error("工具未找到");
});

// 4. 绑定管道
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[MCP] 本地 Fetch 服务已在标准 I/O 管道就绪！");