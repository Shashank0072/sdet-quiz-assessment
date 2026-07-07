import cors from "@elysiajs/cors";
import { LEADERBOARD_CACHE_KEY, createRedisConnection, db, playerScores, submissions, users } from "@quiz/db";
import { desc, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { createQuizEvaluationQueue } from "./queue";

const queue = createQuizEvaluationQueue();
const redis = createRedisConnection();

async function waitForQueueReady() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await queue.waitUntilReady();
      return;
    } catch {
      if (attempt === 7) {
        throw new Error("queue did not become ready");
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}

async function enqueueSubmission(payload: { submissionId: string; userId: string; quizId: string; answers: string[] }) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await waitForQueueReady();
      await queue.add("evaluate-submission", payload);
      return;
    } catch {
      if (attempt === 7) {
        throw new Error("failed to enqueue submission");
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}

const submitBody = t.Object({
  userId: t.String({ minLength: 1 }),
  quizId: t.String({ minLength: 1 }),
  answers: t.Array(t.String(), { minItems: 1 })
});

async function getLeaderboardFromDb() {
  return db
    .select({
      userId: playerScores.userId,
      displayName: users.displayName,
      totalScore: playerScores.totalScore
    })
    .from(playerScores)
    .innerJoin(users, eq(users.id, playerScores.userId))
    .orderBy(desc(playerScores.totalScore))
    .limit(10);
}

const submitHandler = async ({ body, set }: { body: { userId: string; quizId: string; answers: string[] }; set: { status: number } }) => {
  const submissionId = crypto.randomUUID();

  await enqueueSubmission({
    submissionId,
    userId: body.userId,
    quizId: body.quizId,
    answers: body.answers
  });

  set.status = 202;
  return { accepted: true, submissionId };
};

export const app = new Elysia()
  .use(
    cors({
      origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
      methods: ["GET", "POST", "OPTIONS"]
    })
  )
  .get("/health", async () => {
    await waitForQueueReady();
    return { status: "ok" };
  })
  .post("/api/quiz/submit", submitHandler, { body: submitBody })
  .post("/api/v1/submit", submitHandler, { body: submitBody })
  .get("/api/leaderboard", async () => {
    const cached = await redis.get(LEADERBOARD_CACHE_KEY);

    if (cached) {
      return { source: "cache", players: JSON.parse(cached) as Awaited<ReturnType<typeof getLeaderboardFromDb>> };
    }

    const players = await getLeaderboardFromDb();
    return { source: "database", players };
  });

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 3001);
  await waitForQueueReady();
  app.listen(port);
  console.log(`quiz api listening on http://localhost:${port}`);
}
