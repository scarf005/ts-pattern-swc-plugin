import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5179',
    url: 'http://127.0.0.1:5179/',
    reuseExistingServer: false,
  },
  use: {
    baseURL: 'http://127.0.0.1:5179/',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
