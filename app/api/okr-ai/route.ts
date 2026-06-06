import { generateAiOkrSuggestion } from "@/app/lib/integrations";

export const runtime = "nodejs";
export const maxDuration = 30;

type OkrAiRequest = {
  title?: string;
  context?: string;
  period?: string;
  level?: string;
  project?: Record<string, unknown> | null;
  owner?: Record<string, unknown> | null;
  existingObjectives?: Array<Record<string, unknown>>;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as OkrAiRequest;
    const result = await generateAiOkrSuggestion({
      title: body.title || "",
      context: body.context || "",
      period: body.period || "",
      level: body.level || "",
      project: body.project || null,
      owner: body.owner || null,
      existingObjectives: body.existingObjectives || [],
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
