import { defineConfig } from '@playwright/test';

// E2E chạy trên bản build production (vite preview) — đúng thứ người dùng nhận được trên static hosting.
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173/',
    // Máy dev dùng Chrome có sẵn; CI cài Chromium của Playwright.
    channel: process.env.CI ? undefined : 'chrome',
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
  },
  webServer: {
    command: 'pnpm build && pnpm preview --port 4173 --strictPort',
    url: 'http://localhost:4173/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
