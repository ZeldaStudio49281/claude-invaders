// E2E-tester för Buggjakten.
// npm test           kör bara Chromium (standard)
// npm run test:all   kör alla motorer: Chromium, Firefox, WebKit och mobil-Safari
import { defineConfig, devices } from '@playwright/test';

const chromium = { name: 'chromium', use: { ...devices['Desktop Chrome'] } };
const otherEngines = [
  { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  // Mobilemulering (iPhone 13, WebKit). mobile.spec.js sätter egna enheter per grupp, de andra filerna körs på skrivbordet.
  { name: 'mobile-safari', use: { ...devices['iPhone 13'] }, testMatch: /mobile.spec.js/ },
];

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  projects: process.env.ALL_BROWSERS ? [chromium, ...otherEngines] : [chromium],
  webServer: {
    command: 'npx serve -l 4173 .',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
  },
});
