/**
 * 理赔通 MCP Server（stdio）
 *
 * 把「演示条款检索 + 理赔流程查询」以 MCP 工具的形式暴露给
 * Claude Code / Cursor 等客户端，让 AI coding 工具能直接查条款。
 *
 * 运行：npm run mcp
 * Claude Code 配置示例（.mcp.json 或 claude mcp add）：
 *   {
 *     "mcpServers": {
 *       "claims-policy": {
 *         "command": "node",
 *         "args": ["D:/Claude/claims-agent/mcp/server.mjs"],
 *         "env": { "CLAIMS_DB_DIR": "D:/Claude/claims-agent/.data" }
 *       }
 *     }
 *   }
 */

import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const dir = process.env.CLAIMS_DB_DIR?.trim() || path.join(process.cwd(), ".data");
mkdirSync(dir, { recursive: true });
const db = new DatabaseSync(path.join(dir, "claims.db"));

db.exec(`
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  char_count INTEGER NOT NULL,
  chunk_count INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  text TEXT NOT NULL,
  token_count INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS chunk_terms (
  chunk_id TEXT NOT NULL,
  term TEXT NOT NULL,
  freq INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS guides (
  id TEXT PRIMARY KEY,
  claim_type TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  steps TEXT NOT NULL,
  materials TEXT NOT NULL,
  tips TEXT NOT NULL,
  ordinal INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chunk_terms_term ON chunk_terms(term);
`);

/** bigram 分词（与 Web 端 lib/chunk.ts 同一套逻辑） */
function tokenize(input) {
  const text = input.toLowerCase();
  const terms = [];
  for (const match of text.matchAll(/[a-z0-9][a-z0-9_-]*/g)) {
    if (match[0].length >= 2) terms.push(match[0]);
  }
  const runs = text.match(/[㐀-鿿豈-﫿]+/g) ?? [];
  for (const run of runs) {
    if (run.length === 1) {
      terms.push(run);
      continue;
    }
    for (let i = 0; i < run.length - 1; i += 1) {
      terms.push(run.slice(i, i + 2));
    }
  }
  return terms;
}

/** BM25 条款检索（与 Web 端 lib/retrieve.ts 同一套打分） */
function search(query, topK = 3) {
  const terms = [...new Set(tokenize(query))].slice(0, 40);
  if (terms.length === 0) return [];

  const stats = db
    .prepare(`SELECT COUNT(*) AS n, COALESCE(AVG(token_count),0) AS avgdl FROM chunks`)
    .get();
  if (!Number(stats?.n ?? 0)) return [];

  const placeholders = terms.map(() => "?").join(",");
  const rows = db
    .prepare(`SELECT chunk_id, term, freq FROM chunk_terms WHERE term IN (${placeholders})`)
    .all(...terms);
  if (rows.length === 0) return [];

  const byChunk = new Map();
  const documentFrequency = new Map();
  for (const row of rows) {
    let frequencies = byChunk.get(row.chunk_id);
    if (!frequencies) {
      frequencies = new Map();
      byChunk.set(row.chunk_id, frequencies);
    }
    frequencies.set(row.term, row.freq);
    documentFrequency.set(row.term, (documentFrequency.get(row.term) ?? 0) + 1);
  }

  const ids = [...byChunk.keys()];
  const chunkRows = db
    .prepare(
      `SELECT c.id, c.text, c.token_count, d.title
       FROM chunks c JOIN documents d ON d.id = c.document_id
       WHERE c.id IN (${ids.map(() => "?").join(",")})`,
    )
    .all(...ids);

  const count = Number(stats.n);
  const averageLength = Number(stats.avgdl) || 1;
  const k1 = 1.5;
  const b = 0.75;

  const scored = chunkRows.map((chunk) => {
    const frequencies = byChunk.get(String(chunk.id));
    if (!frequencies) return { chunk, score: 0 };
    const length = Number(chunk.token_count) || 1;
    let score = 0;
    for (const [term, freq] of frequencies) {
      const df = documentFrequency.get(term) ?? 1;
      const idf = Math.log(1 + (count - df + 0.5) / (df + 0.5));
      score +=
        (idf * (freq * (k1 + 1))) /
        (freq + k1 * (1 - b + (b * length) / averageLength));
    }
    return { chunk, score };
  });

  return scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((item) => ({ 条款来源: String(item.chunk.title), 条款片段: String(item.chunk.text) }));
}

