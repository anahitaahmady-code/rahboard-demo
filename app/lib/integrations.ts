import { formatSprintReportMarkdown, type SprintReport } from "./reporting";

type EmailResult = {
  sent: boolean;
  provider: "resend" | "webhook" | "none";
  message: string;
};

type TelegramReportResult = {
  sent: boolean;
  provider: "telegram" | "none";
  format?: "message" | "pdf";
  message: string;
  chatId?: string;
  fileName?: string;
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

type TaskAiInput = {
  task: Record<string, unknown>;
  project?: Record<string, unknown> | null;
  sprint?: Record<string, unknown> | null;
  assignee?: Record<string, unknown> | null;
  recentActivityLogs?: Array<Record<string, unknown>>;
};

const getTaskText = (task: Record<string, unknown>, key: string) =>
  typeof task[key] === "string" ? String(task[key]) : "";

const fallbackTaskSolution = ({ task }: TaskAiInput) => {
  const taskType = getTaskText(task, "taskType") || "task";
  const errorType = getTaskText(task, "errorType") || "unknown";
  const title = getTaskText(task, "title") || "این تسک";

  const specialtySteps: Record<string, string[]> = {
    frontend: [
      "ابتدا مسیر ایجاد خطا را در مرورگر بازسازی کن و Console/Network را بررسی کن.",
      "کامپوننت یا state مرتبط با این رفتار را پیدا کن و ورودی‌های مرزی را تست کن.",
      "بعد از اصلاح، حالت loading، empty، error و responsive را یک بار دستی چک کن.",
    ],
    backend: [
      "ابتدا endpoint یا job مرتبط را با داده واقعی بازسازی کن و لاگ خطا را جدا کن.",
      "اعتبارسنجی ورودی، permission، query دیتابیس و response contract را بررسی کن.",
      "بعد از اصلاح، یک تست مسیر موفق و یک تست مسیر خطا اضافه کن.",
    ],
    database: [
      "ساختار داده، migration و indexهای مرتبط را بررسی کن.",
      "روی داده نمونه، query مشکل‌دار را جدا اجرا کن و خروجی را با انتظار محصول مقایسه کن.",
      "قبل از تغییر schema، اثر آن روی داده‌های قبلی و گزارش‌ها را چک کن.",
    ],
    network: [
      "در Network tab وضعیت request، timeout، CORS و payload را بررسی کن.",
      "retry، خطای قابل فهم برای کاربر و logging سمت سرور را کنترل کن.",
      "بعد از اصلاح، سناریوی اینترنت کند یا پاسخ دیرهنگام را هم تست کن.",
    ],
    security: [
      "سطح دسترسی کاربر، اعتبارسنجی سمت سرور و داده‌های حساس در response را بررسی کن.",
      "سناریوی کاربر بدون مجوز و ورودی دستکاری‌شده را تست کن.",
      "نتیجه را با حداقل دسترسی لازم پیاده‌سازی کن.",
    ],
    devops: [
      "ابتدا build log، env vars، مسیر deploy و تفاوت local/production را بررسی کن.",
      "اگر مشکل runtime است، dependency و file tracing را جدا چک کن.",
      "بعد از اصلاح، یک smoke test روی production انجام بده.",
    ],
    unknown: [
      "ابتدا مشکل را با یک سناریوی کوچک و قابل تکرار بازسازی کن.",
      "فرضیه‌ها را یکی‌یکی حذف کن: ورودی، وضعیت فعلی، لاگ، وابستگی‌ها و خروجی.",
      "بعد از اصلاح، نتیجه را با شاهد قابل بررسی مثل لینک PR، commit یا تست ثبت کن.",
    ],
  };

  return [
    `خلاصه راه‌حل برای «${title}»`,
    "",
    `این تسک از نوع ${taskType} و حوزه ${errorType} است. پیشنهاد این است که اول مسئله را بازسازی کنی، بعد کوچک‌ترین نقطه خراب را جدا کنی و در آخر با شاهد قابل بررسی تحویل بدهی.`,
    "",
    "مراحل پیشنهادی:",
    ...(specialtySteps[errorType] || specialtySteps.unknown).map((step, index) => `${index + 1}. ${step}`),
    "",
    "خروجی قابل قبول:",
    "- علت مشکل مشخص باشد.",
    "- اصلاح با تست یا چک دستی تأیید شده باشد.",
    "- لینک commit / PR / سند بررسی به عنوان شاهد ثبت شود.",
  ].join("\n");
};

export async function generateAiTaskSolution(input: TaskAiInput) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      source: "fallback" as const,
      solution: fallbackTaskSolution(input),
    };
  }

  const model = process.env.OPENAI_MODEL || "gpt-5.2";
  const prompt = [
    "You are a senior software engineer helping an employee solve a task.",
    "Write in Persian only.",
    "Be concise, practical, and specific to the task data.",
    "Do not invent logs, files, APIs, or facts that are not present.",
    "Return a readable answer with these headings:",
    "خلاصه راه‌حل",
    "مراحل پیشنهادی",
    "چک‌های لازم",
    "خروجی قابل قبول",
    "Keep it under 220 Persian words.",
    JSON.stringify(input),
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
      max_output_tokens: 700,
      store: false,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI request failed with ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const solution = getOutputText(data);

  return {
    source: "openai" as const,
    solution: solution || fallbackTaskSolution(input),
  };
}

