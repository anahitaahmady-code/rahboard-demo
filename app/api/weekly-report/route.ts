import { buildReportMessage, sendTelegramReport } from "@/app/lib/integrations";
import { loadRahboardData } from "@/app/lib/rahboard-store";
import { buildSprintReport } from "@/app/lib/reporting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isAuthorizedCronRequest = (request: Request) => {
  const userAgent = request.headers.get("user-agent") || "";
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization") || "";

  if (secret) {
    return authorization === `Bearer ${secret}`;
  }

  return userAgent.includes("vercel-cron/1.0");
};

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json({ ok: false, error: "Unauthorized cron request." }, { status: 401 });
  }

  const chatId = process.env.TELEGRAM_REPORT_CHAT_ID;

  if (!chatId) {
    return Response.json(
      { ok: false, error: "TELEGRAM_REPORT_CHAT_ID is not configured." },
      { status: 500 }
    );
  }

  try {
    const data = await loadRahboardData();
    const sprint =
      data.sprints.find((entry) => entry.status === "active") ||
      data.sprints[0] ||
      null;
    const report = buildSprintReport({
      sprint,
      tasks: data.tasks,
      users: data.users,
      projects: data.projects,
      activityLogs: data.activityLogs,
    });
    const reportMessage = await buildReportMessage(report);
    const delivery = await sendTelegramReport({
      chatId,
      threadId: process.env.TELEGRAM_REPORT_THREAD_ID || null,
      subject: `Weekly ${reportMessage.subject}`,
      text: reportMessage.text,
    });

    return Response.json({
      ok: true,
      sentAt: new Date().toISOString(),
      sprintId: sprint?.id || null,
      chatId,
      delivery,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
