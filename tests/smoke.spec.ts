import { test, expect } from "@playwright/test";
import fs from "node:fs";

test("global setup produced a runner session with a Supabase cookie", () => {
  const state = JSON.parse(fs.readFileSync("tests/.auth/runner.json", "utf-8"));

  expect(state.cookies.length).toBeGreaterThan(0);
  expect(
    state.cookies.some((cookie: { name: string }) => cookie.name.startsWith("sb-")),
  ).toBe(true);
});
