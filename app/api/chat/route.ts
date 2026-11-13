import { connection } from "next/server";
import { runAgent } from "@/lib/agent";
import { seedIfEmpty } from "@/lib/store";

export const maxDuration = 60;

export async function POST(request: Request) {
  await connection();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const { question } = (body ?? {}) as { question?: unknown };
  const cleanQuestion = typeof question === "string" ? question.trim() : "";

  if (!cleanQuestion) {
    return Response.json({ error: "请输入问题" }, { status: 400 });
  }
  if (cleanQuestion.length > 300) {
    return Response.json({ error: "问题不能超过 300 字" }, { status: 400 });
  }

  try {
    // 冷启动直接调 API 时也要先补演示条款，否则会检索到空库。
    await seedIfEmpty();
    const result = await runAgent(cleanQuestion);
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "处理失败" },
      { status: 500 },
    );
  }
}
