import { formatSprintReportMarkdown, type SprintReport } from "./reporting";

type EmailResult = {
  sent: boolean;
  provider: "resend" | "webhook" | "none";
  message: string;
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

export async function buildReportEmail(report: SprintReport) {
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

export async function sendTelegramMessage(chatId: number | string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: controller.signal,
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
    }),
  }).finally(() => clearTimeout(timeout));

  if (!response.ok) {
    throw new Error(`Telegram sendMessage failed with ${response.status}`);
  }
}
