// Browser checks of the standalone app against `--demo` (design §10, S2):
// no horizontal scroll at 1280 and 390 px, axe without serious violations,
// keyboard navigation, theming through `--hui-*`. Run: npm run test:e2e
// (builds first). Uses the locally installed Chromium of Playwright.
import { defineConfig } from '@playwright/test';

const PORT = 4808;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: 'list',
  use: { baseURL: `http://127.0.0.1:${PORT}/`, colorScheme: 'light', locale: 'ru-RU' },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1280, height: 900 } } },
    {
      name: 'mobile',
      use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, isMobile: true },
    },
  ],
  webServer: {
    command: `node dist/lib/cli.js --demo --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    stdout: 'ignore',
  },
});
