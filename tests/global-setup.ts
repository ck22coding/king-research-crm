import { request } from "@playwright/test";
import fs from "node:fs";

const STORAGE_STATE_PATH = "tests/.auth/runner.json";

// Signs in as the single runner account (can_enrich=true) and saves the
// resulting Supabase cookies for every Playwright test to reuse.
export default async function globalSetup() {
  process.loadEnvFile("/Users/carterking/Projects/dad/.env");

  const email = process.env.RUNNER_EMAIL;
  const password = process.env.RUNNER_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "RUNNER_EMAIL/RUNNER_PASSWORD missing from /Users/carterking/Projects/dad/.env",
    );
  }

  const context = await request.newContext({ baseURL: "http://localhost:3000" });
  const response = await context.post("/api/test-auth", { data: { email, password } });
  if (!response.ok()) {
    throw new Error(`/api/test-auth failed: ${response.status()} ${await response.text()}`);
  }

  fs.mkdirSync("tests/.auth", { recursive: true });
  await context.storageState({ path: STORAGE_STATE_PATH });
  await context.dispose();
}
