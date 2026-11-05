import { defineConfig, devices } from "@playwright/test";

/**
 * Browsertesten op de proefbank (tekenvlak zonder aanmelden).
 * Lokaal: `npm run e2e`. Op GitHub draaien ze bij elke wijziging.
 */
const port = 3200;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    locale: "nl-BE",
    viewport: { width: 1440, height: 900 },
    // WebGL zonder grafische kaart (voor de 3D-weergave)
    launchOptions: {
      args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
      ...(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}),
    },
  },
  projects: [
    { name: "laptop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }, grepInvert: /@tablet/ },
    { name: "tablet", use: { ...devices["Desktop Chrome"], viewport: { width: 1024, height: 768 }, hasTouch: true }, grep: /@tablet/ },
  ],
  webServer: {
    command: `npm run build && npx next start -p ${port}`,
    env: { PROEFBANK: "1" },
    url: `http://localhost:${port}/proefbank`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
