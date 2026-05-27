#!/usr/bin/env node
/**
 * Build iwa-e2 and produce a hub-ready artifact under dist/.
 *
 *   dist/
 *   - index.html / assets / stockfish / textures / ui / gltf / audio / ...
 *   - journal/
 *     - session.jsonl         copied from .codex/journal/session-{id}.jsonl
 *     - stats.json            aggregated from the Codex journal
 *     - checkpoints/<flat>    copied from .codex/journal/checkpoints/{id}/ when present
 *
 * Usage:
 *   pnpm package:hub
 *   node scripts/package-for-hub.mjs [--session-id <uuid>] [--base /path/] [--slug iwa-e2]
 */

import { spawn } from "node:child_process";
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const out = { base: "/apps/iwa-e2/", slug: "iwa-e2" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--session-id") out.sessionId = argv[++i];
    else if (arg === "--base") out.base = argv[++i];
    else if (arg === "--slug") out.slug = argv[++i];
  }
  return out;
}

function run(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: "inherit" });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(" ")} exited with ${code}`));
    });
  });
}

async function loadJsonl(file) {
  if (!existsSync(file)) return null;
  try {
    const text = await readFile(file, "utf8");
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch (err) {
    console.warn(`  WARN: could not read ${file}: ${err.message}`);
    return null;
  }
}

async function latestSessionId(journalDir) {
  const files = (await readdir(journalDir)).filter(
    (file) => file.startsWith("session-") && file.endsWith(".jsonl"),
  );
  if (files.length === 0) throw new Error(`no session-*.jsonl in ${journalDir}`);

  const withStats = await Promise.all(
    files.map(async (file) => {
      const p = path.join(journalDir, file);
      const { mtimeMs } = await (await import("node:fs/promises")).stat(p);
      return { file, mtimeMs };
    }),
  );
  withStats.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return withStats[0].file.replace(/^session-|\.jsonl$/g, "");
}

async function analyzeJournal(journalFile) {
  const rows = await loadJsonl(journalFile);
  if (!rows) throw new Error(`required journal missing: ${journalFile}`);

  const meta = rows.find((row) => row.type === "session_meta");
  let userMessages = 0;
  let assistantMessages = 0;
  let toolCalls = 0;
  let checkpoints = 0;

  for (const row of rows) {
    if (row.type === "user_message" && !isContextUserMessage(row)) userMessages += 1;
    if (row.type === "assistant_text") assistantMessages += 1;
    if (row.type === "tool_call") {
      toolCalls += 1;
      if (row.checkpoint_path) checkpoints += 1;
    }
  }

  const active = estimateActiveDuration(rows);

  return { meta, userMessages, assistantMessages, toolCalls, checkpoints, active };
}

function isContextUserMessage(row) {
  const content = typeof row.content === "string" ? row.content.trimStart() : "";
  return (
    content.startsWith("# AGENTS.md instructions") ||
    content.startsWith("<environment_context>")
  );
}

function estimateActiveDuration(rows, capMs = 60_000) {
  const byTurn = new Map();
  for (const row of rows) {
    if (row.type === "session_meta" || row.type === "capture" || !row.ts) continue;
    const ts = Date.parse(row.ts);
    if (!Number.isFinite(ts)) continue;
    const turn = Number.isFinite(row.turn) ? row.turn : 1;
    const events = byTurn.get(turn) ?? [];
    events.push(ts);
    byTurn.set(turn, events);
  }

  const turnDurations = [];
  for (const turn of [...byTurn.keys()].sort((a, b) => a - b)) {
    const events = byTurn.get(turn).sort((a, b) => a - b);
    let duration = 0;
    for (let i = 1; i < events.length; i++) {
      const gap = events[i] - events[i - 1];
      if (gap > 0) duration += Math.min(gap, capMs);
    }
    turnDurations.push(duration);
  }

  return {
    activeMs: turnDurations.reduce((sum, duration) => sum + duration, 0),
    turnDurations,
  };
}

async function copyCheckpoints(journalDir, sessionId, outJournalDir) {
  const srcCheckpoints = path.join(journalDir, "checkpoints", sessionId);
  const outCheckpoints = path.join(outJournalDir, "checkpoints");
  await mkdir(outCheckpoints, { recursive: true });

  if (!existsSync(srcCheckpoints)) {
    console.warn(`  no checkpoints dir at ${srcCheckpoints}`);
    return 0;
  }

  const files = (await readdir(srcCheckpoints)).filter((file) => !file.startsWith("."));
  for (const file of files) {
    await copyFile(path.join(srcCheckpoints, file), path.join(outCheckpoints, file));
  }
  console.log(`  checkpoints: ${files.length} copied`);
  return files.length;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  console.log(`vite build --base ${args.base}`);
  await run("npx", ["vite", "build", "--base", args.base], REPO);

  const distDir = path.join(REPO, "dist");
  if (!existsSync(distDir)) throw new Error(`expected build output at ${distDir}`);

  const journalDir = path.join(REPO, ".codex", "journal");
  if (!existsSync(journalDir)) throw new Error(`no .codex/journal in ${REPO}`);

  const sessionId = args.sessionId ?? (await latestSessionId(journalDir));
  const journalFile = path.join(journalDir, `session-${sessionId}.jsonl`);
  if (!existsSync(journalFile)) throw new Error(`journal not found: ${journalFile}`);
  console.log(`packaging session ${sessionId}`);

  const outJournalDir = path.join(distDir, "journal");
  await rm(outJournalDir, { recursive: true, force: true });
  await mkdir(outJournalDir, { recursive: true });
  await copyFile(journalFile, path.join(outJournalDir, "session.jsonl"));

  const copiedCheckpoints = await copyCheckpoints(journalDir, sessionId, outJournalDir);
  const { meta, userMessages, assistantMessages, toolCalls, checkpoints, active } =
    await analyzeJournal(journalFile);

  if (!meta) throw new Error(`session_meta missing in ${journalFile}`);

  const stats = {
    slug: args.slug,
    session_id: sessionId,
    user_messages: userMessages,
    user_messages_source: "codex-journal user_message rows excluding AGENTS/environment context",
    assistant_messages: assistantMessages,
    assistant_messages_source: "codex-journal assistant_text rows",
    tool_calls: toolCalls,
    checkpoints: Math.max(checkpoints, copiedCheckpoints),
    active_ms: active.activeMs,
    active_ms_source:
      "estimated from codex-journal event gaps (cap 60s/event); Codex journal lacks turn_duration records",
    turn_durations_ms: active.turnDurations,
    model: meta.model,
    built_with: "Codex",
    codex_cli_version: meta.codex_cli_version,
    started_at: meta.started_at,
    updated_at: meta.updated_at,
  };

  await writeFile(path.join(outJournalDir, "stats.json"), JSON.stringify(stats, null, 2) + "\n");

  console.log("packaged:", {
    user: stats.user_messages,
    assistant: stats.assistant_messages,
    tools: stats.tool_calls,
    checkpoints: stats.checkpoints,
    active_ms: stats.active_ms,
  });
  console.log(`dist/ ready to drop into iwsdk-adventures/public/apps/${args.slug}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