/** 空库时从 data/policy.json 自动灌入演示条款 */
function seedIfEmpty() {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM documents`).get();
  if (Number(row?.n ?? 0) > 0) return;

  const file = path.join(process.cwd(), "data", "policy.json");
  const data = JSON.parse(readFileSync(file, "utf8"));

  const insertDoc = db.prepare(
    `INSERT INTO documents (id, title, source, created_at, char_count, chunk_count)
     VALUES (?, ?, 'seed', ?, ?, ?)`,
  );
  const insertChunk = db.prepare(
    `INSERT INTO chunks (id, document_id, ordinal, text, token_count) VALUES (?, ?, ?, ?, ?)`,
  );
  const insertTerm = db.prepare(
    `INSERT INTO chunk_terms (chunk_id, term, freq) VALUES (?, ?, ?)`,
  );
  const insertGuide = db.prepare(
    `INSERT OR IGNORE INTO guides (id, claim_type, title, steps, materials, tips, ordinal)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );

  for (const document of data.documents) {
    const docId = randomUUID();
    const sections = document.sections.map((s) => `${s.heading}\n${s.text}`);
    const text = sections.join("\n\n");
    insertDoc.run(docId, document.title, new Date().toISOString(), text.length, sections.length);
    for (const [index, section] of sections.entries()) {
      const chunkId = randomUUID();
      insertChunk.run(chunkId, docId, index + 1, section, tokenize(section).length);
      const freq = new Map();
      for (const term of tokenize(section)) {
        freq.set(term, (freq.get(term) ?? 0) + 1);
      }
      for (const [term, f] of freq) insertTerm.run(chunkId, term, f);
    }
  }

  for (const [index, guide] of data.guides.entries()) {
    insertGuide.run(
      randomUUID(),
      guide.claimType,
      guide.title,
      JSON.stringify(guide.steps),
      JSON.stringify(guide.materials),
      guide.tips,
      index + 1,
    );
  }
}

seedIfEmpty();

const server = new McpServer({ name: "claims-policy", version: "0.1.0" });

server.tool(
  "search_policy_terms",
  "检索「安心行综合意外险」（演示条款）原文：保障范围、赔付比例、免赔额、等待期、免责条款、理赔时限等",
  { query: z.string().describe("检索关键词或自然语言问题，例如「酒后驾驶 免责」") },
  async ({ query }) => {
    const results = search(query, 3);
    const text =
      results.length > 0
        ? JSON.stringify(results, null, 2)
        : "演示条款中没有检索到相关内容。";
    return { content: [{ type: "text", text }] };
  },
);

server.tool(
  "get_claim_guide",
  "获取某类理赔的办理流程与所需材料清单",
  {
    claim_type: z
      .enum(["意外医疗", "意外住院津贴", "意外伤残身故", "异地就医"])
      .describe("理赔类型"),
  },
  async ({ claim_type }) => {
    const guide = db
      .prepare(`SELECT * FROM guides WHERE claim_type = ?`)
      .get(claim_type);
    if (!guide) {
      return { content: [{ type: "text", text: "未找到该理赔类型。" }] };
    }
    const payload = {
      理赔类型: guide.claim_type,
      办理步骤: JSON.parse(guide.steps),
      所需材料: JSON.parse(guide.materials),
      注意事项: guide.tips,
    };
    return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
  },
);

server.tool(
  "list_claim_types",
  "列出支持查询的理赔类型",
  {},
  async () => {
    const rows = db
      .prepare(`SELECT claim_type, title FROM guides ORDER BY ordinal`)
      .all();
    const text = rows
      .map((row) => `${row.claim_type}：${row.title}`)
      .join("\n");
    return { content: [{ type: "text", text }] };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
