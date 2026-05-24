import type { Metadata } from "next";
import TelegramTaskForm from "./TelegramTaskForm";

export const metadata: Metadata = {
  title: "ثبت تسک تلگرام | Rahboard",
};

type TelegramTaskPageProps = {
  searchParams: Promise<{
    token?: string | string[];
  }>;
};

export default async function TelegramTaskPage({
  searchParams,
}: TelegramTaskPageProps) {
  const params = await searchParams;
  const rawToken = params.token;
  const token = Array.isArray(rawToken) ? rawToken[0] || "" : rawToken || "";

  return <TelegramTaskForm token={token} />;
}
