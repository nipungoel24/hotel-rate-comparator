import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { Client, Connection } from '@temporalio/client';
import { startStack } from './stack';
import type { Stack } from './stack';

let mainStack: Stack;
let cancelStack: Stack;
let partialStack: Stack;
let temporalClient: Client;

test.beforeAll(async () => {
  test.setTimeout(300_000);
  mainStack = await startStack({ name: 'main' });
  cancelStack = await startStack({
    name: 'cancel',
    taskQueue: 'hotel-rate-comparator-e2e-cancel',
    apiPort: 3002,
    suppliersPort: 4002,
    webPort: 5174,
    workerFile: 'tests/e2e/worker-scenarios.mjs',
    scenarios: { A: 'hang', B: 'hang' },
    temporal: 'share',
  });
  partialStack = await startStack({
    name: 'partial',
    taskQueue: 'hotel-rate-comparator-e2e-partial',
    apiPort: 3003,
    suppliersPort: 4003,
    webPort: 5175,
    workerFile: 'tests/e2e/worker-scenarios.mjs',
    scenarios: { A: 'server-error', B: 'normal' },
    temporal: 'share',
  });
  const connection = await Connection.connect({ address: '127.0.0.1:7233' });
  temporalClient = new Client({ connection, namespace: 'default' });
});

test.afterAll(async () => {
  await temporalClient.connection.close().catch(() => undefined);
  await mainStack.stop();
  await cancelStack.stop();
  await partialStack.stop();
});

async function fillSearch(page: Page, city: string) {
  await page.getByLabel('City').fill(city);
  await page.getByLabel('Check-in').fill('2030-10-12');
  await page.getByLabel('Check-out').fill('2030-10-15');
}

