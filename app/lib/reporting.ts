export type UserRole = "admin" | "manager" | "developer";

export type BasicUser = {
  id: number;
  name: string;
  email?: string;
  role?: UserRole | string;
};

export type BasicProject = {
  id: number;
  name: string;
  key?: string;
};

export type BasicSprint = {
  id: number;
  projectId: number;
  name: string;
  goal?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
};

export type WorkLog = {
  id: number;
  taskId: number;
  userId: number;
  userName?: string;
  minutes: number;
  note?: string;
  source?: "manual" | "timer";
  verification?: "self_reported" | "timed";
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
  activeMinutes?: number;
  idleMinutes?: number;
  evidenceCount?: number;
  confidenceScore?: number;
  reviewFlags?: string[];
  loggedAt: string;
  createdAt: number;
};

export type WorkEvidence = {
  id: number;
  taskId: number;
  userId: number;
  userName?: string;
  type: "status" | "comment" | "attachment" | "deadline" | "field" | "link";
  title: string;
  detail?: string;
  url?: string;
  createdAt: string;
};

export type DeadlineChange = {
  id: number;
  taskId: number;
  previousDeadline: string;
  nextDeadline: string;
  changedBy: number;
  changedByName?: string;
  changedAt: string;
  sprintId?: number | null;
};

export type ActivityCategory =
  | "focus"
  | "meeting"
  | "review"
  | "break"
  | "non_work"
  | "idle"
  | "other";

export type TeamActivityLog = {
  id: number;
  userId: number;
  userName?: string;
  taskId?: number | null;
  taskCode?: string;
  taskTitle?: string;
  category: ActivityCategory;
  minutes: number;
  note?: string;
  date: string;
  source: "manual" | "heartbeat" | "agent";
  createdAt: number;
};

export type BasicTask = {
  id: number;
  projectId: number;
  sprintId?: number | null;
  code: string;
  title: string;
  status: string;
  description?: string;
  assigneeId: number | null;
  deadline: string;
  priority?: string;
  estimatedHours?: number;
  completedAt?: string;
  deadlineHistory?: DeadlineChange[];
  workLogs?: WorkLog[];
  evidence?: WorkEvidence[];
  labels?: string[];
  source?: string;
};

export type SprintReport = {
  sprint: BasicSprint | null;
  project: BasicProject | null;
  generatedAt: string;
  totals: {
    tasks: number;
    done: number;
    open: number;
    progress: number;
    openOverdue: number;
    lateCompleted: number;
    deadlineChanges: number;
    estimatedHours: number;
    loggedHours: number;
  };
  developerWork: Array<{
    userId: number;
    userName: string;
    taskCount: number;
    doneCount: number;
    loggedMinutes: number;
    manualMinutes: number;
    timerMinutes: number;
    productiveMinutes: number;
    nonWorkMinutes: number;
    manualRatio: number;
    averageConfidence: number;
    reviewFlags: string[];
    tasks: Array<{
      code: string;
      title: string;
      status: string;
      loggedMinutes: number;
    }>;
  }>;
  overdueTasks: Array<{
    code: string;
    title: string;
    assignee: string;
    deadline: string;
    status: string;
  }>;
  changedDeadlines: Array<{
    code: string;
    title: string;
    previousDeadline: string;
    nextDeadline: string;
    changedBy: string;
    changedAt: string;
  }>;
  taskRows: Array<{
    code: string;
    title: string;
    assignee: string;
    status: string;
    priority: string;
    deadline: string;
    estimatedHours: number;
    loggedHours: number;
  }>;
};

const doneStatuses = new Set(["done", "closed", "resolved"]);
const productiveCategories = new Set<ActivityCategory>([
  "focus",
  "meeting",
  "review",
  "other",
]);

const toDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const dateOnly = (date: Date) => date.toISOString().slice(0, 10);

const isDone = (status: string) => doneStatuses.has(status.toLowerCase());

