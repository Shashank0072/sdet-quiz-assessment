import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { startRedisContainer, type StartedRedis } from "../testcontainers";

type QuizSubmission = {
  submissionId: string;
  userId: string;
  quizId: string;
  answers: string[];
};

type ProcessQuizSubmission = (job: QuizSubmission) => Promise<{ score: number; correctCount: number; totalScore: number }>;

const repoRoot = resolve(import.meta.dir, "../../../..");
const databasePath = resolve(tmpdir(), `quiz-concurrency-${Date.now()}.sqlite`);

let redis: StartedRedis | undefined;
let processQuizSubmission: ProcessQuizSubmission;

beforeAll(async () => {
  redis = await startRedisContainer();
  mkdirSync(tmpdir(), { recursive: true });

  process.env.DATABASE_URL = databasePath;
  process.env.REDIS_URL = redis.url;

  const migration = Bun.spawn({
    cmd: ["bun", "run", "packages/db/scripts/migrate.ts"],
    cwd: repoRoot,
    env: {
      ...process.env,
      DATABASE_URL: databasePath,
      REDIS_URL: redis.url
    },
    stdout: "pipe",
    stderr: "pipe"
  });
  const migrationExit = await migration.exited;
  if (migrationExit !== 0) {
    throw new Error(`database migration failed with exit code ${migrationExit}`);
  }

  const processorModule = await import("../../../workers/src/processor");
  processQuizSubmission = processorModule.processQuizSubmission as ProcessQuizSubmission;
});

afterAll(async () => {
  await redis?.stop();
});

test("burst submissions for one user all contribute to the final leaderboard score", async () => {
  const userId = `race-user-${Date.now()}`;
  const jobs = Array.from({ length: 20 }, (_, index) => ({
    submissionId: `submission-${index}-${Date.now()}`,
    userId,
    quizId: "quiz-1",
    answers: ["A", "C", "B", "D", "A"]
  }));

  const results = await Promise.all(jobs.map((job) => processQuizSubmission(job)));
  expect(results).toHaveLength(20);
  expect(results.every((result) => result.totalScore > 0)).toBe(true);
});
