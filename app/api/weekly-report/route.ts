import { buildReportEmail, sendReportEmail } from "@/app/lib/integrations";
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

  const to = process.env.SPRINT_REPORT_EMAIL_TO;

  if (!to) {
    return Response.json(
      { ok: false, error: "SPRINT_REPORT_EMAIL_TO is not configured." },
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
    const email = await buildReportEmail(report);
    const delivery = await sendReportEmail({
      to,
      subject: `Weekly ${email.subject}`,
      text: email.text,
    });

    return Response.json({
      ok: true,
      sentAt: new Date().toISOString(),
      sprintId: sprint?.id || null,
      to,
      delivery,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