export type AiOkrKeyResultSuggestion = {
  title: string;
  startValue: number;
  targetValue: number;
  unit: string;
  weight: number;
  confidence: number;
};

export type AiOkrSuggestion = {
  title: string;
  description: string;
  confidence: number;
  rationale: string;
  keyResults: AiOkrKeyResultSuggestion[];
  risks: string[];
  checkpoints: string[];
};

type AiOkrSuggestionInput = {
  title?: string;
  context?: string;
  period?: string;
  level?: string;
  project?: Record<string, unknown> | null;
  owner?: Record<string, unknown> | null;
  existingObjectives?: Array<Record<string, unknown>>;
};

const cleanAiJson = (text: string) =>
  text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

const toNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

const normalizeOkrSuggestion = (
  value: unknown,
  fallback: AiOkrSuggestion
): AiOkrSuggestion => {
  if (!isRecord(value)) return fallback;

  const keyResults = Array.isArray(value.keyResults)
    ? value.keyResults
        .filter(isRecord)
        .map((item, index) => ({
          title:
            typeof item.title === "string" && item.title.trim()
              ? item.title.trim()
              : fallback.keyResults[index]?.title || `نتیجه کلیدی ${index + 1}`,
          startValue: toNumber(item.startValue, 0),
          targetValue: toNumber(item.targetValue, fallback.keyResults[index]?.targetValue || 100),
          unit:
            typeof item.unit === "string" && item.unit.trim()
              ? item.unit.trim()
              : fallback.keyResults[index]?.unit || "%",
          weight: Math.max(1, toNumber(item.weight, 1)),
          confidence: clampPercent(toNumber(item.confidence, 75)),
        }))
    : fallback.keyResults;

  return {
    title:
      typeof value.title === "string" && value.title.trim()
        ? value.title.trim()
        : fallback.title,
    description:
      typeof value.description === "string" && value.description.trim()
        ? value.description.trim()
        : fallback.description,
    confidence: clampPercent(toNumber(value.confidence, fallback.confidence)),
    rationale:
      typeof value.rationale === "string" && value.rationale.trim()
        ? value.rationale.trim()
        : fallback.rationale,
    keyResults: keyResults.slice(0, 5),
    risks: Array.isArray(value.risks)
      ? value.risks.filter((item): item is string => typeof item === "string").slice(0, 5)
      : fallback.risks,
    checkpoints: Array.isArray(value.checkpoints)
      ? value.checkpoints
          .filter((item): item is string => typeof item === "string")
          .slice(0, 5)
      : fallback.checkpoints,
  };
};

const fallbackOkrSuggestion = (input: AiOkrSuggestionInput): AiOkrSuggestion => {
  const rawTitle = typeof input.title === "string" ? input.title.trim() : "";
  const title = rawTitle || "افزایش کیفیت و سرعت تحویل تیم";
  const context = typeof input.context === "string" ? input.context.trim() : "";
  const projectName =
    input.project && typeof input.project.name === "string"
      ? String(input.project.name)
      : "پروژه";

  return {
    title,
    description: context
      ? `تمرکز این OKR روی ${context} است و باید با خروجی قابل اندازه‌گیری، مالک مشخص و مرور هفتگی دنبال شود.`
      : `تمرکز این OKR روی بهبود نتیجه‌های مهم ${projectName} است و باید با KRهای قابل سنجش دنبال شود.`,
    confidence: 84,
    rationale:
      "هدف پیشنهادی مشخص، قابل پیگیری و مناسب مرور مدیریتی است؛ نتیجه‌های کلیدی هم عددی و قابل ثبت هستند.",
    keyResults: [
      {
        title: `رسیدن پیشرفت عملیاتی «${title}» به ۸۵٪`,
        startValue: 0,
        targetValue: 85,
        unit: "%",
        weight: 2,
        confidence: 88,
      },
      {
        title: "کاهش موارد نیازمند پیگیری مدیریتی به کمتر از ۲ مورد",
        startValue: 6,
        targetValue: 2,
        unit: "مورد",
        weight: 1,
        confidence: 80,
      },
      {
        title: "ثبت شواهد قابل بررسی برای همه خروجی‌های کلیدی",
        startValue: 0,
        targetValue: 100,
        unit: "%",
        weight: 1,
        confidence: 82,
      },
      {
        title: "برگزاری مرور هفتگی و ثبت تصمیم بعدی برای هر ریسک",
        startValue: 0,
        targetValue: 4,
        unit: "جلسه",
        weight: 1,
        confidence: 78,
      },
    ],
    risks: [
      "اگر مالک هر KR مشخص نباشد، پیگیری مدیریتی سخت می‌شود.",
      "اگر داده پایه ثبت نشود، سنجش پیشرفت قابل اعتماد نخواهد بود.",
    ],
    checkpoints: [
      "مالک هدف و KRها مشخص شود.",
      "عدد شروع و عدد هدف قبل از شروع دوره تأیید شود.",
      "هر هفته وضعیت، مانع و اقدام بعدی ثبت شود.",
    ],
  };
};

