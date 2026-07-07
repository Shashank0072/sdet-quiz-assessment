import { LEADERBOARD_CACHE_KEY, createRedisConnection, db, playerScores, results, submissions, users } from "@quiz/db";
import { desc, eq } from "drizzle-orm";
import { scoreAnswers } from "./scoring";
const redis = createRedisConnection();
const LOCK_TTL_MS = 5_000;
const LOCK_RETRY_DELAY_MS = 50;
async function acquireUserLock(userId) {
    const lockKey = `score-lock:${userId}`;
    const token = crypto.randomUUID();
    while (true) {
        const acquired = await redis.set(lockKey, token, "PX", LOCK_TTL_MS, "NX");
        if (acquired === "OK") {
            return { lockKey, token };
        }
        await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_DELAY_MS));
    }
}
async function releaseUserLock(lockKey, token) {
    const currentToken = await redis.get(lockKey);
    if (currentToken === token) {
        await redis.del(lockKey);
    }
}
export async function processQuizSubmission(job) {
    const { correctCount, score } = scoreAnswers(job.answers);
    const lock = await acquireUserLock(job.userId);
    let nextTotalScore = 0;
    try {
        await db.transaction(async (tx) => {
            await tx.insert(users).values({ id: job.userId, displayName: job.userId }).onConflictDoNothing();
            await tx.insert(submissions).values({
                id: job.submissionId,
                userId: job.userId,
                quizId: job.quizId,
                answersJson: JSON.stringify(job.answers),
                status: "queued"
            }).onConflictDoNothing();
            await tx.insert(playerScores).values({ userId: job.userId, totalScore: 0 }).onConflictDoNothing();
            const [current] = await tx
                .select({ totalScore: playerScores.totalScore })
                .from(playerScores)
                .where(eq(playerScores.userId, job.userId))
                .limit(1);
            nextTotalScore = (current?.totalScore ?? 0) + score;
            await tx.update(playerScores).set({ totalScore: nextTotalScore, updatedAt: new Date() }).where(eq(playerScores.userId, job.userId));
            await tx.insert(results).values({
                id: crypto.randomUUID(),
                submissionId: job.submissionId,
                userId: job.userId,
                quizId: job.quizId,
                score,
                correctCount
            });
            await tx.update(submissions).set({ status: "evaluated" }).where(eq(submissions.id, job.submissionId));
            const leaderboard = await tx
                .select({
                userId: playerScores.userId,
                displayName: users.displayName,
                totalScore: playerScores.totalScore
            })
                .from(playerScores)
                .innerJoin(users, eq(users.id, playerScores.userId))
                .orderBy(desc(playerScores.totalScore))
                .limit(10);
            await redis.set(LEADERBOARD_CACHE_KEY, JSON.stringify(leaderboard), "EX", 30);
        });
    }
    finally {
        await releaseUserLock(lock.lockKey, lock.token);
    }
    return { score, correctCount, totalScore: nextTotalScore };
}
