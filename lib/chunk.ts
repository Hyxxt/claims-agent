/**
 * 文本切块与词法索引。
 *
 * 中文没有空格，这里用「字符二元组」（bigram）建倒排索引：
 * 「酒后驾驶」→ 酒后 / 后驾 / 驾驶。英文和数字按单词处理。
 * 不依赖分词服务和向量模型，SQLite 就能跑。
 */

export function normalizeText(input: string): string {
  return input
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function tokenize(input: string): string[] {
  const text = input.toLowerCase();
  const terms: string[] = [];

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

export function termFrequency(tokens: string[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const token of tokens) {
    freq.set(token, (freq.get(token) ?? 0) + 1);
  }
  return freq;
}

export function chunkText(input: string, maxChars = 520): string[] {
  const text = normalizeText(input);
  if (!text) return [];
  if (text.length <= maxChars) return [text];

  const pieces = text.split(/(?<=[。！？!?；;])/);
  const chunks: string[] = [];
  let current = "";

  for (const piece of pieces) {
    if (current.length + piece.length <= maxChars) {
      current += piece;
      continue;
    }
    if (current) chunks.push(current);
    current = piece;
  }
  if (current) chunks.push(current);

  return chunks.map((chunk) => chunk.trim()).filter(Boolean);
}
