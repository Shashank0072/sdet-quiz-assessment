import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { startRedisContainer, type StartedRedis } from "../src/testcontainers";

const repoRoot = resolve(import.meta.dir, "../../..");
const apiUrl = "http://127.0.0.1:3901";
const databasePath = resolve(tmpdir(), `quiz-concurrency-${Date.now()}.sqlite`);

let redis: StartedRedis | undefined;
let apiProcess: ReturnType<typeof Bun.spawn> | undefined;
let workerProcess: ReturnType<typeof Bun.spawn> | undefined;

async function waitForHealth() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${apiUrl}/health`);
      if (response.ok) {
        return;
      }
    } catch {}
    await Bun.sleep(250);
  }
  throw new Error("API did not become healthy");
}

async function waitForLeaderboardScore(userId: string, expectedScore: number, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await fetch(`${apiUrl}/api/leaderboard`);
    const leaderboard = (await response.json()) as { players: Array<{ userId: string; totalScore: number }> };
    const player = leaderboard.players.find((entry) => entry.userId === userId);
    if (player?.totalScore === expectedScore) {
      return player;
    }
    await Bun.sleep(250);
  }
  throw new Error(`Leaderboard score for ${userId} never reached ${expectedScore}`);
}

async function main() {
  redis = await startRedisContainer();
  mkdirSync(tmpdir(), { recursive: true });
  const env = { ...process.env, DATABASE_URL: databasePath, REDIS_URL: redis.url, PORT: "3901" };

  const migration = Bun.spawn({ cmd: ["bun", "run", "packages/db/scripts/migrate.ts"], cwd: repoRoot, env, stdout: "pipe", stderr: "pipe" });
  const migrationExit = await migration.exited;
  if (migrationExit !== 0) {
    throw new Error(`database migration failed: ${migrationExit}`);
  }

  apiProcess = Bun.spawn({ cmd: ["bun", "run", "apps/api/src/index.ts"], cwd: repoRoot, env, stdout: "pipe", stderr: "pipe" });
  workerProcess = Bun.spawn({ cmd: ["bun", "run", "packages/workers/src/index.ts"], cwd: repoRoot, env, stdout: "pipe", stderr: "pipe" });

  await waitForHealth();

  const body = { userId: "race-user", quizId: "quiz-1", answers: ["A", "C", "B", "D", "A"] };
  const responses = await Promise.all(
    Array.from({ length: 20 }, () =>
      fetch(`${apiUrl}/api/quiz/submit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
    )
  );

  for (const response of responses) {
    if (response.status !== 202) {
      throw new Error(`expected 202, got ${response.status}`);
    }
  }

  const player = await waitForLeaderboardScore("race-user", 1000);
  console.log(JSON.stringify(player));
}

main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  apiProcess?.kill();
  workerProcess?.kill();
  await redis?.stop();
});
