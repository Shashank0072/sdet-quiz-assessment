import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: 10,
  duration: "20s",
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<200"]
  }
};

const apiUrl = __ENV.API_BASE_URL || __ENV.API_URL || "http://localhost:3001";

export default function () {
  const userId = `perf-user-${__VU}`;
  const payload = JSON.stringify({
    userId,
    quizId: "quiz-1",
    answers: ["A", "C", "B", "D", "A"]
  });

  const submit = http.post(`${apiUrl}/api/v1/submit`, payload, {
    headers: { "content-type": "application/json" }
  });

  check(submit, {
    "submission accepted": (response) => response.status === 202
  });

  const leaderboard = http.get(`${apiUrl}/api/leaderboard`);
  check(leaderboard, {
    "leaderboard available": (response) => response.status === 200
  });

  sleep(1);
}
