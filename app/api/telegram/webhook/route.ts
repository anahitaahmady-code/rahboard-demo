import {
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
};

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
    const item = update.channel_post || update.message;
    const chatId = item?.chat.id;
    const text = item?.text?.trim();

    if (!chatId || !text) {
      return Response.json({ ok: true, ignored: true });
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
            : "گزارش ساخته شد، ولی ایمیل مقصد یا سرویس ارسال تنظیم نشده است."
        );
      } catch (error) {
        console.error("Telegram report reply error:", error);
      }

      return Response.json({ ok: true, command: "sprint_report", delivery });
    }

    const task = await createTaskFromTelegramText(text);
    try {
      await sendTelegramMessage(chatId, `تسک ساخته شد: ${task.code}\n${task.title}`);
    } catch (error) {
      console.error("Telegram task reply error:", error);
    }

    return Response.json({ ok: true, task });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
