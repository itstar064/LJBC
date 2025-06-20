import config from "@/config";
import { login, useRealBrowser } from "@/scraper";
import { delay } from "@/utils";
import { existsSync, mkdirSync } from "fs";
import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/chat";

const basicUrl = "https://crowdworks.jp/proposals/new?job_offer_id=";
const openai = new OpenAI({
  apiKey: config.OPENAI_API,
});
const systemPrompt = `求人広告の入札文を作成する際は、できる限り最適なバージョンを作成するようにしてください。ロボット的だったり、過度に売り込みがちになったりせず、人間的で自然なトーンでなければなりません。専門用語は必要に応じて使用しつつも、メッセージは会話調にしてください。

入札文にはダッシュを使用せず、自然でリアルなトーン、つまり無駄な言葉や過度に甲高い言葉遣いは避けてください。入札文は、ネイティブの日本人が話しているように聞こえるものでなければなりません。

入札文は、親しみやすい挨拶で始めましょう。

入札文の構成は以下のとおりです。

* まず、タスクまたはプロジェクトを明確に理解していることを示します。
* 次に、仕事に関連する私の経験について説明します。
* その後、タスクにどのようにアプローチし、どのように処理していくかを段階的に説明します。
* 次に、プロジェクトに関する個人的な推奨事項や洞察を追加します。
* 最後に、プロジェクトを完全に処理できると自信を持って述べます。

最後に、「ご連絡をお待ちしております」「ありがとうございます」「さらに詳しくお話しするために、お話しさせていただければ幸いです」などの言葉で締めくくります。

入札では箇条書きやダッシュを使用しないでください。段落形式で記入してください。`;

export const placeBid = async (jobid) => {
  try {
    const jobUrl = `${basicUrl}${jobid}`;
    const { browser, page } = await useRealBrowser();
    try {
      await page!.setViewport({ width: 1220, height: 860 });
      await login(page!);
      await delay(3000);
    } catch (err) {
      console.error("Error setting viewport:", (err as Error).message);
    }

    await page.goto(jobUrl, {
      waitUntil: "domcontentloaded",
    });

    const description = await page.$eval(
      ".description",
      (el) => el.textContent?.trim() || "",
    );
    const bidText = await generateBidText(description);
    await page.waitForSelector(
      'input[type="radio"][value=true][name="without_condition"]',
    );
    await page.click(
      'input[type="radio"][value=true][name="without_condition"]',
    ); // Select the first radio button for bid type

    await page.type("textarea", bidText);

    await page.waitForSelector('input[type="submit"][name="commit"]');
    await page.click('input[type="submit"][name="commit"]');

    // Ensure the screenshots directory exists before saving the screenshot
    const screenshotsDir = `${process.cwd()}/screenshots`;
    if (!existsSync(screenshotsDir)) {
      mkdirSync(screenshotsDir, { recursive: true });
    }
    await page.screenshot({
      path: `${screenshotsDir}/bid.png`,
    });

    await delay(2000); // Wait for 2 seconds before clicking the submit button

    await page.close();
    await browser.close();
  } catch (error) {
    console.error("Error placing bid:", error);
  }
};

const generateBidText = async (description: string) => {
  const message = `この仕事に入札するためのテキストを作成してください。そうすれば、それを利用することができます。入札テキストのみを返信し、他のテキストは含めないでください。\n\n${description}`;
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: message },
  ];

  const completion = await openai.chat.completions.create({
    messages,
    model: "gpt-4o",
    max_tokens: 2000,
  });

  const botReply = (completion.choices[0].message.content || "").replace(
    /"/g,
    "",
  );
  return botReply;
};
