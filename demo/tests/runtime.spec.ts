import { expect, test } from '@playwright/test'

test('compares ts-pattern, SWC plugin, and plain JS columns after textarea edits', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  await page.goto('/', { waitUntil: 'networkidle' })

  await expect(page.getByRole('heading', { name: 'ts-pattern AS-IS' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'ts-pattern with swc-plugin' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'plain JS with switch/if' })).toBeVisible()
  const comparison = page.getByLabel('benchmark comparison')
  await expect(comparison.getByText('Hello from ts-pattern')).toHaveCount(3)
  await expect(comparison.getByText('Oups! An error occured')).toHaveCount(3)
  await expect(comparison.getByRole('img')).toHaveCount(3)

  await page.getByLabel('JSON Result records to parse and render').fill(
    JSON.stringify(
      [
        { type: 'ok', data: { type: 'text', content: 'Edited text' } },
        { type: 'error', error: { message: 'Still hidden by snippet' } },
      ],
      null,
      2,
    ),
  )

  await expect(page.getByRole('status')).toContainText('Parsed 2 records')
  await expect(comparison.getByText('Edited text')).toHaveCount(3)
  await expect(comparison.getByText('Oups! An error occured')).toHaveCount(3)
  await expect(comparison.getByText('Throughput')).toHaveCount(3)
  expect(errors).toEqual([])
})
