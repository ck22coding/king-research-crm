import { test, expect } from "@playwright/test";

test("pair route exchanges a fresh code and burns it", async ({ page, request }) => {
  await page.goto("/onboarding");
  await page.getByRole("button", { name: "Connect this computer" }).click();
  const code = await page.getByTestId("pairing-code").textContent();

  const res = await request.post("/api/runner/pair", { data: { code } });
  expect(res.status()).toBe(200);
  expect((await res.json()).token_hash).toBeTruthy();

  // single-use: same code again must fail
  const again = await request.post("/api/runner/pair", { data: { code } });
  expect(again.status()).toBe(401);
});

test("pair route rejects garbage", async ({ request }) => {
  const res = await request.post("/api/runner/pair", { data: { code: "NOPE-NOPE" } });
  expect(res.status()).toBe(401);
});
