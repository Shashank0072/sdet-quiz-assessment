import { Worker } from "bullmq";
import { createBullMqRedisConnection } from "@quiz/db/redis";
import { processQuizSubmission, type QuizSubmissionJob } from "./processor";

export const QUIZ_EVALUATION_QUEUE = "quiz-evaluation";

export async function createQuizWorker() {
  const worker = new Worker<QuizSubmissionJob>(
    QUIZ_EVALUATION_QUEUE,
    async (job) => processQuizSubmission(job.data),
    {
      connection: createBullMqRedisConnection(),
      concurrency: 8
    }
  );

  worker.on("completed", (job, result) => {
    console.log(`evaluated ${job.id}: ${JSON.stringify(result)}`);
  });

  worker.on("failed", (job, error) => {
    console.error(`failed ${job?.id ?? "unknown"}: ${error.message}`);
  });

  await worker.waitUntilReady();

  return worker;
}

if (import.meta.main) {
  await createQuizWorker();
  console.log("quiz evaluation worker listening on queue quiz-evaluation with concurrency 8");
}
