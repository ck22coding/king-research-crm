import { defineConfig } from "@playwright/test";

// Loaded here (not just in global-setup) so RUNNER_EMAIL/RUNNER_PASSWORD are
// already in process.env before the webServer plugin spawns `npm run dev` —
// child processes inherit a snapshot of process.env taken at spawn time.
process.loadEnvFile("/Users/carterking/Projects/dad/.env");

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  // Every companies/record page mounts a realtime postgres_changes socket
  // (Task 7) against one shared hosted Supabase project. Confirmed by hand:
  // several of those sockets opening at once (multiple parallel workers)
  // causes the shared free-tier Realtime tenant to silently drop/delay
  // change events on some connections — a real-time-smoke test then times
  // out despite the app working correctly. Running workers serially avoids
  // that contention; this suite is small enough that it costs little.
  workers: 1,
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
