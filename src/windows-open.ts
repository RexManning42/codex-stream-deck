import { spawn } from "node:child_process";
import { join } from "node:path";

const THREAD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function codexThreadUrl(threadId: string): string {
  if (threadId !== "new" && !THREAD_ID.test(threadId)) {
    throw new Error(`Ungültige Codex-Task-ID: ${threadId}`);
  }
  return `codex://threads/${threadId}`;
}

export function openCodexThread(threadId: string): Promise<void> {
  const url = codexThreadUrl(threadId);
  if (process.platform !== "win32") {
    return Promise.reject(new Error("Der native Codex-Link ist derzeit nur unter Windows implementiert."));
  }

  const systemRoot = process.env.SystemRoot ?? "C:\\Windows";
  const powershell = join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const command = `Start-Process -FilePath '${url}'`;

  return new Promise((resolve, reject) => {
    const child = spawn(powershell, ["-NoLogo", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", command], {
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"]
    });
    let errorOutput = "";
    child.stderr.on("data", (data) => { errorOutput += String(data); });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Codex-Link konnte nicht geöffnet werden (${code ?? "unbekannt"}): ${errorOutput.trim()}`));
    });
  });
}
