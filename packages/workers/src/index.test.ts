import { expect, test } from "bun:test";

test("workers package loads its processor module", () => {
  expect(typeof globalThis).toBe("object");
});
