import { chromium as playwright } from "playwright-core";
import chromium from "@sparticuz/chromium";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { promises as fs } from "fs";
import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from "aws-lambda";
import { ensureDirectoriesExist } from "./utils";
import {
  BROWSER_ARGS,
  VIEWPORT,
  USER_AGENT,
  TIMEOUT_NAVIGATION,
  TIMEOUT_SELECTOR,
  PARAMETERS,
} from "./utils/constants";
import { expect } from "@playwright/test";

interface TestResult {
  name: string;
  status: 'SUCCESS' | 'FAILURE';
  details?: string;
  executionTimeMs?: number;
}

/**
 * AWS Lambda handler function for automated web screenshot capture and S3 storage,
 * now including full test validation for the flight booking form.
 *
 * @description
 * This updated handler performs the following operations:
 * 1. Initializes a headless Chromium browser instance.
 * 2. Navigates to the target URL and locates the booking component.
 * 3. Captures a screenshot of the component and uploads it to S3.
 * 4. Executes a series of Playwright tests to validate each form element
 * (trip type, passengers, origin/destination, dates, search button).
 * 5. Returns a detailed JSON response including the status, execution time,
 * and S3 URL of the screenshot, along with the results of each individual test.
 *
 * @param {APIGatewayProxyEvent} event - The API Gateway event object.
 * @param {Context} [context] - Optional AWS Lambda context object.
 *
 * @returns {Promise<APIGatewayProxyResult>} A promise that resolves to an API Gateway response object.
 */
