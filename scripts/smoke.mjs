/**
 * 冒烟测试：启动 next start，向 /api/chat 发一条真实问题，
 * 断言返回了答案且 Agent 至少调用过一次工具。
 */

import { spawn, spawnSync } from "node:child_process";

const PORT = 3210;
const BASE = `http://127.0.0.1:${PORT}`;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(timeoutMs = 90000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`${BASE}/`);
      if (response.ok) return;
    } catch {
      // 还没起来，继续等
    }
    await wait(1000);
  }
  throw new Error("服务器启动超时");
}

const child = spawn("npm", ["run", "start", "--", "-p", String(PORT)], {
  cwd: process.cwd(),
  shell: true,
  stdio: "inherit",
  env: { ...process.env, PORT: String(PORT), AUTO_SEED: "1" },
});

let failed = false;

try {
  await waitForServer();

  const question =
    process.argv[2] ??
    "我骑车摔伤去医院缝了三针，花了800元，能报销吗？怎么申请？";
  const response = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  const data = await response.json();

  console.log("HTTP", response.status);
  console.log(
    "steps:",
    Array.isArray(data.steps) ? data.steps.length : 0,
    "| sources:",
    Array.isArray(data.sources) ? data.sources.length : 0,
  );
  console.log("answer:", String(data.answer ?? "").slice(0, 400));

  if (!response.ok) {
    console.error("SMOKE FAILED: 非 200 响应", data.error ?? "");
    failed = true;
  } else if (!data.answer || typeof data.answer !== "string") {
    console.error("SMOKE FAILED: 没有答案");
    failed = true;
  } else if (!Array.isArray(data.steps) || data.steps.length === 0) {
    console.error("SMOKE FAILED: Agent 没有调用任何工具");
    failed = true;
  } else {
    console.log("SMOKE PASSED");
  }
} catch (error) {
  console.error("SMOKE ERROR:", error);
  failed = true;
} finally {
  if (child.pid) {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
    });
  }
}

process.exit(failed ? 1 : 0);
