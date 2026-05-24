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
  message?: TelegramMessage;
  channel_post?: TelegramMessage;
  callback_query?: {
    id: string;
    data?: string;
    message?: TelegramMessage;
  };
};

type TelegramMessage = {
  chat: {
    id: number | string;
    type?: "private" | "group" | "supergroup" | "channel";
    title?: string;
  };
  from?: {
    id: number | string;
    username?: string;
    first_name?: string;
    last_name?: string;
  };
  text?: string;
  caption?: string;
  quote?: {
    text?: string;
  };
  reply_to_message?: TelegramMessage;
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

const isWhoAmIRequest = (text: string) =>
  /^(\/whoami(?:@\w+)?|آیدی من|ایدی من|id من)$/i.test(text.trim());

const isGroupChat = (message: TelegramMessage) =>
  message.chat.type === "group" || message.chat.type === "supergroup";

const approvalPattern = /(?:#\s*تایید[\s_]*تسک|#\s*تأیید[\s_]*تسک|\/approve_task(?:@\w+)?)/i;

const getApproverIds = () =>
  (process.env.TELEGRAM_TASK_APPROVER_IDS || "")
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);

const isApprovedMember = (message: TelegramMessage) => {
  const approverIds = getApproverIds();
  const fromId = message.from?.id ? String(message.from.id) : "";

  return Boolean(fromId && approverIds.includes(fromId));
};

const approvalDeniedMessage = () =>
  getApproverIds().length === 0
    ? "هنوز شناسه تاییدکننده تسک تنظیم نشده است. عضو مورد نظر /whoami را بفرستد، بعد آن عدد را در TELEGRAM_TASK_APPROVER_IDS بگذار."
    : "شما اجازه تایید ساخت تسک را ندارید.";

const extractApprovedTaskText = (message: TelegramMessage, text: string) => {
  const cleanedText = text.replace(approvalPattern, "").trim();
  const replyText =
    message.reply_to_message?.text?.trim() ||
    message.reply_to_message?.caption?.trim() ||
    message.quote?.text?.trim() ||
    "";

  return replyText || cleanedText;
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
    const text = (item?.text || item?.caption || "").trim();

    if (!chatId || !text) {
      return Response.json({ ok: true, ignored: true });
    }

    if (isWhoAmIRequest(text)) {
      await sendTelegramMessage(
        chatId,
        item.from?.id
          ? `شناسه تلگرام شما: ${item.from.id}`
          : "برای پیام‌های کانال، شناسه کاربر فرستنده در دسترس نیست.",
        {
          parseMode: "none",
          replyMarkup: taskRegistrationKeyboard,
        }
      );

      return Response.json({ ok: true, command: "whoami" });
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

    if (isGroupChat(item)) {
      if (!approvalPattern.test(text)) {
        return Response.json({ ok: true, ignored: "group_message_without_task_approval" });
      }

      if (!isApprovedMember(item)) {
        await sendTelegramMessage(chatId, approvalDeniedMessage(), {
          parseMode: "none",
          replyMarkup: taskRegistrationKeyboard,
        });

        return Response.json({ ok: true, ignored: "unauthorized_task_approver" });
      }

      const approvedTaskText = extractApprovedTaskText(item, text);

      if (!approvedTaskText) {
        await sendTelegramMessage(
          chatId,
          "روی پیام مشکل ریپلای کن و #تایید_تسک را بفرست، یا متن مشکل را کنار همان هشتگ بنویس.",
          {
            parseMode: "none",
            replyMarkup: taskRegistrationKeyboard,
          }
        );

        return Response.json({ ok: true, ignored: "empty_approved_task" });
      }

      const task = await createTaskFromTelegramText(approvedTaskText);

      try {
        await sendTelegramMessage(chatId, `تسک ساخته شد: ${task.code}\n${task.title}`, {
          parseMode: "none",
          replyMarkup: taskRegistrationKeyboard,
        });
      } catch (error) {
        console.error("Telegram group task reply error:", error);
      }

      return Response.json({ ok: true, command: "approved_group_task", task });
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