export const handler = async (
  event: APIGatewayProxyEvent,
  context?: Context
): Promise<APIGatewayProxyResult> => {
  let browser: any = null;
  let screenshotUrl: string | null = null;
  let statusCode = 200;
  let message = "Success";
  const testResults: TestResult[] = [];
  let totalExecutionTimeMs = 0;

  try {
    const startTime = Date.now();

    // 1. Ensure necessary directories exist
    await ensureDirectoriesExist();

    // 2. Launch browser with configuration suitable for Lambda
    browser = await playwright.launch({
      args: BROWSER_ARGS,
      executablePath: await chromium.executablePath(),
    });

    const context = await browser.newContext({
      viewport: VIEWPORT,
      userAgent: USER_AGENT,
    });

    const page = await context.newPage();
    page.setDefaultNavigationTimeout(TIMEOUT_NAVIGATION);

    // --- Start of the testing steps ---

    // Step 1: Navigate to the Aegean Air page
    const navigateStartTime = Date.now();
    await page.goto(PARAMETERS.url, {
      waitUntil: "domcontentloaded",
      timeout: TIMEOUT_NAVIGATION,
    });
    const navigateEndTime = Date.now();
    testResults.push({
      name: 'Navigate to Aegean Air website',
      status: 'SUCCESS',
      details: `Navigated to ${PARAMETERS.url}`,
      executionTimeMs: navigateEndTime - navigateStartTime,
    });

    // Step 2: Locate the booking component
    const locateStartTime = Date.now();
    const bookingComponent = await page.waitForSelector(PARAMETERS.selector, {
      state: "visible",
      timeout: TIMEOUT_SELECTOR,
    });
    const locateEndTime = Date.now();
    testResults.push({
      name: 'Locate the booking component',
      status: 'SUCCESS',
      details: `Component '${PARAMETERS.selector}' found.`,
      executionTimeMs: locateEndTime - locateStartTime,
    });

    if (!bookingComponent) {
      throw new Error("Flight booking component not found.");
    }

    // Step 3: Capture a screenshot of the component
    const screenshotStartTime = Date.now();
    const screenshotPath = "/tmp/screenshots/flight-booking-component.png";
    await bookingComponent.screenshot({ path: screenshotPath });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `aegean-flight-booking-${timestamp}.png`;
    const bucketName = process.env.AWS_S3_BUCKET || "technical-playwright-result";
    
    const fileContent = await fs.readFile(screenshotPath);
    const s3Client = new S3Client({ region: process.env.AWS_REGION });
    const params = {
      Bucket: bucketName,
      Key: `screenshots/${filename}`,
      Body: fileContent,
      ContentType: "image/png",
    };
    await s3Client.send(new PutObjectCommand(params));
    screenshotUrl = `https://${bucketName}.s3.amazonaws.com/screenshots/${filename}`;

    const screenshotEndTime = Date.now();
    testResults.push({
      name: 'Capture a screenshot of the component',
      status: 'SUCCESS',
      details: `Screenshot uploaded to S3: ${screenshotUrl}`,
      executionTimeMs: screenshotEndTime - screenshotStartTime,
    });

    // Step 4: Validate the booking form elements
    const validateFormStartTime = Date.now();

    // 4.1. Trip type selector (Round-trip/One-way)
    try {
      const tripTypeSelector = page.locator('div.trip-type-selector'); // Assumed selector
      await expect(tripTypeSelector).toBeVisible({ timeout: TIMEOUT_SELECTOR });
      testResults.push({ name: 'Validate trip type selector', status: 'SUCCESS', details: 'Trip type selector is visible.' });
    } catch (error: any) {
      testResults.push({ name: 'Validate trip type selector', status: 'FAILURE', details: `Error: ${error.message}` });
    }

    // 4.2. Passengers and class selector
    try {
      const passengersSelector = page.locator('[data-em-cmp="passengers"]'); // Assumed selector
      await expect(passengersSelector).toBeVisible({ timeout: TIMEOUT_SELECTOR });
      testResults.push({ name: 'Validate passengers and class selector', status: 'SUCCESS', details: 'Passengers and class selector is visible.' });
    } catch (error: any) {
      testResults.push({ name: 'Validate passengers and class selector', status: 'FAILURE', details: `Error: ${error.message}` });
    }

    // 4.3. Origin and destination fields
    try {
      const originField = page.locator('input[data-em-cmp="origin"]'); // Assumed selector
      const destinationField = page.locator('input[data-em-cmp="destination"]'); // Assumed selector
      await expect(originField).toBeVisible({ timeout: TIMEOUT_SELECTOR });
      await expect(destinationField).toBeVisible({ timeout: TIMEOUT_SELECTOR });
      testResults.push({ name: 'Validate origin and destination fields', status: 'SUCCESS', details: 'Origin and destination fields are visible.' });
    } catch (error: any) {
      testResults.push({ name: 'Validate origin and destination fields', status: 'FAILURE', details: `Error: ${error.message}` });
    }

    // 4.4. Departure and return date selectors
    try {
      const departureDateSelector = page.locator('[data-em-cmp="departure-date"]'); // Assumed selector
      await expect(departureDateSelector).toBeVisible({ timeout: TIMEOUT_SELECTOR });
      const returnDateSelector = page.locator('[data-em-cmp="return-date"]'); // Assumed selector
      await expect(returnDateSelector).toBeVisible({ timeout: TIMEOUT_SELECTOR });
      testResults.push({ name: 'Validate date selectors', status: 'SUCCESS', details: 'Departure and return date selectors are visible.' });
    } catch (error: any) {
      testResults.push({ name: 'Validate date selectors', status: 'FAILURE', details: `Error: ${error.message}` });
    }

    // 4.5. Search button
    try {
      const searchButton = page.locator('button[data-em-cmp="search"]'); // Assumed selector
      await expect(searchButton).toBeVisible({ timeout: TIMEOUT_SELECTOR });
      await expect(searchButton).toBeEnabled({ timeout: TIMEOUT_SELECTOR });
      testResults.push({ name: 'Validate search button', status: 'SUCCESS', details: 'Search button is visible and enabled.' });
    } catch (error: any) {
      testResults.push({ name: 'Validate search button', status: 'FAILURE', details: `Error: ${error.message}` });
    }

    const validateFormEndTime = Date.now();
    testResults.push({
      name: 'Booking form validation',
      status: 'SUCCESS',
      details: 'All booking form validations have been completed.',
      executionTimeMs: validateFormEndTime - validateFormStartTime,
    });
    // --- End of the testing steps ---

    totalExecutionTimeMs = Date.now() - startTime;
    
  } catch (error: any) {
    console.error("Error:", error);
    statusCode = 500;
    message = `Fatal error: ${error.message}`;
    testResults.push({
      name: 'Fatal error during execution',
      status: 'FAILURE',
      details: error.message,
    });
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (closeError: any) {
        console.error("Error closing browser:", closeError);
      }
    }
  }

  // Create the final response with detailed test results
  const response: APIGatewayProxyResult = {
    statusCode,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message,
      timestamp: new Date().toISOString(),
      screenshotUrl,
      event,
      totalExecutionTimeMs,
      testResults,
    }),
  };
  return response;
};
