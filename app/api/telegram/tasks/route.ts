import { sendTelegramMessage } from "@/app/lib/integrations";
import { createTaskFromTelegramText } from "@/app/lib/rahboard-store";
import {
  buildTelegramTaskFormKeyboard,
  verifyTelegramTaskFormToken,
} from "@/app/lib/telegram-task-form";

export const runtime = "nodejs";

type TelegramTaskFormBody = {
  token?: unknown;
  title?: unknown;
  description?: unknown;
};

const cleanText = (value: unknown, maxLength: number) =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as TelegramTaskFormBody;
    const token = cleanText(body.token, 4096);
    const formSession = verifyTelegramTaskFormToken(token);

    if (!formSession) {
      return Response.json(
        {
          ok: false,
          error: "لینک فرم معتبر نیست یا منقضی شده است. دوباره از کانال روی ثبت تسک بزن.",
        },
        { status: 401 }
      );
    }

    const title = cleanText(body.title, 160);
    const description = cleanText(body.description, 4000);

    if (!title) {
      return Response.json(
        { ok: false, error: "عنوان تسک را وارد کن." },
        { status: 400 }
      );
    }

    const task = await createTaskFromTelegramText(
      [
        "ثبت تسک",
        `عنوان: ${title}`,
        description ? `توضیح: ${description}` : "توضیح:",
      ].join("\n")
    );

    try {
      await sendTelegramMessage(
        formSession.chatId,
        `تسک ساخته شد: ${task.code}\n${task.title}`,
        {
          parseMode: "none",
          replyMarkup: buildTelegramTaskFormKeyboard(
            request.url,
            formSession.chatId,
            "ثبت تسک جدید"
          ),
        }
      );
    } catch (error) {
      console.error("Telegram task form reply error:", error);
    }

    return Response.json({
      ok: true,
      task: {
        id: task.id,
        code: task.code,
        title: task.title,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
