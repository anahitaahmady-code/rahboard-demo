import { generateAiTaskSolution } from "@/app/lib/integrations";

export const runtime = "nodejs";
export const maxDuration = 30;

type TaskAiRequest = {
  task?: Record<string, unknown>;
  project?: Record<string, unknown> | null;
  sprint?: Record<string, unknown> | null;
  assignee?: Record<string, unknown> | null;
  recentActivityLogs?: Array<Record<string, unknown>>;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as TaskAiRequest;

    if (!body.task || typeof body.task !== "object") {
      return Response.json(
        { ok: false, error: "Task data is required." },
        { status: 400 }
      );
    }

    const result = await generateAiTaskSolution({
      task: body.task,
      project: body.project || null,
      sprint: body.sprint || null,
      assignee: body.assignee || null,
      recentActivityLogs: body.recentActivityLogs || [],
    });

    return Response.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
