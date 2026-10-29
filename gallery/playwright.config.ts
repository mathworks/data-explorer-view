// The gallery's browser tests: every page, in Chromium, Firefox and WebKit, against the built
// gallery (what an app ships); and once more in Chromium against the dev server, whose
// unbundled modules are what an app's `npm run dev` serves.
import { defineConfig, devices } from '@playwright/test';

// Ports of their own, so a server another project left running is never mistaken for these.
const BUILT = 'http://localhost:4791';
const DEV = 'http://localhost:4792';
const vite = 'npx vite --config vite.config.ts';

export default defineConfig({
  testDir: 'tests',
  outputDir: 'test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]] : 'list',
  use: { trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], baseURL: BUILT } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], baseURL: BUILT } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], baseURL: BUILT } },
    { name: 'chromium-dev', use: { ...devices['Desktop Chrome'], baseURL: DEV } },
  ],
  webServer: [
    {
      command: `${vite} build && ${vite} preview --port 4791 --strictPort`,
      cwd: import.meta.dirname,
      url: BUILT,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `${vite} --port 4792 --strictPort`,
      cwd: import.meta.dirname,
      url: DEV,
      reuseExistingServer: false,
    },
  ],
});
