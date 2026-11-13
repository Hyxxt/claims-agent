/**
 * MCP Server 冒烟测试：用 SDK 客户端连上 stdio server，
 * 列工具 → 调用条款检索 → 断言有结果。
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["mcp/server.mjs"],
  cwd: process.cwd(),
  env: { ...process.env },
});

const client = new Client({ name: "claims-mcp-smoke", version: "0.0.1" });

let failed = false;
try {
  await client.connect(transport);

  const tools = await client.listTools();
  console.log("tools:", tools.tools.map((tool) => tool.name).join(", "));

  const result = await client.callTool({
    name: "search_policy_terms",
    arguments: { query: "酒后驾驶 免责" },
  });
  const text = result.content.map((item) => item.text).join("\n");
  console.log("search result:", text.slice(0, 300));

  if (tools.tools.length < 3) {
    console.error("MCP FAILED: 工具数量不足");
    failed = true;
  } else if (!text.includes("免责")) {
    console.error("MCP FAILED: 条款检索结果不符合预期");
    failed = true;
  } else {
    console.log("MCP PASSED");
  }

  await client.close();
} catch (error) {
  console.error("MCP ERROR:", error);
  failed = true;
} finally {
  // client.close() 会关闭 stdio，server 子进程随 stdin 关闭自行退出；
  // 这里强制退出测试进程，避免任何残留句柄导致挂起。
  setTimeout(() => process.exit(failed ? 1 : 0), 500);
}
