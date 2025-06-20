import config from "@/config";
import { isEmpty } from "@/utils";
import { Telegraf } from "telegraf";
import { getScrapingStatus, startScraping, stopScraping } from "@/scraper";
import { placeBid } from "@/bidder";
import Job from "@/models/Job";

const commands: {
  command: string;
  description: string;
}[] = [
  { command: "start", description: "Start the bot" },
  {
    command: "start_scraping",
    description: "Start scraping job postings",
  },
  {
    command: "stop_scraping",
    description: "Stop scraping job postings",
  },
];

let placingBid = false;

const setup_commands = async (bot: Telegraf) => {
  await bot.telegram.setMyCommands(commands);

  bot.start(async (ctx) => {
    try {
      await ctx.reply(
        `Welcome to the *CrowedWorks Job Bidder Bot*, please select one of the following options.\n\n If you need assistance, please contact @stellaray777`,
        {
          parse_mode: "Markdown",
        },
      );
    } catch (error) {
      console.error("Error in /start:", error);
      await ctx.reply("An error occurred. Please try again later.");
    }
  });

  // Listen for callback queries (button clicks)
  bot.on("callback_query", async (ctx) => {
    try {
      if (placingBid) {
        await ctx.answerCbQuery("Please wait, a bid is already being placed.");
        return;
      }
      placingBid = true;
      const data = (ctx.callbackQuery as any).data;
      if (data && data.startsWith("bid_action|")) {
        const [, clickedChatId] = data.split("|");
        // You now know which chat's button was clicked
        console.log("Placing bid for job: ", clickedChatId);

        if (isEmpty(clickedChatId)) {
          await ctx.answerCbQuery("Invalid job ID.");
          return;
        }

        const job = await Job.findOne({
          id: clickedChatId,
        });

        if (job.bidPlaced) {
          await ctx.answerCbQuery(
            "You have already placed a bid for this job.",
          );
          return;
        }

        await placeBid(clickedChatId);

        job.bidPlaced = true;
        await job.save();

        placingBid = false;
        try {
          await ctx.answerCbQuery("Bid received!");
        } catch (error) {
          console.error("Error answering callback query:", error);
        }
        await ctx.reply("Bid placed successfully!");
      }
    } catch (error) {
      console.error("Error handling callback query:", error);
      await ctx.reply("An error occurred. Please try again later.");
    }
  });

  let canStart = false;

  bot.command("start_scraping", async (ctx) => {
    try {
      const userId = ctx.update.message.from.id;
      if (config.ADMIN_ID !== userId.toString())
        return await ctx.reply(`🚫 This command is for admin only.`);

      const scraping = getScrapingStatus();

      if (scraping) return await ctx.reply("Scraping is already ongoing.");

      if (!canStart)
        return await ctx.reply("Scraping is not allowed to start for now.");

      await ctx.reply("🔍 Scraping started.");
      startScraping();
    } catch (error) {
      console.error("Error in /start_scraping:", error);
      await ctx.reply("An error occurred. Please try again later.");
    }
  });

  bot.command("stop_scraping", async (ctx) => {
    try {
      const userId = ctx.update.message.from.id;
      if (config.ADMIN_ID !== userId.toString())
        return await ctx.reply(`🚫 This command is for admin only.`);

      const scraping = getScrapingStatus();

      if (!scraping) return await ctx.reply("Scraping is not ongoing.");

      canStart = false;

      setTimeout(() => {
        canStart = true;
      }, 60000);

      await ctx.reply("🛑 Scraping stopped.");
      stopScraping();
    } catch (error) {
      console.error("Error in /stop_scraping:", error);
      await ctx.reply("An error occurred. Please try again later.");
    }
  });
};

export default setup_commands;
