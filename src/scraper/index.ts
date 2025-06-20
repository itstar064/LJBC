import { delay, isEmpty } from "@/utils";
import { connect, PageWithCursor } from "puppeteer-real-browser";
import config from "@/config";
import processScrapedJob from "@/job.controller";
import { existsSync, mkdirSync } from "fs";

let scraping = false;
const searchUrls = [
  "https://www.lancers.jp/work/search/system?open=1&ref=header_menu",
  "https://www.lancers.jp/work/search/web?open=1&ref=header_menu",
];

export const useRealBrowser = async () => {
  try {
    const { browser, page } = await connect({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled",
      ],
      customConfig: {},
      turnstile: true,
      connectOption: {
        protocolTimeout: 100000, // set to 60 seconds or whatever you need
      },
      disableXvfb: false,
      ignoreAllFlags: false,
    });

    return { browser, page };
  } catch (err) {
    console.error("Error in useRealBrowser:", (err as Error).message);
    throw err;
  }
};

export const login = async (page: PageWithCursor) => {
  try {
    await page.goto("https://www.lancers.jp/user/login", {
      waitUntil: "domcontentloaded",
    });

    await page.type('input[id="UserEmail"]', config.EMAIL, { delay: 150 });

    await page.type('input[id="UserPassword"]', config.PASSWORD, { delay: 150 });

    await page.click('button[type="submit"]');
    console.log("🔓 Submitted login form");
  } catch (err) {
    console.error("Error in login:", (err as Error).message);
    throw err;
  }
};

