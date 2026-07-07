import { expect, test } from "bun:test";

test("web package loads", () => {
  expect(typeof globalThis).toBe("object");
});
