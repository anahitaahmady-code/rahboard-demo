import { buildReportEmail, sendReportEmail } from "@/app/lib/integrations";
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

type ReportRequest = {
  sprintId?: number | string | null;
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
    const email = await buildReportEmail(report);
    const delivery = body.to
      ? await sendReportEmail({
          to: body.to,
          subject: email.subject,
          text: email.text,
        })
      : {
          sent: false,
          provider: "none" as const,
          message: "No recipient provided. Report was generated only.",
        };

    return Response.json({
      ok: true,
      report,
      email,
      delivery,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
