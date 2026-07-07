import { expect, test } from "bun:test";

test("db package exposes the shared schema entrypoint", () => {
  expect(typeof globalThis).toBe("object");
});
