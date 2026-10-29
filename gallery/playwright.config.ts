// The gallery's browser tests: every page, in Chromium, Firefox and WebKit, against the built
// gallery (what an app ships); and once more in Chromium against the dev server, whose
// unbundled modules are what an app's `npm run dev` serves.
import { defineConfig, devices } from '@playwright/test';

// Ports of their own, so a server another project left running is never mistaken for these:
// 4791 and 4792 unless GALLERY_PORT and GALLERY_DEV_PORT say otherwise (two checkouts running
// their galleries at once, each on its own pair).
//
// On 127.0.0.1, not `localhost`. `localhost` can be served by two processes on one port, one on
// ::1 and one on 127.0.0.1, each started with --strictPort, and a browser reaches whichever its
// resolver tries first: a test of another checkout's gallery, passing. One address can be held
// by one server only, so a second run on the same port fails to start rather than tests the
// first one's pages. reuseExistingServer stays false for the same reason, and every page's
// response says which gallery served it (X-Dex-Gallery, checked in tests/gallery.ts).
function port(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error(`${name} must be a port number, not ${JSON.stringify(value)}`);
  return n;
}
const PORT = port('GALLERY_PORT', 4791);
const DEV_PORT = port('GALLERY_DEV_PORT', 4792);
const HOST = '127.0.0.1';
const BUILT = `http://${HOST}:${PORT}`;
const DEV = `http://${HOST}:${DEV_PORT}`;
const vite = 'npx vite --config vite.config.ts';
// About the dev server's configuration, not a page: once is enough.
const DEV_ONLY = /devServer\.spec\.ts$/;
// The built pages' policy, which the dev server relaxes for its injected styles.
const BUILT_ONLY = /csp\.spec\.ts$/;

export default defineConfig({
  testDir: 'tests',
  outputDir: 'test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]] : 'list',
  use: { trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', testIgnore: DEV_ONLY, use: { ...devices['Desktop Chrome'], baseURL: BUILT } },
    { name: 'firefox', testIgnore: DEV_ONLY, use: { ...devices['Desktop Firefox'], baseURL: BUILT } },
    { name: 'webkit', testIgnore: DEV_ONLY, use: { ...devices['Desktop Safari'], baseURL: BUILT } },
    { name: 'chromium-dev', testIgnore: BUILT_ONLY, use: { ...devices['Desktop Chrome'], baseURL: DEV } },
  ],
  webServer: [
    {
      command: `${vite} build && ${vite} preview --host ${HOST} --port ${PORT} --strictPort`,
      cwd: import.meta.dirname,
      url: BUILT,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `${vite} --host ${HOST} --port ${DEV_PORT} --strictPort`,
      cwd: import.meta.dirname,
      url: DEV,
      reuseExistingServer: false,
    },
  ],
});
