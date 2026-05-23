import { doc, setDoc } from "firebase/firestore";
import { serverDb } from "@/app/lib/firebase-server";
import type { ActivityCategory, TeamActivityLog } from "@/app/lib/reporting";

export const runtime = "nodejs";

const validCategories = new Set<ActivityCategory>([
  "focus",
  "meeting",
  "review",
  "break",
  "non_work",
  "idle",
  "other",
]);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const id = Number(body.id || Date.now());
    const category = validCategories.has(body.category) ? body.category : "other";
    const minutes = Math.max(0, Math.round(Number(body.minutes || 0)));

    if (!body.userId || minutes <= 0) {
      return Response.json(
        { ok: false, error: "userId and positive minutes are required." },
        { status: 400 }
      );
    }

    const log: TeamActivityLog = {
      id,
      userId: Number(body.userId),
      userName: String(body.userName || ""),
      taskId: body.taskId ? Number(body.taskId) : null,
      taskCode: body.taskCode || "",
      taskTitle: body.taskTitle || "",
      category,
      minutes,
      note: String(body.note || ""),
      date: body.date || new Date().toISOString().slice(0, 10),
      source: body.source === "agent" || body.source === "heartbeat" ? body.source : "manual",
      createdAt: Number(body.createdAt || Date.now()),
    };

    await setDoc(doc(serverDb, "activityLogs", String(log.id)), log);

    return Response.json({ ok: true, log });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
