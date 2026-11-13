"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AgentStep, Source } from "@/lib/types";

type Message = { role: "user" | "assistant"; text: string };

const EXAMPLES = [
  "我骑车摔伤去医院缝了三针，花了 800 元，能报销吗？怎么申请？",
  "朋友酒后开车出了事故受伤，能理赔吗？",
  "在外地出差时意外住院了，可以理赔吗？需要什么材料？",
];

function renderInline(line: string): ReactNode {
  const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={index} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={index}
          className="rounded bg-slate-100 px-1 py-0.5 text-[0.85em] text-slate-700"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

function renderBlock(text: string): ReactNode {
  const lines = text.split("\n");
  const out: ReactNode[] = [];
  let list: string[] = [];
  let key = 0;

  const flush = () => {
    if (list.length > 0) {
      out.push(
        <ul key={`ul-${key++}`} className="space-y-1.5">
          {list.map((item, index) => (
            <li key={index} className="flex gap-2">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-indigo-400" />
              <span>{renderInline(item)}</span>
            </li>
          ))}
        </ul>,
      );
      list = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    const bullet = line.match(/^(?:[-*•]|\d+[.)、])\s*(.*)$/);
    if (bullet) {
      list.push(bullet[1]);
      continue;
    }
    flush();
    if (line) {
      out.push(<p key={`p-${key++}`}>{renderInline(line)}</p>);
    }
  }
  flush();

  return <div className="space-y-2.5">{out}</div>;
}

function Typewriter({ text }: { text: string }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    setCount(0);
    const timer = setInterval(() => {
      setCount((previous) => {
        if (previous >= text.length) {
          clearInterval(timer);
          return previous;
        }
        return previous + 4;
      });
    }, 24);
    return () => clearInterval(timer);
  }, [text]);

  return <>{renderBlock(text.slice(0, count))}</>;
}

function StepCard({ step, index }: { step: AgentStep; index: number }) {
  const toolName =
    step.tool === "search_policy_terms"
      ? "条款检索"
      : step.tool === "get_claim_guide"
        ? "流程查询"
        : step.tool;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-md bg-indigo-50 px-2 py-0.5 font-mono text-[11px] font-medium text-indigo-700">
          {toolName}
        </span>
        <span className="text-[11px] text-slate-400">step {index + 1}</span>
      </div>
      <p className="mt-2 break-all font-mono text-[11px] leading-relaxed text-slate-500">
        参数 {JSON.stringify(step.args)}
      </p>
      <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-2.5 font-mono text-[11px] leading-relaxed text-slate-600">
        {step.preview}
      </pre>
    </div>
  );
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // ?demo=1：自动跑一遍示例问题，用于截图 / 一键演示
  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("demo")) {
      ask(EXAMPLES[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function ask(question: string) {
    const text = question.trim();
    if (!text || loading) return;

    setMessages((previous) => [...previous, { role: "user", text }]);
    setInput("");
    setLoading(true);
    setError("");
    setSteps([]);
    setSources([]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      const data = (await response.json()) as {
        answer?: string;
        steps?: AgentStep[];
        sources?: Source[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "请求失败");
      }
      setSteps(data.steps ?? []);
      setSources(data.sources ?? []);
      setMessages((previous) => [
        ...previous,
        { role: "assistant", text: data.answer ?? "（没有返回内容）" },
      ]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "请求失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-800 bg-slate-900 text-white">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-sky-500 text-lg shadow-md shadow-indigo-500/30">
              🛡️
            </span>
            <div className="leading-tight">
              <h1 className="text-base font-semibold tracking-tight">
                理赔通 · 保险理赔 AI Agent
              </h1>
              <p className="text-[11px] text-slate-400">
                DeepSeek function calling · BM25 条款检索 · 可视化工作流
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden rounded-full border border-amber-300/30 bg-amber-400/10 px-2.5 py-1 text-[11px] font-medium text-amber-300 sm:inline-flex">
              演示数据 · 非真实条款
            </span>
            <a
              href="https://github.com/Hyxxt"
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-slate-700 px-2.5 py-1 text-[11px] text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
            >
              GitHub ↗
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row">
        {/* 对话区 */}
        <section className="flex min-h-[480px] flex-1 flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
            {messages.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center gap-4 py-10 text-center">
                <p className="text-sm text-slate-500">
                  描述你的事故经过，Agent 会自己查条款、找流程，一步步回答你
                </p>
                <div className="flex flex-col gap-2">
                  {EXAMPLES.map((example) => (
                    <button
                      key={example}
                      type="button"
                      onClick={() => ask(example)}
                      disabled={loading}
                      className="rounded-full border border-indigo-100 bg-indigo-50/60 px-4 py-2 text-left text-[13px] text-indigo-700 transition-colors hover:bg-indigo-100 disabled:opacity-50"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message, index) =>
              message.role === "user" ? (
                <div key={index} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-indigo-600 px-4 py-2.5 text-sm leading-relaxed text-white">
                    {message.text}
                  </div>
                </div>
              ) : (
                <div key={index} className="flex justify-start">
                  <div className="max-w-[92%] rounded-2xl rounded-bl-sm border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-800">
                    <Typewriter text={message.text} />
                  </div>
                </div>
              ),
            )}

            {loading && (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <span className="flex gap-1">
                  <span className="size-1.5 animate-bounce rounded-full bg-indigo-400 [animation-delay:0ms]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-indigo-400 [animation-delay:120ms]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-indigo-400 [animation-delay:240ms]" />
                </span>
                Agent 正在检索条款与理赔流程…
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <form
            className="border-t border-slate-200 p-3 sm:p-4"
            onSubmit={(event) => {
              event.preventDefault();
              ask(input);
            }}
          >
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    ask(input);
                  }
                }}
                rows={2}
                maxLength={300}
                placeholder="描述事故经过，例如：上周骑车摔伤，门诊花了 600 元…"
                className="flex-1 resize-none rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                发送
              </button>
            </div>
          </form>
        </section>

        {/* Agent 工作流面板 */}
        <aside className="w-full shrink-0 space-y-4 lg:w-96">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <span className="flex size-5 items-center justify-center rounded-md bg-slate-900 text-[10px] text-white">
                A
              </span>
              Agent 工作流
              <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-normal text-slate-500">
                {steps.length} 步
              </span>
            </h2>

            <div className="mt-3 space-y-2.5">
              {steps.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-xs leading-relaxed text-slate-400">
                  右侧每一步都是 Agent 真实的工具调用
                  <br />
                  先提一个问题试试
                </div>
              )}
              {steps.map((step, index) => (
                <StepCard key={`${index}-${step.tool}`} step={step} index={index} />
              ))}
            </div>
          </div>

          {sources.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-800">
                引用条款
                <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-normal text-slate-500">
                  {sources.length} 条
                </span>
              </h2>
              <div className="mt-3 space-y-2">
                {sources.map((source) => (
                  <div
                    key={source.chunkId}
                    className="rounded-xl border border-slate-100 bg-slate-50 p-3"
                  >
                    <p className="text-[11px] font-medium text-slate-500">
                      {source.title} · 第 {source.ordinal} 段
                    </p>
                    <p className="mt-1.5 line-clamp-4 text-xs leading-relaxed text-slate-600">
                      {source.text}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-4 text-[11px] leading-relaxed text-slate-400 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            ⚠️ 本演示使用虚构条款「安心行综合意外险」，不构成任何投保或理赔建议
          </p>
          <p>Next.js + node:sqlite · BM25 RAG · 内置 MCP Server</p>
        </div>
      </footer>
    </div>
  );
}
