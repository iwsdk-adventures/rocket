import { mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const output = process.argv[2] ?? ".codex/artifacts/rocket-ar-playthrough.webm";
mkdirSync(new URL("../.codex/artifacts/", import.meta.url), { recursive: true });

const result = spawnSync(
  "npx",
  [
    "--yes",
    "vitexec",
    "--config",
    "vite.vitexec.config.ts",
    "--gpu",
    "--timeout",
    "45",
    "--record",
    output,
    "scripts/rocket-playthrough.vitexec.ts",
  ],
  { cwd: new URL("..", import.meta.url), stdio: "inherit" },
);

process.exit(result.status ?? 1);
