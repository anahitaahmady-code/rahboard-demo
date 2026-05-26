import {
  answerTelegramCallbackQuery,
  sendTelegramReportPdf,
  sendTelegramMessage,
} from "@/app/lib/integrations";
import { buildSprintReportPdf } from "@/app/lib/report-pdf";
import {
  createTaskFromTelegramText,
  loadTelegramPendingGroupMessage,
  loadRahboardData,
  saveTelegramPendingGroupMessage,
} from "@/app/lib/rahboard-store";
import { buildSprintReport } from "@/app/lib/reporting";

export const runtime = "nodejs";
export const maxDuration = 60;

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
  message_id?: number;
  message_thread_id?: number;
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
  external_reply?: {
    quote?: {
      text?: string;
    };
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
    message.external_reply?.quote?.text?.trim() ||
    "";

  return replyText || cleanedText;
};

const getTelegramSenderName = (message: TelegramMessage) =>
  [message.from?.first_name, message.from?.last_name].filter(Boolean).join(" ") ||
  message.from?.username ||
  "";

const rememberGroupMessage = async (message: TelegramMessage, text: string) => {
  if (!isGroupChat(message) || approvalPattern.test(text)) return;
  if (text.startsWith("/")) return;

  try {
    await saveTelegramPendingGroupMessage({
      chatId: String(message.chat.id),
      threadId: String(message.message_thread_id || 0),
      messageId: message.message_id || null,
      text,
      fromId: message.from?.id ? String(message.from.id) : "",
      fromName: getTelegramSenderName(message),
      createdAt: Date.now(),
    });
  } catch (error) {
    console.error("Telegram pending group message save error:", error);
  }
};

const loadFallbackApprovedTaskText = async (message: TelegramMessage) => {
  try {
    const pending = await loadTelegramPendingGroupMessage(
      message.chat.id,
      message.message_thread_id || 0
    );

    return pending?.text?.trim() || "";
  } catch (error) {
    console.error("Telegram pending group message load error:", error);
    return "";
  }
};

const missingReplyTextMessage = (message: TelegramMessage) => {
  const hasReply = Boolean(message.reply_to_message);
  const hasQuote = Boolean(message.quote?.text || message.external_reply?.quote?.text);

  return [
    "متن پیام ریپلای‌شده به بات نرسید، برای همین نمی‌توانم از روی ریپلای تسک بسازم.",
    `reply=${hasReply ? "yes" : "no"} quote=${hasQuote ? "yes" : "no"}`,
    "در BotFather برای این بات Privacy Mode را خاموش کن: /setprivacy -> انتخاب بات -> Disable",
    "اگر همین الان Privacy را خاموش کردی، یک پیام مشکل جدید بفرست و روی همان پیام جدید Reply کن؛ پیام‌های قدیمی قبلاً به بات نرسیده‌اند.",
    "بعد دوباره روی پیام مشکل Reply بزن و /approve_task را بفرست.",
  ].join("\n");
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
      const identity = [
        item.from?.id
          ? `شناسه تلگرام شما: ${item.from.id}`
          : "برای پیام‌های کانال، شناسه کاربر فرستنده در دسترس نیست.",
        `شناسه چت فعلی: ${chatId}`,
        item.message_thread_id ? `شناسه تاپیک فعلی: ${item.message_thread_id}` : "",
        "برای ارسال گزارش هفتگی به همین‌جا، TELEGRAM_REPORT_CHAT_ID را برابر شناسه چت فعلی بگذار.",
      ]
        .filter(Boolean)
        .join("\n");

      await sendTelegramMessage(chatId, identity, {
        parseMode: "none",
        replyMarkup: taskRegistrationKeyboard,
      });

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
      const data = await loadRahboardData();
      const sprint = data.sprints.find((entry) => entry.status === "active") || data.sprints[0] || null;
      const report = buildSprintReport({
        sprint,
        tasks: data.tasks,
        users: data.users,
        projects: data.projects,
        activityLogs: data.activityLogs,
      });
      const pdf = await buildSprintReportPdf(report);
      const delivery = await sendTelegramReportPdf({
        chatId,
        threadId: item.message_thread_id || null,
        caption: pdf.subject,
        fileName: pdf.fileName,
        data: pdf.buffer,
      });

      if (!delivery.sent) {
        await sendTelegramMessage(
          chatId,
          `گزارش ساخته شد، ولی ارسال تلگرام انجام نشد: ${delivery.message}`,
          { parseMode: "none", replyMarkup: taskRegistrationKeyboard }
        );
      }

      return Response.json({ ok: true, command: "sprint_report", delivery });
    }

    if (isGroupChat(item)) {
      if (!approvalPattern.test(text)) {
        await rememberGroupMessage(item, text);
        return Response.json({ ok: true, ignored: "group_message_without_task_approval" });
      }

      if (!isApprovedMember(item)) {
        await sendTelegramMessage(chatId, approvalDeniedMessage(), {
          parseMode: "none",
        });

        return Response.json({ ok: true, ignored: "unauthorized_task_approver" });
      }

      const approvedTaskText =
        extractApprovedTaskText(item, text) || (await loadFallbackApprovedTaskText(item));

      if (!approvedTaskText) {
        await sendTelegramMessage(
          chatId,
          missingReplyTextMessage(item),
          {
            parseMode: "none",
          }
        );

        return Response.json({ ok: true, ignored: "empty_approved_task" });
      }

      const task = await createTaskFromTelegramText(approvedTaskText);

      try {
        await sendTelegramMessage(chatId, `تسک ساخته شد: ${task.code}\n${task.title}`, {
          parseMode: "none",
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