const isInsideRange = (value: string, start?: string, end?: string) => {
  const date = toDate(value);
  if (!date) return false;

  const startDate = toDate(start || "");
  const endDate = toDate(end || "");

  if (startDate && date < startDate) return false;
  if (endDate) {
    endDate.setHours(23, 59, 59, 999);
    if (date > endDate) return false;
  }

  return true;
};

const getUserName = (users: BasicUser[], userId: number | null | undefined) =>
  users.find((user) => user.id === userId)?.name || "Unassigned";

export function buildSprintReport({
  sprint,
  tasks,
  users,
  projects,
  activityLogs = [],
  now = new Date(),
}: {
  sprint: BasicSprint | null;
  tasks: BasicTask[];
  users: BasicUser[];
  projects: BasicProject[];
  activityLogs?: TeamActivityLog[];
  now?: Date;
}): SprintReport {
  const sprintTasks = sprint
    ? tasks.filter((task) => task.sprintId === sprint.id)
    : tasks;

  const project =
    projects.find((item) => item.id === sprint?.projectId) ||
    projects.find((item) => item.id === sprintTasks[0]?.projectId) ||
    null;

  const referenceDate = toDate(sprint?.endDate || "") || now;
  referenceDate.setHours(23, 59, 59, 999);

  const doneTasks = sprintTasks.filter((task) => isDone(task.status));
  const openTasks = sprintTasks.filter((task) => !isDone(task.status));

  const openOverdueTasks = openTasks.filter((task) => {
    const deadline = toDate(task.deadline);
    return Boolean(deadline && deadline < referenceDate);
  });

  const lateCompletedTasks = doneTasks.filter((task) => {
    const deadline = toDate(task.deadline);
    const completedAt = toDate(task.completedAt || "");
    return Boolean(deadline && completedAt && completedAt > deadline);
  });

  const allDeadlineChanges = sprintTasks.flatMap((task) =>
    (task.deadlineHistory || []).map((change) => ({
      task,
      change,
    }))
  );

  const changedDeadlines = allDeadlineChanges.filter(({ change }) =>
    sprint
      ? isInsideRange(change.changedAt, sprint.startDate, sprint.endDate)
      : true
  );

  const logsByTask = new Map<number, WorkLog[]>();
  sprintTasks.forEach((task) => {
    logsByTask.set(task.id, task.workLogs || []);
  });

  const sprintActivityLogs = activityLogs.filter((log) =>
    sprint ? isInsideRange(log.date, sprint.startDate, sprint.endDate) : true
  );

  const developerWork = users
    .map((user) => {
      const assignedTasks = sprintTasks.filter((task) => task.assigneeId === user.id);
      const userTaskLogs = sprintTasks.flatMap((task) =>
        (logsByTask.get(task.id) || [])
          .filter((log) => log.userId === user.id)
          .map((log) => ({ task, log }))
      );
      const userActivityLogs = sprintActivityLogs.filter((log) => log.userId === user.id);

      const loggedMinutes = userTaskLogs.reduce((sum, item) => sum + item.log.minutes, 0);
      const manualMinutes = userTaskLogs
        .filter((item) => item.log.source !== "timer")
        .reduce((sum, item) => sum + item.log.minutes, 0);
      const timerMinutes = userTaskLogs
        .filter((item) => item.log.source === "timer")
        .reduce((sum, item) => sum + item.log.minutes, 0);
      const productiveMinutes = userActivityLogs
        .filter((log) => productiveCategories.has(log.category))
        .reduce((sum, item) => sum + item.minutes, 0);
      const nonWorkMinutes = userActivityLogs
        .filter((log) => !productiveCategories.has(log.category))
        .reduce((sum, item) => sum + item.minutes, 0);
      const manualRatio = loggedMinutes
        ? Math.round((manualMinutes / loggedMinutes) * 100)
        : 0;
      const scoredLogs = userTaskLogs.filter(
        (item) => typeof item.log.confidenceScore === "number"
      );
      const averageConfidence = scoredLogs.length
        ? Math.round(
            scoredLogs.reduce(
              (sum, item) => sum + Number(item.log.confidenceScore || 0),
              0
            ) / scoredLogs.length
          )
        : 0;
      const reviewFlags = [
        manualMinutes >= 180 && manualRatio >= 70
          ? "Manual logs are high compared with timed sessions."
          : "",
        loggedMinutes > 0 && timerMinutes === 0
          ? "No timer-backed work logs were recorded."
          : "",
        loggedMinutes > 0 && productiveMinutes === 0
          ? "No daily activity evidence was recorded."
          : "",
        scoredLogs.some((item) => Number(item.log.confidenceScore || 0) < 45)
          ? "One or more work logs have low evidence confidence."
          : "",
      ].filter(Boolean);

      const taskSummaries = assignedTasks.map((task) => ({
        code: task.code,
        title: task.title,
        status: task.status,
        loggedMinutes: (logsByTask.get(task.id) || [])
          .filter((log) => log.userId === user.id)
          .reduce((sum, log) => sum + log.minutes, 0),
      }));

      return {
        userId: user.id,
        userName: user.name,
        taskCount: assignedTasks.length,
        doneCount: assignedTasks.filter((task) => isDone(task.status)).length,
        loggedMinutes,
        manualMinutes,
        timerMinutes,
        productiveMinutes,
        nonWorkMinutes,
        manualRatio,
        averageConfidence,
        reviewFlags,
        tasks: taskSummaries,
      };
    })
    .filter(
      (item) =>
        item.taskCount > 0 ||
        item.loggedMinutes > 0 ||
        item.productiveMinutes > 0 ||
        item.nonWorkMinutes > 0
    );

  const totalLoggedMinutes = sprintTasks.reduce(
    (sum, task) =>
      sum + (task.workLogs || []).reduce((taskSum, log) => taskSum + log.minutes, 0),
    0
  );

  const taskRows = sprintTasks.map((task) => ({
    code: task.code,
    title: task.title,
    assignee: getUserName(users, task.assigneeId),
    status: task.status,
    priority: task.priority || "medium",
    deadline: task.deadline || "-",
    estimatedHours: Number(task.estimatedHours || 0),
    loggedHours:
      Math.round(
        ((task.workLogs || []).reduce((sum, log) => sum + log.minutes, 0) / 60) * 10
      ) / 10,
  }));

  return {
    sprint,
    project,
    generatedAt: now.toISOString(),
    totals: {
      tasks: sprintTasks.length,
      done: doneTasks.length,
      open: openTasks.length,
      progress: sprintTasks.length
        ? Math.round((doneTasks.length / sprintTasks.length) * 100)
        : 0,
      openOverdue: openOverdueTasks.length,
      lateCompleted: lateCompletedTasks.length,
      deadlineChanges: changedDeadlines.length,
      estimatedHours: sprintTasks.reduce(
        (sum, task) => sum + Number(task.estimatedHours || 0),
        0
      ),
      loggedHours: Math.round((totalLoggedMinutes / 60) * 10) / 10,
    },
    developerWork,
    overdueTasks: [...openOverdueTasks, ...lateCompletedTasks].map((task) => ({
      code: task.code,
      title: task.title,
      assignee: getUserName(users, task.assigneeId),
      deadline: task.deadline || "-",
      status: task.status,
    })),
    changedDeadlines: changedDeadlines.map(({ task, change }) => ({
      code: task.code,
      title: task.title,
      previousDeadline: change.previousDeadline || "-",
      nextDeadline: change.nextDeadline || "-",
      changedBy: change.changedByName || getUserName(users, change.changedBy),
      changedAt: change.changedAt,
    })),
    taskRows,
  };
}

