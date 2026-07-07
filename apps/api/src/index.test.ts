import { expect, test } from "bun:test";

test("api package loads", () => {
  expect(typeof globalThis).toBe("object");
});
