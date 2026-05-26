import { sendTelegramReportPdf } from "@/app/lib/integrations";
import { buildSprintReportPdf } from "@/app/lib/report-pdf";
import { loadRahboardData } from "@/app/lib/rahboard-store";
import {
  buildSprintReport,
  type BasicProject,
  type BasicSprint,
  type BasicTask,
  type BasicUser,
  type TeamActivityLog,
} from "@/app/lib/reporting";

export const runtime = "nodejs";
export const maxDuration = 60;

type ReportRequest = {
  sprintId?: number | string | null;
  telegramChatId?: number | string | null;
  telegramThreadId?: number | string | null;
  to?: string;
  users?: BasicUser[];
  projects?: BasicProject[];
  sprints?: BasicSprint[];
  tasks?: BasicTask[];
  activityLogs?: TeamActivityLog[];
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ReportRequest;
    const data =
      body.tasks && body.users && body.projects && body.sprints
        ? {
            users: body.users,
            projects: body.projects,
            sprints: body.sprints,
            tasks: body.tasks,
            activityLogs: body.activityLogs || [],
          }
        : await loadRahboardData();

    const sprintId = body.sprintId ? Number(body.sprintId) : null;
    const sprint = sprintId
      ? data.sprints.find((item) => item.id === sprintId) || null
      : data.sprints.find((item) => item.status === "active") || data.sprints[0] || null;

    const report = buildSprintReport({
      sprint,
      tasks: data.tasks,
      users: data.users,
      projects: data.projects,
      activityLogs: data.activityLogs,
    });
    const pdf = await buildSprintReportPdf(report);
    const delivery = await sendTelegramReportPdf({
      chatId: body.telegramChatId || process.env.TELEGRAM_REPORT_CHAT_ID || null,
      threadId: body.telegramThreadId || process.env.TELEGRAM_REPORT_THREAD_ID || null,
      caption: pdf.subject,
      fileName: pdf.fileName,
      data: pdf.buffer,
    });

    return Response.json({
      ok: true,
      report,
      pdf: {
        fileName: pdf.fileName,
        subject: pdf.subject,
      },
      delivery,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
