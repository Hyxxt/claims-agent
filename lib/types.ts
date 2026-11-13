export type Source = {
  index: number;
  chunkId: string;
  documentId: string;
  title: string;
  ordinal: number;
  text: string;
  score: number;
};

export type AgentStep = {
  tool: string;
  args: Record<string, unknown>;
  preview: string;
};

export type ChatResponse = {
  answer: string;
  steps: AgentStep[];
  sources: Source[];
};