test.describe('main stack (normal suppliers)', () => {
  test('design tokens: colors, typography, geometry and contrast', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(mainStack.webUrl);

    const bodyBackground = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    expect(bodyBackground).toBe('rgb(250, 250, 249)'); // #FAFAF9 page canvas

    const heading = page.getByRole('heading', {
      name: 'Find the best available hotel rate.',
    });
    const headingStyle = await heading.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        lineHeight: style.lineHeight,
      };
    });
    expect(headingStyle.fontSize).toBe('32px');
    expect(headingStyle.fontWeight).toBe('600');

    for (const label of ['City', 'Check-in', 'Check-out']) {
      const box = await page.getByLabel(label).boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }

    const actionButton = page.getByRole('button', { name: /search rates/i });
    const buttonColor = await actionButton.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    );
    expect(buttonColor).toBe('rgb(15, 118, 110)'); // #0F766E accent

    const panelRadius = await actionButton
      .locator('xpath=ancestor::section')
      .evaluate((element) => getComputedStyle(element).borderRadius);
    expect(panelRadius).toBe('12px');

    // Contrast audit against the design tokens (WCAG AA >= 4.5:1).
    const contrast = await page.evaluate(() => {
      const lum = (rgb: string): number => {
        const [r, g, b] = rgb
          .match(/\d+/g)!
          .map(Number)
          .map((c) => {
            const s = c / 255;
            return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
          });
        return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
      };
      const ratio = (a: string, b: string): number => {
        const [first, second] = [lum(a), lum(b)].sort((x, y) => y - x);
        const hi = first ?? 0;
        const lo = second ?? 0;
        return (hi + 0.05) / (lo + 0.05);
      };
      return {
        mutedOnPage: ratio('rgb(87, 83, 78)', 'rgb(250, 250, 249)'),
        whiteOnPrimary: ratio('rgb(255, 255, 255)', 'rgb(15, 118, 110)'),
        destructiveOnWhite: ratio('rgb(185, 28, 28)', 'rgb(255, 255, 255)'),
        warningOnWhite: ratio('rgb(146, 64, 14)', 'rgb(255, 255, 255)'),
      };
    });
    expect(contrast.mutedOnPage).toBeGreaterThan(4.5);
    expect(contrast.whiteOnPrimary).toBeGreaterThan(4.5);
    expect(contrast.destructiveOnWhite).toBeGreaterThan(4.5);
    expect(contrast.warningOnWhite).toBeGreaterThan(4.5);

    // Visible focus ring on keyboard focus.
    await page.keyboard.press('Tab');
    const ring = await page.getByLabel('City').evaluate((element) => {
      const style = getComputedStyle(element);
      return { outline: style.outlineStyle, boxShadow: style.boxShadow };
    });
    expect(ring.outline !== 'none' || ring.boxShadow !== 'none').toBe(true);
  });

  test('success result honours the price typography', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(mainStack.webUrl);
    await fillSearch(page, 'Sydney');
    await page.getByRole('button', { name: /search rates/i }).click();
    await expect(page.getByText('Circular Quay Hotel')).toBeVisible();
    const priceStyle = await page.getByText('$120.00').evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        fontVariantNumeric: style.fontVariantNumeric,
      };
    });
    expect(priceStyle.fontSize).toBe('32px');
    expect(priceStyle.fontWeight).toBe('600');
    expect(priceStyle.fontVariantNumeric).toContain('tabular-nums');
    const hotelTitle = await page
      .getByText('Circular Quay Hotel')
      .evaluate((element) => getComputedStyle(element).fontSize);
    expect(hotelTitle).toBe('20px');
  });

  test('long content and errors do not cause horizontal overflow', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto(mainStack.webUrl);
    // a long city triggers a long validation error message
    await page.getByLabel('City').fill('A'.repeat(101));
    await page.getByRole('button', { name: /search rates/i }).click();
    await expect(
      page.getByText('Enter a city name between 2 and 100 characters.'),
    ).toBeVisible();
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });

  test('F20 real browser search reaches Temporal and renders the real result', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(mainStack.webUrl);
    await fillSearch(page, 'Sydney');
    await page.getByRole('button', { name: /search rates/i }).click();
    await expect(page.getByText('Circular Quay Hotel')).toBeVisible();
    await expect(page.getByText('$120.00')).toBeVisible();
    await expect(page.getByText('Supplier A')).toBeVisible();
    await expect(page.getByText('All suppliers checked.')).toBeVisible();
    await expect(page.getByText('Best available rate')).toBeVisible();
    await expect(page.getByText('AUD · total for 3 nights')).toBeVisible();
    await page.screenshot({
      path: 'artifacts/qa/desktop-success.png',
      fullPage: true,
    });
  });

  test('unknown city shows the empty state, not an error', async ({ page }) => {
    await page.goto(mainStack.webUrl);
    await fillSearch(page, 'Zurich');
    await page.getByRole('button', { name: /search rates/i }).click();
    await expect(page.getByText('No hotels found')).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.screenshot({
      path: 'artifacts/qa/desktop-empty.png',
      fullPage: true,
    });
  });

  test('client validation blocks an invalid submit in the browser', async ({
    page,
  }) => {
    await page.goto(mainStack.webUrl);
    await page.getByLabel('Check-in').fill('2030-10-12');
    await page.getByLabel('Check-out').fill('2030-10-10');
    await page.getByRole('button', { name: /search rates/i }).click();
    await expect(
      page.getByText('Check-out must be after check-in.'),
    ).toBeVisible();
    await expect(page.getByText('Comparing hotel rates…')).toHaveCount(0);
  });

  test('keyboard flow: tab order and Enter submit', async ({ page }) => {
    await page.goto(mainStack.webUrl);
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('City')).toBeFocused();
    await page.keyboard.type('Melbourne');
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Check-in')).toBeFocused();
    await page.getByLabel('Check-in').fill('2030-10-12');
    // Chromium date inputs keep Tab inside their segments; keep tabbing
    // until the real next control takes focus (native browser behaviour).
    const tabUntil = async (
      locator: ReturnType<Page['getByLabel']> | ReturnType<Page['getByRole']>,
      max = 8,
    ): Promise<void> => {
      for (let index = 0; index < max; index += 1) {
        if (
          await locator.evaluate(
            (element) => element === document.activeElement,
          )
        )
          return;
        await page.keyboard.press('Tab');
      }
      throw new Error('Expected control never received focus');
    };
    await tabUntil(page.getByLabel('Check-out'));
    await page.getByLabel('Check-out').fill('2030-10-15');
    await tabUntil(page.getByRole('button', { name: /search rates/i }));
    await page.keyboard.press('Enter');
    await expect(page.getByText('Laneway Boutique')).toBeVisible();
    await expect(page.getByText('$160.00')).toBeVisible();
  });

  test('F18 reduced motion keeps the app functional', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(mainStack.webUrl);
    await fillSearch(page, 'Sydney');
    await page.getByRole('button', { name: /search rates/i }).click();
    await expect(page.getByText('Circular Quay Hotel')).toBeVisible();
  });

  test('F19 mobile viewports have no horizontal overflow', async ({ page }) => {
    for (const width of [320, 375]) {
      await page.setViewportSize({ width, height: 720 });
      await page.goto(mainStack.webUrl);
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      );
      expect(overflow).toBe(false);
      if (width === 375) {
        await fillSearch(page, 'Sydney');
        await page.getByRole('button', { name: /search rates/i }).click();
        await expect(page.getByText('Circular Quay Hotel')).toBeVisible();
        await page.screenshot({
          path: 'artifacts/qa/mobile-success.png',
          fullPage: true,
        });
      }
    }
    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto(mainStack.webUrl);
    await page.screenshot({
      path: 'artifacts/qa/tablet-idle.png',
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(mainStack.webUrl);
    await page.screenshot({
      path: 'artifacts/qa/desktop-idle.png',
      fullPage: true,
    });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(mainStack.webUrl);
    await page.screenshot({
      path: 'artifacts/qa/mobile-idle.png',
      fullPage: true,
    });
  });
});

