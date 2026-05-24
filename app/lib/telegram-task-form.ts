import { createHmac, timingSafeEqual } from "node:crypto";

type TelegramTaskFormToken = {
  chatId: string;
  exp: number;
  iat: number;
  v: 1;
};

const tokenTtlMs = 7 * 24 * 60 * 60 * 1000;

const getSigningSecret = () =>
  process.env.TELEGRAM_WEBHOOK_SECRET || process.env.TELEGRAM_BOT_TOKEN || "";

const encodeJson = (payload: TelegramTaskFormToken) =>
  Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");

const signPayload = (encodedPayload: string) => {
  const secret = getSigningSecret();

  if (!secret) {
    throw new Error("Telegram task form signing secret is missing.");
  }

  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
};

const signaturesMatch = (expected: string, actual: string) => {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);

  return (
    expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer)
  );
};

export const createTelegramTaskFormToken = (chatId: number | string) => {
  const now = Date.now();
  const payload = encodeJson({
    chatId: String(chatId),
    iat: now,
    exp: now + tokenTtlMs,
    v: 1,
  });
  const signature = signPayload(payload);

  return `${payload}.${signature}`;
};

export const verifyTelegramTaskFormToken = (token: string) => {
  const [payload, signature] = token.split(".");

  if (!payload || !signature) return null;

  const expectedSignature = signPayload(payload);

  if (!signaturesMatch(expectedSignature, signature)) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as TelegramTaskFormToken;

    if (!parsed.chatId || parsed.v !== 1 || parsed.exp < Date.now()) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
};

export const buildTelegramTaskFormUrl = (
  requestUrl: string,
  chatId: number | string
) => {
  const request = new URL(requestUrl);
  const basePath = request.pathname.startsWith("/rahboard-demo/")
    ? "/rahboard-demo"
    : "";
  const formUrl = new URL(`${basePath}/telegram-task/`, request.origin);

  formUrl.searchParams.set("token", createTelegramTaskFormToken(chatId));

  return formUrl.toString();
};

export const buildTelegramTaskFormKeyboard = (
  requestUrl: string,
  chatId: number | string,
  text = "ثبت تسک"
) => ({
  inline_keyboard: [
    [
      {
        text,
        url: buildTelegramTaskFormUrl(requestUrl, chatId),
      },
    ],
  ],
});
