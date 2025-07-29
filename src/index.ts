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

/**
 * AWS Lambda handler function for automated web screenshot capture and S3 storage.
 *
 * This function automates the process of taking screenshots of specific web elements
 * using Playwright in a serverless AWS Lambda environment. It navigates to the Aegean Air
 * flights booking page, captures a screenshot of the flight booking component, and uploads
 * it to an S3 bucket for storage and retrieval.
 *
 * @description
 * The handler performs the following operations:
 * 1. Initializes a headless Chromium browser instance optimized for Lambda
 * 2. Navigates to the target URL (Aegean Air flights page)
 * 3. Waits for the specific flight booking component to load
 * 4. Captures a screenshot of the target element
 * 5. Uploads the screenshot to AWS S3 with a timestamped filename
 * 6. Returns the S3 URL and operation status
 *
 * @param {APIGatewayProxyEvent} event - The API Gateway event object containing:
 *   - httpMethod: The HTTP method used for the request
 *   - headers: Request headers including authorization and content-type
 *   - queryStringParameters: URL query parameters (optional)
 *   - body: Request body content (optional)
 *   - pathParameters: Path parameters from the URL (optional)
 *   - requestContext: Additional request context from API Gateway
 *
 * @param {Context} [context] - Optional AWS Lambda context object containing:
 *   - functionName: Name of the Lambda function
 *   - functionVersion: Version of the Lambda function
 *   - invokedFunctionArn: ARN of the invoked function
 *   - memoryLimitInMB: Memory limit configured for the function
 *   - remainingTimeInMillis: Remaining execution time
 *   - logGroupName: CloudWatch log group name
 *   - logStreamName: CloudWatch log stream name
 *   - awsRequestId: Unique request identifier
 *
 * @returns {Promise<APIGatewayProxyResult>} A promise that resolves to an API Gateway response object containing:
 *   - statusCode: HTTP status code (200 for success, 500 for errors)
 *   - headers: Response headers including Content-Type
 *   - body: JSON stringified response body with:
 *     - message: Success or error message
 *     - timestamp: ISO timestamp of the operation
 *     - screenshotUrl: S3 URL of the captured screenshot (on success)
 *     - event: Original event object for debugging
 *
 * @throws {Error} Throws various errors that are caught and returned as 500 responses:
 *   - Browser launch failures due to Lambda environment constraints
 *   - Navigation timeouts when the target page fails to load
 *   - Element not found errors when the flight booking component is missing
 *   - File system errors during screenshot saving
 *   - S3 upload failures due to permissions or network issues
 *
 * @example
 * // Example successful response
 * {
 *   statusCode: 200,
 *   headers: { "Content-Type": "application/json" },
 *   body: JSON.stringify({
 *     message: "Success",
 *     timestamp: "2024-01-15T10:30:45.123Z",
 *     screenshotUrl: "https://technical-playwright-result.s3.amazonaws.com/screenshots/aegean-flight-booking-2024-01-15T10-30-45-123Z.png",
 *     event: { ... }
 *   })
 * }
 *
 * @example
 * // Example error response
 * {
 *   statusCode: 500,
 *   headers: { "Content-Type": "application/json" },
 *   body: JSON.stringify({
 *     message: "Error: Flight booking component not found",
 *     timestamp: "2024-01-15T10:30:45.123Z",
 *     screenshotUrl: null,
 *     event: { ... }
 *   })
 * }
 *
 * @requires playwright-core - For browser automation
 * @requires @sparticuz/chromium - Chromium binary optimized for Lambda
 * @requires @aws-sdk/client-s3 - AWS S3 client for file uploads
 *
 * @environment
 * Required environment variables:
 * - AWS_REGION: AWS region for S3 operations (defaults to 'us-east-2')
 * - AWS_S3_BUCKET: S3 bucket name for screenshot storage (defaults to 'technical-playwright-result')
 *
 * @performance
 * - Average execution time: 15-30 seconds (depending on page load time)
 * - Memory usage: ~512MB recommended minimum
 * - Timeout: Configure Lambda timeout to at least 60 seconds
 *
 * @security
 * - Requires appropriate IAM permissions for S3 PutObject operations
 * - Screenshots are stored with public read access via S3 URLs
 * - No sensitive data should be captured in screenshots
 *
 * @version 1.0.0
 * @since 2025-07-24
 * @author a11ySolutions Development Team
 */
export const handler = async (
  event: APIGatewayProxyEvent,
  context?: Context
): Promise<APIGatewayProxyResult> => {
  let browser: any = null;
  let screenshotUrl: string | null = null;
  let statusCode = 200;
  let message = "Success";

  try {
    // Ensure necessary directories exist
    await ensureDirectoriesExist();

    // Launch browser with configuration suitable for Lambda
    browser = await playwright.launch({
      args: BROWSER_ARGS,
      executablePath: await chromium.executablePath(),
    });

    const context = await browser.newContext({
      viewport: VIEWPORT,
      userAgent: USER_AGENT,
    });

    const page = await context.newPage();

    // Configure timeouts longer for Lambda environment
    page.setDefaultNavigationTimeout(TIMEOUT_NAVIGATION);

    // Navigate to Aegean Air page
    await page.goto(PARAMETERS.url, {
      waitUntil: "domcontentloaded",
      timeout: TIMEOUT_NAVIGATION,
    });

    // Wait for the specific selector to be visible
    await page.waitForSelector(PARAMETERS.selector, {
      state: "visible",
      timeout: TIMEOUT_SELECTOR,
    });

    // Take screenshot of the specific element
    const element = await page.$(PARAMETERS.selector);

    if (!element) {
      throw new Error("Flight booking component not found");
    }

    const screenshotPath = "/tmp/screenshots/flight-booking-component.png";
    await element.screenshot({ path: screenshotPath });

    // Generate unique filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `${
      (process.env.PREFIX, "")
    }-aegean-flight-booking-${timestamp}.png`;

    // Verify that the file exists before uploading
    try {
      await fs.access(screenshotPath);
    } catch (error: any) {
      console.error(`Error accessing screenshot file: ${error.message}`);
      throw new Error(`Screenshot file not found at ${screenshotPath}`);
    }

    // Initialize S3 client
    const s3Client = new S3Client({
      region: process.env.AWS_REGION || "us-east-2",
    });
    const bucketName =
      process.env.AWS_S3_BUCKET || "technical-playwright-result";

    // Upload screenshot to S3
    const fileContent = await fs.readFile(screenshotPath);

    const params = {
      Bucket: bucketName,
      Key: `screenshots/${filename}`,
      Body: fileContent,
      ContentType: "image/png",
    };

    const uploadCommand = new PutObjectCommand(params);
    await s3Client.send(uploadCommand);

    // Generate URL for the uploaded screenshot
    screenshotUrl = `https://${bucketName}.s3.amazonaws.com/screenshots/${filename}`;
  } catch (error: any) {
    console.error("Error:", error);
    console.error("Stack trace:", error.stack);
    statusCode = 500;
    message = `Error: ${error.message}`;
  } finally {
    // Close browser if it was opened
    if (browser) {
      try {
        await browser.close();
      } catch (closeError: any) {
        console.error("Error closing browser:", closeError);
      }
    }
  }

  // Create response with URL of the screenshot if it was successful
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
    }),
  };
  return response;
};