export async function scrapeJobs() {
  let iteration = 0;
  const RESTART_BROWSER_EVERY = 100; // Restart browser every 100 cycles to avoid memory leaks

  let browser: Awaited<ReturnType<typeof useRealBrowser>>["browser"] | null =
    null;
  let page: Awaited<ReturnType<typeof useRealBrowser>>["page"] | null = null;

  while (true) {
    if (!scraping) {
      try {
        if (page) await page.close().catch(() => {});
      } catch (err) {
        console.error("Error closing page:", (err as Error).message);
      }
      try {
        if (browser) await browser.close().catch(() => {});
      } catch (err) {
        console.error("Error closing browser:", (err as Error).message);
      }
    }

    try {
      // Restart browser every N iterations or if not initialized
      if (iteration % RESTART_BROWSER_EVERY === 0 || !browser || !page) {
        console.log("♻️ Restarting browser to free resources...");
        try {
          if (page) await page.close().catch(() => {});
        } catch (err) {
          console.error("Error closing page:", (err as Error).message);
        }
        try {
          if (browser) await browser.close().catch(() => {});
        } catch (err) {
          console.error("Error closing browser:", (err as Error).message);
        }
        let realBrowser;
        try {
          realBrowser = await useRealBrowser();
        } catch (err) {
          console.error("Error creating real browser:", (err as Error).message);
          await delay(5000);
          continue;
        }
        browser = realBrowser.browser;
        page = realBrowser.page;
        iteration = 0;

        try {
          await page!.setViewport({ width: 1220, height: 860 });
        } catch (err) {
          console.error("Error setting viewport:", (err as Error).message);
        }
        try {
          await login(page!);
        } catch (err) {
          console.error("Error during login:", (err as Error).message);
          await delay(2000);
          continue;
        }

        await delay(5000);
      }
      iteration++;

      if (!scraping) break;
      try {
        const searchUrl = searchUrls[iteration % 2];

        if (isEmpty(searchUrl)) continue;

        try {
          await page!.goto(searchUrl, {
            waitUntil: "domcontentloaded",
            timeout: 20000,
          });
        } catch (err) {
          console.error(
            "Error navigating to searchUrl:",
            (err as Error).message
          );
          continue;
        }
        const MAX_RETRIES = 30;
        let jobs = [];

        //After page title is found, try to scrape with retries
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
          try {
            // Wait for at least one job card to appear
            const jobCards = await page!.$$("div.p-search-job-media.c-media.c-media--item");
            if (jobCards.length === 0) {
              console.log(
                `🕵️ Waiting for job cards... (${attempt + 1}/${MAX_RETRIES})`
              );
              await delay(1000);
              continue;
            }

            // Ensure the screenshots directory exists before saving the screenshot
            const screenshotsDir = `${process.cwd()}/screenshots`;
            if (!existsSync(screenshotsDir)) {
              mkdirSync(screenshotsDir, { recursive: true });
            }
            await page.screenshot({
              path: `${screenshotsDir}/job_cards.png`,
            });

            jobs = await page!.evaluate(() => {
              const cardNodes = document.querySelectorAll("div.p-search-job-media.c-media.c-media--item");
              const results: any[] = [];

              cardNodes.forEach((card) => {
                // Title and URL
                const titleAnchor = card.querySelector("a.p-search-job-media__title");
                const title = titleAnchor?.textContent?.trim() || "";
                let url = titleAnchor?.getAttribute("href") || "";
                if (url && !url.startsWith("http")) {
                  url = `https://lancers.jp/${url}`;
                }

                // Price (reward)
                const priceNode = card.querySelector(".p-search-job-media__price");
                let price = "";
                if (priceNode) {
                  price = priceNode.textContent?.replace(/\s+/g, " ").trim() || "";
                }

                // Days left
                const daysLeft = card.querySelector(".p-search-job-media__time-remaining")?.textContent?.trim() || "";

                // Employer name and profile URL
                const employerAnchor = card.querySelector(".p-search-job-media__avatar-note a");
                const employer = employerAnchor?.textContent?.trim() || "";
                let employerUrl = employerAnchor?.getAttribute("href") || "";
                if (employerUrl && !employerUrl.startsWith("http")) {
                  employerUrl = `https://lancers.jp/${employerUrl}`;
                }

                // Employer avatar
                const employerAvatar = card.querySelector(".p-search-job-media__avatar-image-wrapper img")?.getAttribute("src") || "";

                // Number of winners and applicants
                const winnerNode = card.querySelectorAll(".p-search-job-media__propose-number")[0];
                const applicantNode = card.querySelectorAll(".p-search-job-media__propose-number")[1];
                const winners = winnerNode?.textContent?.trim() || "";
                const applicants = applicantNode?.textContent?.trim() || "";
                const suggestions = `${winners}/${applicants}`;

                // Category
                const category = card.querySelector(".p-search-job__division-link")?.textContent?.trim() || "";

                // Description (if available)
                const desc = card.querySelector(".c-media__description")?.textContent?.trim() || "";

                results.push({
                  title,
                  url,
                  desc,
                  category,
                  price,
                  suggestions,
                  daysLeft,
                  employer,
                  employerUrl,
                  employerAvatar,
                });
              });

              return results;
            });

            break;
          } catch (err) {
            console.error(
              `⚠️ Error during scrape attempt ${attempt + 1}:`,
              err
            );
            continue;
          }
        }

        if (jobs.length === 0) {
          console.log("❌ Failed to scrape jobs after multiple attempts.");
        } else {
          console.log("✅ Scraped jobs", jobs.length);
        }

        try {
          console.log(jobs);
          processScrapedJob(config.ADMIN_ID, jobs.reverse());
        } catch (err) {
          console.error("Error in processScrapedJob:", (err as Error).message);
        }
        await delay(30000);
      } catch (err) {
        console.error("Error in user scraping loop:", (err as Error).message);
        continue;
      }
    } catch (err) {
      console.error("Error in scrapeJobs loop:", (err as Error).message);
    }
    // No longer close browser/page here; handled by restart logic above
  }
}

export const startScraping = async () => {
  try {
    scraping = true;
    await scrapeJobs();
  } catch (error) {
    console.error(
      "Error occurred while scraping jobs:",
      (error as Error).message
    );
  }
};

export const stopScraping = () => {
  scraping = false;
};

export const getScrapingStatus = () => {
  return scraping;
};
