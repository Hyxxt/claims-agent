import { randomUUID } from "node:crypto";
import { chunkText, termFrequency, tokenize } from "./chunk";
import { dbAll, dbBatch, dbRun, type Statement } from "./db";
import { POLICY_DATA, policySections, type ClaimGuide } from "./samples";

type ChunkRow = {
  id: string;
  document_id: string;
  ordinal: number | bigint;
  text: string;
  token_count: number | bigint;
  title: string;
};

async function createDocument(input: {
  title: string;
  text: string;
  source?: string;
}): Promise<void> {
  const text = input.text.trim();
  if (!text) return;

  const chunks = chunkText(text);
  if (chunks.length === 0) return;

  const id = randomUUID();
  const source = input.source?.trim() || "seed";
  const createdAt = new Date().toISOString();

  const statements: Statement[] = [
    {
      sql: `INSERT INTO documents
        (id, title, source, created_at, char_count, chunk_count)
        VALUES (?, ?, ?, ?, ?, ?)`,
      args: [id, input.title, source, createdAt, text.length, chunks.length],
    },
  ];
  const termStatements: Statement[] = [];

  for (const [index, chunk] of chunks.entries()) {
    const chunkId = randomUUID();
    const tokens = tokenize(chunk);
    statements.push({
      sql: `INSERT INTO chunks (id, document_id, ordinal, text, token_count)
        VALUES (?, ?, ?, ?, ?)`,
      args: [chunkId, id, index + 1, chunk, tokens.length],
    });

    for (const [term, freq] of termFrequency(tokens)) {
      termStatements.push({
        sql: `INSERT INTO chunk_terms (chunk_id, term, freq) VALUES (?, ?, ?)`,
        args: [chunkId, term, freq],
      });
    }
  }

  await dbBatch(statements);
  for (let i = 0; i < termStatements.length; i += 400) {
    await dbBatch(termStatements.slice(i, i + 400));
  }
}

async function seedGuides(): Promise<void> {
  const rows = await dbAll(`SELECT COUNT(*) AS n FROM guides`);
  if (Number(rows[0]?.n ?? 0) > 0) return;

  for (const [index, guide] of POLICY_DATA.guides.entries()) {
    await dbRun(
      `INSERT INTO guides
        (id, claim_type, title, steps, materials, tips, ordinal)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        guide.claimType,
        guide.title,
        JSON.stringify(guide.steps),
        JSON.stringify(guide.materials),
        guide.tips,
        index + 1,
      ],
    );
  }
}

let autoSeedPromise: Promise<{ inserted: number }> | null = null;

/**
 * 线上没有持久磁盘时（AUTO_SEED=1），冷启动自动写入演示条款，
 * 避免演示站打开是空库。并发请求共用同一个 Promise，避免重复写入。
 */
export async function seedIfEmpty(): Promise<{ inserted: number }> {
  if (process.env.AUTO_SEED !== "1") return { inserted: 0 };

  if (!autoSeedPromise) {
    autoSeedPromise = (async () => {
      const rows = await dbAll(
        `SELECT COUNT(*) AS n FROM documents WHERE source = 'seed'`,
      );
      if (Number(rows[0]?.n ?? 0) > 0) {
        await seedGuides();
        return { inserted: 0 };
      }

      for (const document of policySections()) {
        await createDocument({
          title: document.title,
          text: document.chunks.join("\n\n"),
          source: "seed",
        });
      }
      await seedGuides();
      return { inserted: POLICY_DATA.documents.length };
    })().catch((error) => {
      autoSeedPromise = null;
      throw error;
    });
  }

  return autoSeedPromise;
}

export async function corpusStats(): Promise<{
  count: number;
  avgdl: number;
}> {
  const rows = await dbAll(
    `SELECT COUNT(*) AS n, COALESCE(AVG(token_count), 0) AS avgdl FROM chunks`,
  );
  return {
    count: Number(rows[0]?.n ?? 0),
    avgdl: Number(rows[0]?.avgdl ?? 0),
  };
}

export async function findTermRows(
  terms: string[],
): Promise<{ chunkId: string; term: string; freq: number }[]> {
  if (terms.length === 0) return [];

  const placeholders = terms.map(() => "?").join(",");
  const rows = await dbAll(
    `SELECT chunk_id, term, freq FROM chunk_terms WHERE term IN (${placeholders})`,
    terms,
  );

  return rows.map((row) => ({
    chunkId: String(row.chunk_id),
    term: String(row.term),
    freq: Number(row.freq),
  }));
}

export async function chunksWithTitles(ids: string[]): Promise<ChunkRow[]> {
  if (ids.length === 0) return [];

  const rows: ChunkRow[] = [];
  for (let i = 0; i < ids.length; i += 400) {
    const slice = ids.slice(i, i + 400);
    const placeholders = slice.map(() => "?").join(",");
    const batch = (await dbAll(
      `SELECT c.id, c.document_id, c.ordinal, c.text, c.token_count, d.title
       FROM chunks c JOIN documents d ON d.id = c.document_id
       WHERE c.id IN (${placeholders})`,
      slice,
    )) as unknown as ChunkRow[];
    rows.push(...batch);
  }
  return rows;
}

function mapGuide(row: Record<string, unknown>): ClaimGuide {
  return {
    claimType: String(row.claim_type),
    title: String(row.title),
    steps: JSON.parse(String(row.steps)) as string[],
    materials: JSON.parse(String(row.materials)) as string[],
    tips: String(row.tips),
  };
}

export async function getGuide(claimType: string): Promise<ClaimGuide | null> {
  const normalized = claimType.trim();
  if (!normalized) return null;

  const exact = await dbAll(
    `SELECT * FROM guides WHERE claim_type = ? LIMIT 1`,
    [normalized],
  );
  if (exact.length > 0) return mapGuide(exact[0]);

  const fuzzy = await dbAll(
    `SELECT * FROM guides WHERE claim_type LIKE ? ORDER BY ordinal LIMIT 1`,
    [`%${normalized}%`],
  );
  if (fuzzy.length > 0) return mapGuide(fuzzy[0]);

  return null;
}

export async function listGuides(): Promise<{ claimType: string; title: string }[]> {
  const rows = await dbAll(
    `SELECT claim_type, title FROM guides ORDER BY ordinal`,
  );
  return rows.map((row) => ({
    claimType: String(row.claim_type),
    title: String(row.title),
  }));
}
