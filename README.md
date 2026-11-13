# 理赔通 · 保险理赔 AI Agent（演示）

> 用户描述事故 → Agent 自主检索条款、查询理赔流程 → 带条款引用地回答。
> 每一步工具调用都在界面上可视化，还内置了一个可被 Claude Code / Cursor 直接调用的 **MCP Server**。

**在线演示**：<https://claims-agent.onrender.com>（Render 免费实例，冷启动约 1 分钟）

⚠️ 本项目的保险条款为**虚构的演示数据**（「安心行综合意外险」），不构成任何投保或理赔建议。

---

## 为什么做这个

针对保险业务场景做的一个「AI Agent 工作流」完整 demo，覆盖：

- **Agent 工具调用**：DeepSeek function calling，Agent 自己决定何时查条款、何时查流程，多轮工具调用（最多 6 轮）
- **RAG 条款检索**：中文 bigram 倒排索引 + BM25 打分，零向量服务、零外部依赖，SQLite 就能跑
- **可视化工作流**：每一次工具调用（工具名、参数、返回结果）实时展示在右侧面板
- **MCP Server**：同一套条款检索能力以 MCP 工具形式暴露给 AI coding 工具（`npm run mcp`）
- **免责场景处理**：酒驾、高风险运动等免责情形，Agent 会明确拒赔并引用条款，不给虚假希望

## Agent 工作流

```
用户描述事故
    │
    ▼
┌──────────────────────┐
│  DeepSeek function   │
│  calling（多轮）      │
└──────┬───────────────┘
       │  工具调用
       ├──▶ search_policy_terms ──▶ bigram 倒排索引 + BM25 ──▶ 条款片段（带条款号）
       │
       └──▶ get_claim_guide ──────▶ 理赔步骤 + 材料清单（结构化知识）
       │
       ▼
带条款引用、分点式的最终回答（结论 → 依据 → 下一步）
```

## 技术栈

| 层 | 选型 |
|---|---|
| 前端 | Next.js 16（App Router）+ React 19 + Tailwind CSS 4 |
| 后端 | Next.js Route Handlers（`/api/chat`） |
| LLM | DeepSeek（OpenAI 兼容接口，`deepseek-chat`，可用 `LLM_*` 环境变量换成任意兼容模型） |
| 检索 | 中文 bigram 倒排索引 + BM25（k1=1.5, b=0.75） |
| 存储 | node:sqlite（本地 `.data/claims.db`，零配置） |
| MCP | @modelcontextprotocol/sdk（stdio server，独立可运行） |

## 本地运行

```bash
npm install
# 复制 .env.example 为 .env.local，填入 LLM_API_KEY
npm run dev
```

打开 http://localhost:3000，可以直接问：

- 「我骑车摔伤去医院缝了三针，花了 800 元，能报销吗？怎么申请？」
- 「朋友酒后开车出了事故受伤，能理赔吗？」
- 「在外地出差时意外住院了，可以理赔吗？需要什么材料？」

冒烟测试（启动服务 → 发真实问题 → 断言 Agent 调用了工具且有答案）：

```bash
npm run build
node scripts/smoke.mjs                # 默认问题
node scripts/smoke.mjs "酒驾能理赔吗"   # 自定义问题
```

## MCP Server

把条款检索暴露给 Claude Code / Cursor 等 AI coding 工具：

```bash
npm run mcp
```

Claude Code 配置（`claude mcp add` 或 `.mcp.json`）：

```json
{
  "mcpServers": {
    "claims-policy": {
      "command": "node",
      "args": ["D:/Claude/claims-agent/mcp/server.mjs"],
      "env": { "CLAIMS_DB_DIR": "D:/Claude/claims-agent/.data" }
    }
  }
}
```

提供的工具：

| 工具 | 说明 |
|---|---|
| `search_policy_terms` | BM25 检索演示条款原文 |
| `get_claim_guide` | 意外医疗 / 住院津贴 / 伤残身故 / 异地就医的办理流程与材料清单 |
| `list_claim_types` | 列出支持的理赔类型 |

测试：`node scripts/test-mcp.mjs`

## 部署 Render

仓库根目录自带 `render.yaml` Blueprint，Render 上「New → Blueprint」选择本仓库即可；或手动建 Web Service：

- Build Command: `npm install && npm run build`
- Start Command: `npm run start -- -p $PORT`
- 环境变量：`LLM_BASE_URL`、`LLM_MODEL=deepseek-chat`、`LLM_API_KEY`（secret）、`AUTO_SEED=1`

Render 免费实例无持久磁盘，`AUTO_SEED=1` 会在冷启动时自动写入演示条款，保证演示站打开就能用。

## 目录结构

```
app/
  page.tsx              # 聊天界面 + Agent 工作流可视化面板
  api/chat/route.ts     # 对话接口（多轮工具调用）
lib/
  agent.ts              # function calling 循环
  tools.ts              # 工具定义与执行（条款检索 / 流程查询）
  retrieve.ts           # BM25 检索
  chunk.ts              # bigram 分词与切块
  store.ts / db.ts      # SQLite 存取与自动种子数据
data/policy.json        # 演示条款与理赔流程（唯一数据源）
mcp/server.mjs          # 独立可运行的 MCP stdio server
scripts/                # 冒烟测试
```

## License

MIT