test.describe('cancellation stack (hanging suppliers)', () => {
  test('browser cancel runs the whole chain and shows a calm cancelled state', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(cancelStack.webUrl);
    await fillSearch(page, 'Sydney');
    await page.getByRole('button', { name: /search rates/i }).click();
    await expect(page.getByText('Comparing hotel rates…')).toBeVisible();
    await expect(
      page.getByRole('button', { name: /cancel search/i }),
    ).toBeVisible();
    await page.screenshot({
      path: 'artifacts/qa/mobile-loading.png',
      fullPage: true,
    });
    await page.getByRole('button', { name: /cancel search/i }).click();
    await expect(page.getByText('Search cancelled.')).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByLabel('City')).toHaveValue('Sydney');
    await expect(
      page.getByRole('button', { name: /search rates/i }),
    ).toBeVisible();
    await page.screenshot({
      path: 'artifacts/qa/mobile-cancelled.png',
      fullPage: true,
    });

    // The backend chain must end in a Temporal CANCELED execution. Give the
    // cancellation propagation a moment to settle, then poll visibility.
    await page.waitForTimeout(2000);
    let cancelledVisible = false;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const executions = temporalClient.workflow.list({
        query: 'WorkflowType="searchHotels"',
      });
      for await (const info of executions) {
        if (info.status.name === 'CANCELLED') cancelledVisible = true;
      }
      if (cancelledVisible) break;
      await page.waitForTimeout(1000);
    }
    expect(cancelledVisible).toBe(true);
  });

  test('over-deadline suppliers surface the recoverable service error', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(cancelStack.webUrl);
    await fillSearch(page, 'Sydney');
    await page.getByRole('button', { name: /search rates/i }).click();
    await expect(page.getByText('Comparing hotel rates…')).toBeVisible();
    await expect(
      page.getByText("We couldn't retrieve hotel rates. Please try again."),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByText(/Search reference:/)).toBeVisible();
    await expect(
      page.getByRole('button', { name: /try again/i }),
    ).toBeVisible();
    await expect(page.getByLabel('City')).toHaveValue('Sydney');
    await page.screenshot({
      path: 'artifacts/qa/desktop-error.png',
      fullPage: true,
    });
  });
});

test.describe('partial stack (A fails, B succeeds)', () => {
  test('partial result shows the offer with the gentle warning', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(partialStack.webUrl);
    await fillSearch(page, 'Sydney');
    await page.getByRole('button', { name: /search rates/i }).click();
    await expect(page.getByText('Bridge Suites')).toBeVisible();
    await expect(page.getByText('$150.00')).toBeVisible();
    await expect(
      page.getByText(
        'Best available rate — one supplier could not be checked.',
      ),
    ).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.screenshot({
      path: 'artifacts/qa/desktop-partial.png',
      fullPage: true,
    });
  });
});