export function formatSprintReportMarkdown(report: SprintReport, aiNarrative?: string) {
  const sprintName = report.sprint?.name || "All tasks";
  const projectName = report.project?.name || "Unknown project";
  const generatedDate = dateOnly(new Date(report.generatedAt));

  const developerLines = report.developerWork.length
    ? report.developerWork
        .map((item) => {
          const hours = Math.round((item.loggedMinutes / 60) * 10) / 10;
          const manualHours = Math.round((item.manualMinutes / 60) * 10) / 10;
          const timerHours = Math.round((item.timerMinutes / 60) * 10) / 10;
          const productive = Math.round((item.productiveMinutes / 60) * 10) / 10;
          const nonWork = Math.round((item.nonWorkMinutes / 60) * 10) / 10;
          const flags = item.reviewFlags.length
            ? ` Review: ${item.reviewFlags.join(" ")}`
            : "";
          return `- ${item.userName}: ${item.doneCount}/${item.taskCount} tasks done, ${hours}h logged (${timerHours}h timer, ${manualHours}h manual), confidence ${item.averageConfidence || "n/a"}, ${productive}h productive activity, ${nonWork}h break/non-work.${flags}`;
        })
        .join("\n")
    : "- No developer work logs were recorded.";

  const overdueLines = report.overdueTasks.length
    ? report.overdueTasks
        .map(
          (task) =>
            `- ${task.code}: ${task.title} | ${task.assignee} | deadline ${task.deadline} | ${task.status}`
        )
        .join("\n")
    : "- No overdue tasks.";

  const deadlineLines = report.changedDeadlines.length
    ? report.changedDeadlines
        .map(
          (item) =>
            `- ${item.code}: ${item.previousDeadline} -> ${item.nextDeadline} by ${item.changedBy} at ${item.changedAt}`
        )
        .join("\n")
    : "- No deadline changes inside the sprint.";

  const taskLines = report.taskRows.length
    ? report.taskRows
        .map(
          (task) =>
            `- ${task.code}: ${task.title} | ${task.assignee} | ${task.status} | estimate ${task.estimatedHours}h | logged ${task.loggedHours}h`
        )
        .join("\n")
    : "- No tasks.";

  return [
    `# Sprint Report: ${sprintName}`,
    "",
    `Project: ${projectName}`,
    `Generated: ${generatedDate}`,
    "",
    "## Executive summary",
    aiNarrative ||
      `Progress is ${report.totals.progress}% with ${report.totals.done}/${report.totals.tasks} tasks completed. Open overdue tasks: ${report.totals.openOverdue}. Deadline changes during sprint: ${report.totals.deadlineChanges}.`,
    "",
    "## Metrics",
    `- Total tasks: ${report.totals.tasks}`,
    `- Done: ${report.totals.done}`,
    `- Open: ${report.totals.open}`,
    `- Progress: ${report.totals.progress}%`,
    `- Open overdue: ${report.totals.openOverdue}`,
    `- Late completed: ${report.totals.lateCompleted}`,
    `- Deadline changes: ${report.totals.deadlineChanges}`,
    `- Estimated hours: ${report.totals.estimatedHours}`,
    `- Logged hours: ${report.totals.loggedHours}`,
    "",
    "## Developer work",
    developerLines,
    "",
    "## Overdue tasks",
    overdueLines,
    "",
    "## Deadline changes",
    deadlineLines,
    "",
    "## Task details",
    taskLines,
  ].join("\n");
}

export function parseTelegramTaskText(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const titleLine = lines[0] || "Telegram task";
  const labels = Array.from(text.matchAll(/#([\p{L}\p{N}_-]+)/gu)).map(
    (match) => match[1]
  );
  const deadlineMatch =
    text.match(/(?:deadline|due|ددلاین|مهلت)\s*[:：-]?\s*(\d{4}-\d{2}-\d{2})/i) ||
    text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  const priorityText = text.toLowerCase();
  const priority = priorityText.includes("urgent") || priorityText.includes("فوری")
    ? "urgent"
    : priorityText.includes("high") || priorityText.includes("مهم")
      ? "high"
      : priorityText.includes("low")
        ? "low"
        : "medium";

  const taskType = priorityText.includes("feature")
    ? "feature"
    : priorityText.includes("ui")
      ? "ui"
      : priorityText.includes("api")
        ? "api"
        : priorityText.includes("test")
          ? "test"
          : "bug";

  return {
    title: titleLine.replace(/^[-*]\s*/, ""),
    description: lines.slice(1).join("\n") || text,
    deadline: deadlineMatch?.[1] || "",
    labels,
    priority,
    taskType,
  };
}
