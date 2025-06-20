import { launchBot } from "@/bot";
import { connectDBWithRetry } from "@/db";
import { startScraping } from "@/scraper";

(async () => {
  await connectDBWithRetry();
  const status = await launchBot();
  console.log(status);
  startScraping();
})();
