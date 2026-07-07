import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = resolve(packageRoot, "dist");
const perfScript = resolve(packageRoot, "scripts", "leaderboard.perf.js");
const summaryPath = resolve(distDir, "perf-results.json");

mkdirSync(distDir, { recursive: true });

function which(command) {
  const result = spawnSync(process.platform === "win32" ? "where" : "which", [command], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });

  if (result.status === 0) {
    return result.stdout.trim().split(/\r?\n/)[0];
  }

  return null;
}

function runCommand(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit"
  });

  if (result.error) {
    throw result.error;
  }

  process.exit(result.status ?? 1);
}

const k6Binary = which("k6");
const dockerBinary = which("docker");
const defaultPort = process.env.PORT ?? "3001";
const apiBaseUrl = process.env.API_BASE_URL ?? process.env.API_URL ?? (dockerBinary ? `http://host.docker.internal:${defaultPort}` : `http://127.0.0.1:${defaultPort}`);

if (k6Binary) {
  runCommand(k6Binary, ["run", perfScript, "--summary-export", summaryPath, "--env", `API_BASE_URL=${apiBaseUrl}`]);
}

if (dockerBinary) {
  runCommand(dockerBinary, [
    "run",
    "--rm",
    "-i",
    "--network",
    "host",
    "-v",
    `${packageRoot}:/work`,
    "-w",
    "/work",
    "grafana/k6:latest",
    "run",
    "/work/scripts/leaderboard.perf.js",
    "--summary-export",
    "/work/dist/perf-results.json",
    "--env",
    `API_BASE_URL=${apiBaseUrl}`
  ]);
}

console.error("k6 is not installed and Docker is unavailable. Install k6 or enable Docker to run the performance benchmark.");
process.exit(1);
