import { expect, test } from '@playwright/test'

test('compares ts-pattern, SWC plugin, and plain JS columns after textarea edits', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  await page.goto('/', { waitUntil: 'networkidle' })

  await expect(page.getByRole('link', { name: 'GitHub' })).toHaveAttribute('href', 'https://github.com/scarf005/ts-pattern-swc-plugin')
  await expect(page.getByRole('link', { name: 'Playground' })).toHaveAttribute('href', 'https://ts-pattern-swc-plugin.pages.dev/')
  await expect(page.locator('.layout')).toHaveCSS('grid-template-columns', /.+ .+/)

  await expect(page.getByRole('heading', { name: 'ts-pattern AS-IS' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'ts-pattern with swc-plugin' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'plain JS with switch/if' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'ts-pattern code' })).toContainText("import { match, P } from 'ts-pattern'")
  await expect(page.getByRole('textbox', { name: 'ts-pattern code' })).not.toContainText('type Data')
  await expect(page.getByRole('textbox', { name: 'plain switch if code' })).toContainText('switch (result.type)')
  await expect(page.getByRole('textbox', { name: 'plain switch if code' })).not.toContainText('type Result')
  await expect(page.locator('.token-keyword')).not.toHaveCount(0)
  await expect(page.locator('.token-jsx')).not.toHaveCount(0)
  await expect(page.locator('.json-comment')).not.toHaveCount(0)
  await expect(page.locator('.json-key')).not.toHaveCount(0)
  await expect(page.locator('.json-string')).not.toHaveCount(0)

  const comparison = page.getByLabel('benchmark comparison')
  await expect(page.getByRole('textbox', { name: 'Result' })).toContainText('Hello from ts-pattern')
  await expect(page.getByRole('textbox', { name: 'Result' })).toContainText('Oups! An error occured')
  await expect(page.getByRole('textbox', { name: 'Result' })).toContainText('<img src=')
  await expect(comparison.getByText(/\d+\.\d% (?:faster|slower) than ts-pattern/)).not.toHaveCount(0)
  await expect(comparison.getByText(/ops\/s \(\d+\.\d% (?:faster|slower) than ts-pattern\)/)).not.toHaveCount(0)

  await page.getByLabel('Input').fill(`[
    // JSONC input
    { "type": "ok", "data": { "type": "text", "content": "Edited text" } },
    { "type": "error", "error": { "message": "Still hidden by snippet" } },
  ]`)

  await expect(page.getByRole('status')).toContainText('Parsed 2 records')
  await expect(page.getByRole('status')).toContainText('100,000 operations')
  await expect(page.getByRole('textbox', { name: 'Result' })).toContainText('Edited text')
  await expect(page.getByRole('textbox', { name: 'Result' })).toContainText('Oups! An error occured')
  await expect(comparison.getByText('Throughput')).toHaveCount(3)
  expect(errors).toEqual([])
})
