import { expect, test } from '@playwright/test'

test('loads transformed ts-pattern output without runtime errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  await page.goto('/', { waitUntil: 'networkidle' })

  await expect(page.getByText('Paid $128')).toBeVisible()
  await expect(page.getByText('Open $42')).toBeVisible()
  await expect(page.getByText('Void')).toBeVisible()
  expect(errors).toEqual([])
})
