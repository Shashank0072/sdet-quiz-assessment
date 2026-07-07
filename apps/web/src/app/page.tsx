"use client";

import { Trophy } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type LeaderboardPlayer = {
  userId: string;
  displayName: string;
  totalScore: number;
};

type LeaderboardResponse = {
  source: "cache" | "database";
  players: LeaderboardPlayer[];
};

type PendingSubmission = {
  userId: string;
  baselineScore: number;
  expectedScoreIncrease: number;
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function HomePage() {
  const [userId, setUserId] = useState("alice");
  const [answers, setAnswers] = useState(["A", "C", "B", "D", "A"]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardPlayer[]>([]);
  const [status, setStatus] = useState("Ready to submit a quiz.");
  const [pendingSubmission, setPendingSubmission] = useState<PendingSubmission | null>(null);

  async function fetchLeaderboardPlayers() {
    const response = await fetch(`${apiUrl}/api/leaderboard`, { cache: "no-store" });
    const data = (await response.json()) as LeaderboardResponse;
    setLeaderboard(data.players);

    return data.players;
  }

  function hasProcessedSubmission(players: LeaderboardPlayer[], pending: PendingSubmission) {
    const player = players.find((entry) => entry.userId === pending.userId);
    const expectedScore = pending.baselineScore + pending.expectedScoreIncrease;

    return player !== undefined && player.totalScore >= expectedScore;
  }

  useEffect(() => {
    void fetchLeaderboardPlayers();
  }, []);

  useEffect(() => {
    if (!pendingSubmission) {
      return;
    }

    let cancelled = false;
    const submission = pendingSubmission;

    async function pollUntilLeaderboardReflectsSubmission() {
      while (!cancelled) {
        const players = await fetchLeaderboardPlayers();
        if (hasProcessedSubmission(players, submission)) {
          setPendingSubmission(null);
          setStatus(`Leaderboard updated for ${submission.userId}.`);
          return;
        }

        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 100);
        });
      }
    }

    const timeoutId = window.setTimeout(() => {
      if (!cancelled) {
        cancelled = true;
        setPendingSubmission(null);
        setStatus("Leaderboard update timed out. Please refresh to verify.");
      }
    }, 15_000);

    void pollUntilLeaderboardReflectsSubmission();

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [pendingSubmission]);

  async function submitQuiz(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const players = await fetchLeaderboardPlayers();
    const baselineScore = players.find((player) => player.userId === userId)?.totalScore ?? 0;

    setPendingSubmission({
      userId,
      baselineScore,
      expectedScoreIncrease: answers.length * 10
    });
    setStatus("Submission accepted. Evaluation is running asynchronously.");

    await fetch(`${apiUrl}/api/quiz/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId, quizId: "quiz-1", answers })
    });
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-10 lg:flex-row lg:items-start">
      <section className="flex-1 space-y-6">
        <div className="space-y-3">
          <div className="inline-flex items-center rounded-full border bg-white/80 px-3 py-1 text-sm text-muted-foreground shadow-sm">
            SDET take-home system
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">Asynchronous Quiz Evaluation</h1>
          <p className="max-w-2xl text-lg text-muted-foreground">
            Submit answers, let a BullMQ worker evaluate them, and watch the Redis-backed leaderboard update after processing.
          </p>
        </div>

        <Card className="border-0 shadow-xl shadow-indigo-100">
          <CardHeader>
            <CardTitle>Submit Quiz</CardTitle>
            <CardDescription>Correct answers are A, C, B, D, A for 10 points each.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={submitQuiz}>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="userId">
                  User ID
                </label>
                <Input id="userId" name="userId" value={userId} onChange={(event) => setUserId(event.target.value)} />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
                {answers.map((answer, index) => (
                  <div className="space-y-2" key={index}>
                    <label className="text-sm font-medium" htmlFor={`answer-${index}`}>
                      Q{index + 1}
                    </label>
                    <Input
                      id={`answer-${index}`}
                      aria-label={`Answer ${index + 1}`}
                      value={answer}
                      maxLength={1}
                      onChange={(event) => {
                        const next = [...answers];
                        next[index] = event.target.value.toUpperCase();
                        setAnswers(next);
                      }}
                    />
                  </div>
                ))}
              </div>

              <Button type="submit" className="w-full sm:w-auto">
                Submit quiz
              </Button>
              <p className="text-sm text-muted-foreground" role="status">
                {status}
              </p>
            </form>
          </CardContent>
        </Card>
      </section>

      <Card className="w-full border-0 shadow-xl shadow-indigo-100 lg:w-[380px]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" /> Leaderboard
          </CardTitle>
          <CardDescription>Top 10 players from Redis cache or SQLite fallback.</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3" aria-label="Leaderboard results">
            {leaderboard.length === 0 ? (
              <li className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">No scores yet.</li>
            ) : (
              leaderboard.map((player, index) => (
                <li className="flex items-center justify-between rounded-lg bg-muted px-4 py-3" key={player.userId}>
                  <span className="font-medium">
                    {index + 1}. {player.displayName}
                  </span>
                  <span className="text-sm text-muted-foreground">{player.totalScore} points</span>
                </li>
              ))
            )}
          </ol>
        </CardContent>
      </Card>
    </main>
  );
}
