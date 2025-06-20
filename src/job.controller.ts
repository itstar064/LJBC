import { sendMessage } from "./bot";
import Job from "./models/Job";
import { ScrapedJobType } from "./types/job";
import { delay, isEmpty } from "./utils";

const processScrapedJob = async (userid: string, jobs: ScrapedJobType[]) => {
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const jobid = job.url.split("/").pop();
    const exist = await Job.findOne({ id: jobid });
    if (isEmpty(exist)) {
      await Job.create({ id: jobid });
      await sendMessage(
        userid,
        `🔉 <b>${job.title}</b>\n\n` +
          `<b>カテゴリ:</b> ${job.category}\n` +
          `<b>投稿者:</b> ${job.employer}\n` +
          `<b>掲載日:</b> ${job.postedDate}\n` +
          `<b>締切:</b> ${job.deadline}（残り${job.daysLeft}日）\n` +
          (job.price ? `<b>報酬:</b> ${job.price}\n` : "") +
          (job.suggestions ? `<b>提案数:</b> ${job.suggestions}\n` : "") +
          `\n<b>詳細:</b>\n${job.desc}\n\n`,
        job.url,
        job.employerUrl,
        jobid,
      );
    }
    await delay(200);
  }
};

export default processScrapedJob;
