import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  setDoc,
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
  const data = await loadRahboardData();
  const parsed = parseTelegramTaskText(text);
  const project =
    data.projects.find(
      (item) => String(item.id) === process.env.TELEGRAM_DEFAULT_PROJECT_ID
    ) || data.projects[0];
  const activeSprint =
    data.sprints.find(
      (item) =>
        String(item.id) === process.env.TELEGRAM_DEFAULT_SPRINT_ID ||
        (project && item.projectId === project.id && item.status === "active")
    ) || null;

  if (!project) {
    throw new Error("No project found for Telegram task creation.");
  }

  const now = Date.now();
  const code = `${project.key || "RB"}-${now}`;
  const task = {
    id: now,
    projectId: project.id,
    sprintId: activeSprint?.id || null,
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

  await setDoc(doc(serverDb, "tasks", String(task.id)), task);
  return task;
}
