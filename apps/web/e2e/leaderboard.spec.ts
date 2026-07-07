import { expect, test } from "@playwright/test";

test("submitting a perfect quiz immediately shows Alice on the leaderboard", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("User ID").fill("alice");
  await page.getByLabel("Answer 1").fill("A");
  await page.getByLabel("Answer 2").fill("C");
  await page.getByLabel("Answer 3").fill("B");
  await page.getByLabel("Answer 4").fill("D");
  await page.getByLabel("Answer 5").fill("A");

  const leaderboard = page.getByRole("list", { name: "Leaderboard results" });
  const existingAliceRow = leaderboard.locator("li").filter({ hasText: "alice" });
  const existingScoreText =
    (await existingAliceRow.count()) > 0 ? await existingAliceRow.innerText() : "";
  const baselineScore = Number(existingScoreText.match(/(\d+) points/)?.[1] ?? 0);
  const expectedScore = baselineScore + 50;

  await page.getByRole("button", { name: "Submit quiz" }).click();

  await expect(page.getByRole("status")).toHaveText("Submission accepted. Evaluation is running asynchronously.");
  await expect(page.getByRole("status")).toHaveText("Leaderboard updated for alice.", { timeout: 15_000 });

  const aliceRow = leaderboard.locator("li").filter({ hasText: "alice" });
  await expect(aliceRow).toBeVisible({ timeout: 15_000 });
  await expect(aliceRow.getByText(`${expectedScore} points`, { exact: true })).toBeVisible({ timeout: 15_000 });
});
