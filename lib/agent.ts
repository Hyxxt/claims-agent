import { AGENT_TOOLS, executeTool } from "./tools";
import type { AgentStep, ChatResponse, Source } from "./types";

const SYSTEM_PROMPT = `你是「理赔通」，一款保险理赔顾问 AI Agent，服务对象是「安心行综合意外险」（演示产品）的投保用户。

工作方式（必须遵守）：
1. 用户会描述事故经过或提出理赔问题。你必须通过调用工具获取条款原文或理赔流程，再基于工具返回的内容回答。
2. 涉及保障范围、赔付比例、免赔额、等待期、免责情形、理赔时限，先调用 search_policy_terms。
3. 用户问「怎么理赔 / 走什么流程 / 需要什么材料」，调用 get_claim_guide。
4. 回答格式：先给结论，再引用依据（标明条款号，如【第一条】），最后给下一步行动建议。使用 Markdown，简洁分点。
5. 严禁编造条款或流程。工具检索不到时，如实说明「演示条款中没有查到」，并建议拨打演示客服热线 400-000-0000 咨询。
6. 明显属于免责情形的（酒后驾驶、无证驾驶、高风险运动等），必须明确告知「按条款属于免责情形，无法理赔」，不要给虚假希望。
7. 本产品是虚构的演示产品，回答中如涉及具体数字，只能来自工具返回的条款内容。`;

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
};

type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

const MAX_TOOL_ROUNDS = 6;

export async function runAgent(question: string): Promise<ChatResponse> {
  const baseUrl = (process.env.LLM_BASE_URL ?? "https://api.deepseek.com/v1")
    .trim()
    .replace(/\/+$/, "");
  const apiKey = process.env.LLM_API_KEY?.trim() ?? "";
  const model = process.env.LLM_MODEL?.trim() || "deepseek-chat";

  if (!apiKey) throw new Error("LLM_API_KEY 未配置");

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: question },
  ];
  const steps: AgentStep[] = [];
  const sources: Source[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        tools: AGENT_TOOLS,
        tool_choice: "auto",
        temperature: 0.2,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`LLM 接口错误 ${response.status}: ${detail.slice(0, 200)}`);
    }

    const data = (await response.json()) as {
      choices?: { message?: ChatMessage }[];
    };
    const message = data.choices?.[0]?.message;
    if (!message) throw new Error("LLM 返回为空");

    messages.push(message);

    const toolCalls = message.tool_calls ?? [];
    if (toolCalls.length > 0) {
      for (const call of toolCalls) {
        const name = call.function.name;
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || "{}") as Record<
            string,
            unknown
          >;
        } catch {
          // 参数解析失败时用空参数重试
        }

        const result = await executeTool(name, args);
        const preview =
          result.text.length > 240
            ? `${result.text.slice(0, 240)}…`
            : result.text;

        steps.push({ tool: name, args, preview });
        if (result.sources) sources.push(...result.sources);

        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: result.text,
        });
      }
      continue;
    }

    const answer = message.content?.trim() ?? "";
    if (!answer) throw new Error("LLM 未返回内容");
    return { answer, steps, sources };
  }

  throw new Error("Agent 超过最大工具调用轮数，请换个问法再试");
}
