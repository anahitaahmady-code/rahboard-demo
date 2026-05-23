import {
  collection,
  getDocs,
  orderBy,
  query,
} from "firebase/firestore";
import { serverDb } from "./firebase-server";
import {
  parseTelegramTaskText,
  type BasicProject,
  type BasicSprint,
  type BasicTask,
  type BasicUser,
  type TeamActivityLog,
} from "./reporting";

const firebaseApiKey = "AIzaSyDCVi_LPNfalO1vdyTC3jFg7tREm_txfgU";
const firebaseProjectId = "rahboard-7750b";

const toFirestoreValue = (value: unknown): Record<string, unknown> => {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map((item) => toFirestoreValue(item)),
      },
    };
  }
  if (typeof value === "object") {
    return {
      mapValue: {
        fields: toFirestoreFields(value as Record<string, unknown>),
      },
    };
  }

  return { stringValue: String(value) };
};

const toFirestoreFields = (data: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(data)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, toFirestoreValue(value)])
  );

const saveTaskWithRestApi = async (task: Record<string, unknown>) => {
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${firebaseProjectId}/databases/(default)/documents/tasks/${task.id}?key=${firebaseApiKey}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: toFirestoreFields(task) }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Firestore REST write failed with ${response.status}: ${errorText}`);
  }
};

export async function loadRahboardData() {
  const [usersSnapshot, projectsSnapshot, sprintsSnapshot, tasksSnapshot, logsSnapshot] =
    await Promise.all([
      getDocs(query(collection(serverDb, "users"), orderBy("createdAt", "asc"))),
      getDocs(query(collection(serverDb, "projects"), orderBy("createdAt", "asc"))),
      getDocs(query(collection(serverDb, "sprints"), orderBy("createdAt", "asc"))),
      getDocs(query(collection(serverDb, "tasks"), orderBy("id", "desc"))),
      getDocs(query(collection(serverDb, "activityLogs"), orderBy("createdAt", "desc"))),
    ]);

  return {
    users: usersSnapshot.docs.map((item) => item.data() as BasicUser),
    projects: projectsSnapshot.docs.map((item) => item.data() as BasicProject),
    sprints: sprintsSnapshot.docs.map((item) => item.data() as BasicSprint),
    tasks: tasksSnapshot.docs.map((item) => item.data() as BasicTask),
    activityLogs: logsSnapshot.docs.map((item) => item.data() as TeamActivityLog),
  };
}

export async function createTaskFromTelegramText(text: string) {
  const parsed = parseTelegramTaskText(text);
  const projectId = Number(process.env.TELEGRAM_DEFAULT_PROJECT_ID || 1);
  const projectKey = process.env.TELEGRAM_DEFAULT_PROJECT_KEY || "RB";
  const sprintId = process.env.TELEGRAM_DEFAULT_SPRINT_ID
    ? Number(process.env.TELEGRAM_DEFAULT_SPRINT_ID)
    : null;

  const now = Date.now();
  const code = `${projectKey}-${now}`;
  const task = {
    id: now,
    projectId,
    sprintId,
    code,
    title: parsed.title,
    status: process.env.TELEGRAM_DEFAULT_STATUS || "todo",
    description: parsed.description,
    comments: [],
    attachments: [],
    labels: parsed.labels,
    assigneeId: null,
    deadline: parsed.deadline,
    priority: parsed.priority,
    createdBy: null,
    taskType: parsed.taskType,
    errorType: "unknown",
    estimate: "medium",
    estimatedHours: 0,
    shiftNeed: "any",
    autoAssigned: false,
    assignmentReason: "Created from Telegram channel.",
    source: "telegram",
    importedAt: now,
    workLogs: [],
    deadlineHistory: [],
  };

  await saveTaskWithRestApi(task);
  return task;
}
