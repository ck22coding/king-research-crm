import { defineConfig } from "@playwright/test";

// Loaded here (not just in global-setup) so RUNNER_EMAIL/RUNNER_PASSWORD are
// already in process.env before the webServer plugin spawns `npm run dev` —
// child processes inherit a snapshot of process.env taken at spawn time.
process.loadEnvFile("/Users/carterking/Projects/dad/.env");

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  globalSetup: "./tests/global-setup.ts",
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: "http://localhost:3000",
    storageState: "tests/.auth/runner.json",
  },
});
