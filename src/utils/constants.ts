import chromium from "@sparticuz/chromium";
export const BROWSER_ARGS: string[] = [
    ...chromium.args,
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-setuid-sandbox",
    "--no-sandbox",
    "--single-process",
    "--no-zygote",
    "--ignore-certificate-errors",
  ];
  export const VIEWPORT: { width: number; height: number } = {
    width: 1280,
    height: 720,
  };
  export const USER_AGENT: string =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36";
  export const TIMEOUT_NAVIGATION: number = 60000;
  export const TIMEOUT_SELECTOR: number = 60000;
  export const PARAMETERS: Record<string, any> = {
    url: "https://flights.aegeanair.com/en/flights-from-istanbul-to-athens",
    selector: 'div[data-em-cmp="flights-booking"]',
  };