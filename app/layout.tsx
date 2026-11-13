import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "理赔通 · 保险理赔 AI Agent（演示）",
  description:
    "自测项目：DeepSeek function calling + BM25 条款检索（RAG）+ 可视化 Agent 工作流 + 内置 MCP Server，保险理赔咨询 Demo。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full bg-slate-50">{children}</body>
    </html>
  );
}
