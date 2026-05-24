import {
  answerTelegramCallbackQuery,
  buildReportEmail,
  sendReportEmail,
  sendTelegramMessage,
} from "@/app/lib/integrations";
import {
  createTaskFromTelegramText,
  loadRahboardData,
} from "@/app/lib/rahboard-store";
import { buildSprintReport } from "@/app/lib/reporting";

export const runtime = "nodejs";

type TelegramUpdate = {
  message?: {
    chat: { id: number | string };
    text?: string;
  };
  channel_post?: {
    chat: { id: number | string };
    text?: string;
  };
  callback_query?: {
    id: string;
    data?: string;
    message?: {
      chat: { id: number | string };
    };
  };
};

const taskRegistrationKeyboard = {
  inline_keyboard: [[{ text: "ثبت تسک", callback_data: "new_task" }]],
};

const taskRegistrationTemplate = [
  "برای ثبت تسک، این قالب را پر کن و بفرست:",
  "",
  "ثبت تسک",
  "عنوان: ",
  "توضیح: ",
].join("\n");

const isTaskRegistrationRequest = (text: string) =>
  /^(\/start|\/help|\/new_task|\/task|ثبت\s*تسک)$/i.test(text.trim());

const verifySecret = (request: Request) => {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) return true;
  return request.headers.get("x-telegram-bot-api-secret-token") === expected;
};

export async function GET() {
  return Response.json({
    ok: true,
    route: "telegram webhook",
    message: "Use Telegram setWebhook to send POST updates to this URL.",
  });
}

export async function POST(request: Request) {
  if (!verifySecret(request)) {
    return Response.json({ ok: false, error: "Invalid Telegram secret." }, { status: 401 });
  }

  try {
    const update = (await request.json()) as TelegramUpdate;
    const callback = update.callback_query;

    if (callback?.data === "new_task") {
      const callbackChatId = callback.message?.chat.id;

      try {
        await answerTelegramCallbackQuery(callback.id, "قالب ثبت تسک ارسال شد.");
      } catch (error) {
        console.error("Telegram callback answer error:", error);
      }

      if (callbackChatId) {
        await sendTelegramMessage(callbackChatId, taskRegistrationTemplate, {
          parseMode: "none",
          replyMarkup: taskRegistrationKeyboard,
        });
      }

      return Response.json({ ok: true, command: "new_task_callback" });
    }

    const item = update.channel_post || update.message;
    const chatId = item?.chat.id;
    const text = item?.text?.trim();

    if (!chatId || !text) {
      return Response.json({ ok: true, ignored: true });
    }

    if (isTaskRegistrationRequest(text)) {
      await sendTelegramMessage(chatId, taskRegistrationTemplate, {
        parseMode: "none",
        replyMarkup: taskRegistrationKeyboard,
      });

      return Response.json({ ok: true, command: "new_task_prompt" });
    }

    if (text.startsWith("/sprint_report")) {
      const emailTo = process.env.SPRINT_REPORT_EMAIL_TO;
      const data = await loadRahboardData();
      const sprint = data.sprints.find((entry) => entry.status === "active") || data.sprints[0] || null;
      const report = buildSprintReport({
        sprint,
        tasks: data.tasks,
        users: data.users,
        projects: data.projects,
        activityLogs: data.activityLogs,
      });
      const email = await buildReportEmail(report);
      const delivery = emailTo
        ? await sendReportEmail({
            to: emailTo,
            subject: email.subject,
            text: email.text,
          })
        : null;

      try {
        await sendTelegramMessage(
          chatId,
          delivery?.sent
            ? "گزارش اسپرینت ایمیل شد."
            : "گزارش ساخته شد، ولی ایمیل مقصد یا سرویس ارسال تنظیم نشده است.",
          { replyMarkup: taskRegistrationKeyboard }
        );
      } catch (error) {
        console.error("Telegram report reply error:", error);
      }

      return Response.json({ ok: true, command: "sprint_report", delivery });
    }

    const task = await createTaskFromTelegramText(text);
    try {
      await sendTelegramMessage(chatId, `تسک ساخته شد: ${task.code}\n${task.title}`, {
        replyMarkup: taskRegistrationKeyboard,
      });
    } catch (error) {
      console.error("Telegram task reply error:", error);
    }

    return Response.json({ ok: true, task });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
