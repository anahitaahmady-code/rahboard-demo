import { sendTelegramReportPdf } from "@/app/lib/integrations";
import { buildSprintReportPdf } from "@/app/lib/report-pdf";
import { loadRahboardData } from "@/app/lib/rahboard-store";
import { buildSprintReport } from "@/app/lib/reporting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
    const pdf = await buildSprintReportPdf(report);
    const delivery = await sendTelegramReportPdf({
      chatId,
      threadId: process.env.TELEGRAM_REPORT_THREAD_ID || null,
      caption: `گزارش هفتگی مدیریت - ${pdf.subject}`,
      fileName: pdf.fileName,
      data: pdf.buffer,
    });

    return Response.json({
      ok: true,
      sentAt: new Date().toISOString(),
      sprintId: sprint?.id || null,
      chatId,
      fileName: pdf.fileName,
      delivery,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
