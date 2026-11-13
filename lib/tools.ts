import { retrieve } from "./retrieve";
import { getGuide } from "./store";
import type { Source } from "./types";

/**
 * Agent 工具集（OpenAI 兼容 function calling 格式）。
 * 只有两个工具，但覆盖了理赔咨询的核心链路：
 * 条款检索（RAG） + 流程查询（结构化知识）。
 */
export const AGENT_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "search_policy_terms",
      description:
        "检索保险条款原文。用自然语言描述想查的内容（如：免赔额、等待期、免责条款、异地就医），返回最相关的条款片段。回答关于保障范围、赔付比例、免责情形、理赔时限的问题前必须先调用本工具，严禁凭记忆编造条款。",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "检索关键词或问题，例如「酒后驾驶 免责」「意外医疗 免赔额」",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_claim_guide",
      description:
        "获取某类理赔的办理流程与所需材料清单。用户问到「怎么理赔」「需要什么材料」「流程是什么」时调用。claim_type 必须从列表中选择，找不到匹配时用「意外医疗」。",
      parameters: {
        type: "object",
        properties: {
          claim_type: {
            type: "string",
            enum: ["意外医疗", "意外住院津贴", "意外伤残身故", "异地就医"],
            description: "理赔类型",
          },
        },
        required: ["claim_type"],
      },
    },
  },
];

export type ToolResult = {
  text: string;
  sources?: Source[];
};

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  if (name === "search_policy_terms") {
    const query = typeof args.query === "string" ? args.query.trim() : "";
    if (!query) return { text: "检索词为空，请换一个更具体的问题重试。" };

    const sources = await retrieve(query, 3);
    if (sources.length === 0) {
      return { text: "演示条款中没有检索到相关内容。" };
    }

    return {
      text: JSON.stringify(
        sources.map((source) => ({
          条款来源: source.title,
          条款片段: source.text,
        })),
      ),
      sources,
    };
  }

  if (name === "get_claim_guide") {
    const claimType =
      typeof args.claim_type === "string" ? args.claim_type : "";
    const guide = await getGuide(claimType);
    if (!guide) {
      return { text: "没有找到该理赔类型的流程，可用的类型：意外医疗 / 意外住院津贴 / 意外伤残身故 / 异地就医。" };
    }
    return {
      text: JSON.stringify({
        理赔类型: guide.claimType,
        办理步骤: guide.steps,
        所需材料: guide.materials,
        注意事项: guide.tips,
      }),
    };
  }

  return { text: `未知工具：${name}` };
}