export async function generateAiOkrSuggestion(input: AiOkrSuggestionInput) {
  const fallback = fallbackOkrSuggestion(input);
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return {
      source: "fallback" as const,
      suggestion: fallback,
    };
  }

  const model = process.env.OPENAI_MODEL || "gpt-5.2";
  const prompt = [
    "You are an OKR coach for a product and engineering manager.",
    "Write Persian only.",
    "Return JSON only, no markdown.",
    "The JSON shape must be:",
    JSON.stringify({
      title: "هدف کوتاه و شفاف",
      description: "توضیح مدیریتی",
      confidence: 85,
      rationale: "چرا این هدف مناسب است",
      keyResults: [
        {
          title: "نتیجه کلیدی عددی",
          startValue: 0,
          targetValue: 100,
          unit: "%",
          weight: 1,
          confidence: 80,
        },
      ],
      risks: ["ریسک قابل بررسی"],
      checkpoints: ["چک‌پوینت مدیریتی"],
    }),
    "Rules:",
    "- Suggest one objective and 3 to 5 measurable key results.",
    "- Do not invent company facts. Use only the input.",
    "- Keep each KR measurable with numeric startValue and targetValue.",
    "- confidence values must be 0 to 100.",
    JSON.stringify(input),
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
      max_output_tokens: 1200,
      store: false,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI request failed with ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const text = getOutputText(data);

  try {
    return {
      source: "openai" as const,
      suggestion: normalizeOkrSuggestion(JSON.parse(cleanAiJson(text)), fallback),
    };
  } catch {
    return {
      source: "openai" as const,
      suggestion: fallback,
    };
  }
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

export async function sendTelegramDocument({
  chatId,
  threadId,
  caption,
  fileName,
  data,
}: {
  chatId: number | string;
  threadId?: number | string | null;
  caption?: string;
  fileName: string;
  data: Buffer;
}) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  const normalizedChatId = normalizeTelegramChatId(chatId);
  const formData = new FormData();
  formData.set("chat_id", normalizedChatId);

  if (threadId) {
    const normalizedThreadId = Number(normalizeTelegramChatId(threadId));
    if (Number.isFinite(normalizedThreadId) && normalizedThreadId > 0) {
      formData.set("message_thread_id", String(normalizedThreadId));
    }
  }

  if (caption) {
    formData.set("caption", caption.slice(0, 1024));
  }

  formData.set(
    "document",
    new Blob([new Uint8Array(data)], { type: "application/pdf" }),
    fileName
  );

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  const response = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
    method: "POST",
    signal: controller.signal,
    body: formData,
  }).finally(() => clearTimeout(timeout));

  if (!response.ok) {
    const errorMessage = await getTelegramErrorMessage(response);
    throw new Error(
      `Telegram sendDocument failed with ${response.status}${
        errorMessage ? `: ${errorMessage}` : ""
      }`
    );
  }
}

export async function sendTelegramReportPdf({
  chatId,
  threadId,
  caption,
  fileName,
  data,
}: {
  chatId?: number | string | null;
  threadId?: number | string | null;
  caption?: string;
  fileName: string;
  data: Buffer;
}): Promise<TelegramReportResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const normalizedChatId = chatId ? normalizeTelegramChatId(chatId) : "";

  if (!token) {
    return {
      sent: false,
      provider: "none",
      format: "pdf",
      message: "TELEGRAM_BOT_TOKEN is not configured.",
    };
  }

  if (!normalizedChatId) {
    return {
      sent: false,
      provider: "none",
      format: "pdf",
      message: "TELEGRAM_REPORT_CHAT_ID is not configured.",
    };
  }

  await sendTelegramDocument({
    chatId: normalizedChatId,
    threadId,
    caption,
    fileName,
    data,
  });

  return {
    sent: true,
    provider: "telegram",
    format: "pdf",
    message: "PDF report sent to Telegram.",
    chatId: normalizedChatId,
    fileName,
  };
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
    format: "message",
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
