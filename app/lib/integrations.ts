import { formatSprintReportMarkdown, type SprintReport } from "./reporting";

type EmailResult = {
  sent: boolean;
  provider: "resend" | "webhook" | "none";
  message: string;
};

type TelegramReportResult = {
  sent: boolean;
  provider: "telegram" | "none";
  message: string;
  chatId?: string;
  parts?: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const getOutputText = (data: unknown) => {
  if (!isRecord(data)) return "";
  if (typeof data.output_text === "string") return data.output_text;

  const output = Array.isArray(data.output) ? data.output : [];
  const textParts = output.flatMap((item) => {
    if (!isRecord(item) || !Array.isArray(item.content)) return [];

    return item.content
      .map((contentItem) =>
        isRecord(contentItem) && typeof contentItem.text === "string"
          ? contentItem.text
          : ""
      )
      .filter(Boolean);
  });

  return textParts.join("\n").trim();
};

export async function generateAiSprintNarrative(report: SprintReport) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return "";
  }

  const model = process.env.OPENAI_MODEL || "gpt-5.2";
  const prompt = [
    "You are a concise project operations analyst.",
    "Write a Persian executive sprint summary for a manager.",
    "Mention completed work, overdue risk, deadline changes, and developer workload.",
    "Do not invent numbers. Use only the JSON below.",
    JSON.stringify(report),
  ].join("\n\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: prompt,
      max_output_tokens: 900,
      store: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed with ${response.status}`);
  }

  const data = await response.json();
  return getOutputText(data);
}

export async function sendReportEmail({
  to,
  subject,
  text,
}: {
  to: string;
  subject: string;
  text: string;
}): Promise<EmailResult> {
  const webhookUrl = process.env.EMAIL_WEBHOOK_URL;
  if (webhookUrl) {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, subject, text }),
    });

    if (!response.ok) {
      throw new Error(`Email webhook failed with ${response.status}`);
    }

    return {
      sent: true,
      provider: "webhook",
      message: "Sent through EMAIL_WEBHOOK_URL.",
    };
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.REPORT_EMAIL_FROM || "RahBoard <reports@rahboard.local>",
        to,
        subject,
        text,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Resend failed with ${response.status}: ${errorText}`);
    }

    return {
      sent: true,
      provider: "resend",
      message: "Sent through Resend.",
    };
  }

  return {
    sent: false,
    provider: "none",
    message:
      "No email provider configured. Set EMAIL_WEBHOOK_URL or RESEND_API_KEY to send emails.",
  };
}

export async function buildReportMessage(report: SprintReport) {
  let narrative = "";

  try {
    narrative = await generateAiSprintNarrative(report);
  } catch (error) {
    console.error("AI narrative error:", error);
  }

  const text = formatSprintReportMarkdown(report, narrative);
  const subject = `Sprint report: ${report.sprint?.name || "RahBoard"}`;

  return { subject, text, narrative };
}

export async function buildReportEmail(report: SprintReport) {
  return buildReportMessage(report);
}

type TelegramMessageOptions = {
  messageThreadId?: number | string | null;
  replyMarkup?: Record<string, unknown>;
  parseMode?: "Markdown" | "HTML" | "none";
};

const splitTelegramText = (text: string, maxLength = 3600) => {
  const chunks: string[] = [];
  let current = "";

  for (const line of text.split("\n")) {
    const next = current ? `${current}\n${line}` : line;

    if (next.length <= maxLength) {
      current = next;
      continue;
    }

    if (current) {
      chunks.push(current);
    }

    if (line.length <= maxLength) {
      current = line;
      continue;
    }

    for (let index = 0; index < line.length; index += maxLength) {
      chunks.push(line.slice(index, index + maxLength));
    }

    current = "";
  }

  if (current) {
    chunks.push(current);
  }

  return chunks.length ? chunks : [text];
};

const normalizeTelegramChatId = (value: number | string) => {
  if (typeof value === "number") return String(value);

  const digitMap: Record<string, string> = {
    "۰": "0",
    "۱": "1",
    "۲": "2",
    "۳": "3",
    "۴": "4",
    "۵": "5",
    "۶": "6",
    "۷": "7",
    "۸": "8",
    "۹": "9",
    "٠": "0",
    "١": "1",
    "٢": "2",
    "٣": "3",
    "٤": "4",
    "٥": "5",
    "٦": "6",
    "٧": "7",
    "٨": "8",
    "٩": "9",
  };

  return value
    .trim()
    .replace(/[۰-۹٠-٩]/g, (digit) => digitMap[digit] || digit)
    .replace(/[−–—]/g, "-")
    .replace(/[\s\u200c\u200f\u202a-\u202e]/g, "");
};

const getTelegramErrorMessage = async (response: Response) => {
  try {
    const data = await response.json();
    if (isRecord(data) && typeof data.description === "string") {
      return data.description;
    }
  } catch {
    try {
      return await response.text();
    } catch {
      return "";
    }
  }

  return "";
};

export async function sendTelegramMessage(
  chatId: number | string,
  text: string,
  options: TelegramMessageOptions = {}
) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  const body: Record<string, unknown> = {
    chat_id: normalizeTelegramChatId(chatId),
    text,
  };

  if (options.messageThreadId) {
    const threadId = Number(options.messageThreadId);
    if (Number.isFinite(threadId) && threadId > 0) {
      body.message_thread_id = threadId;
    }
  }

  if (options.parseMode !== "none") {
    body.parse_mode = options.parseMode || "Markdown";
  }

  if (options.replyMarkup) {
    body.reply_markup = options.replyMarkup;
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: controller.signal,
    body: JSON.stringify(body),
  }).finally(() => clearTimeout(timeout));

  if (!response.ok) {
    const errorMessage = await getTelegramErrorMessage(response);
    throw new Error(
      `Telegram sendMessage failed with ${response.status}${
        errorMessage ? `: ${errorMessage}` : ""
      }`
    );
  }
}

export async function sendTelegramReport({
  chatId,
  threadId,
  subject,
  text,
}: {
  chatId?: number | string | null;
  threadId?: number | string | null;
  subject?: string;
  text: string;
}): Promise<TelegramReportResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const normalizedChatId = chatId ? normalizeTelegramChatId(chatId) : "";

  if (!token) {
    return {
      sent: false,
      provider: "none",
      message: "TELEGRAM_BOT_TOKEN is not configured.",
    };
  }

  if (!normalizedChatId) {
    return {
      sent: false,
      provider: "none",
      message: "TELEGRAM_REPORT_CHAT_ID is not configured.",
    };
  }

  const fullText = [subject ? `# ${subject}` : "", text].filter(Boolean).join("\n\n");
  const chunks = splitTelegramText(fullText);

  for (const [index, chunk] of chunks.entries()) {
    const suffix = chunks.length > 1 ? `\n\n(${index + 1}/${chunks.length})` : "";
    await sendTelegramMessage(normalizedChatId, `${chunk}${suffix}`, {
      messageThreadId: threadId,
      parseMode: "none",
    });
  }

  return {
    sent: true,
    provider: "telegram",
    message: `Sent to Telegram in ${chunks.length} message(s).`,
    chatId: normalizedChatId,
    parts: chunks.length,
  };
}

export async function answerTelegramCallbackQuery(
  callbackQueryId: string,
  text?: string
) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);

  const response = await fetch(
    `https://api.telegram.org/bot${token}/answerCallbackQuery`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text,
      }),
    }
  ).finally(() => clearTimeout(timeout));

  if (!response.ok) {
    throw new Error(`Telegram answerCallbackQuery failed with ${response.status}`);
  }
}
