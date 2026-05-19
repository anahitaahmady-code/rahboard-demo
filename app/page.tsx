"use client";

import { useEffect, useMemo, useState } from "react";
import { auth, db } from "./firebase";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User as FirebaseUser,
} from "firebase/auth";

type Attachment = {
  id: number;
  name: string;
  type: string;
  url: string;
};

type Comment = {
  id: number;
  text: string;
  author: string;
};

type UserRole = "admin" | "manager" | "developer";
type Shift = "morning" | "evening" | "night" | "full";
type Priority = "low" | "medium" | "high" | "urgent";
type TaskType = "bug" | "feature" | "ui" | "api" | "deploy" | "test";
type ErrorType =
  | "frontend"
  | "backend"
  | "database"
  | "network"
  | "security"
  | "devops"
  | "unknown";
type Estimate = "small" | "medium" | "large";
type ShiftNeed = "morning" | "evening" | "night" | "any";
type ActiveView = "board" | "backlog" | "myTasks" | "reports" | "imports" | "teamSettings";
type SprintStatus = "planned" | "active" | "closed";

type User = {
  id: number;
  uid?: string;
  name: string;
  email: string;
  role: UserRole;
  avatar: string;
  createdAt?: number;
  skills?: string[];
  shift?: Shift;
  capacity?: number;
};

type Project = {
  id: number;
  name: string;
  key: string;
  createdAt?: number;
};

type Sprint = {
  id: number;
  projectId: number;
  name: string;
  goal?: string;
  startDate?: string;
  endDate?: string;
  status: SprintStatus;
  createdAt?: number;
};

type Task = {
  id: number;
  projectId: number;
  sprintId?: number | null;
  code: string;
  title: string;
  status: string;
  description: string;
  comments: Comment[];
  attachments: Attachment[];
  labels: string[];
  assigneeId: number | null;
  deadline: string;
  priority: Priority;
  createdBy?: number;
  taskType?: TaskType;
  errorType?: ErrorType;
  estimate?: Estimate;
  shiftNeed?: ShiftNeed;
  autoAssigned?: boolean;
  assignmentReason?: string;
  source?: "manual" | "import";
  importedAt?: number;
};

type Column = {
  key: string;
  label: string;
  order?: number;
};

type PermissionKey =
  | "canCreateProject"
  | "canDeleteProject"
  | "canCreateColumn"
  | "canEditColumn"
  | "canDeleteColumn"
  | "canCreateTask"
  | "canEditAnyTask"
  | "canDeleteAnyTask"
  | "canManageTeam"
  | "canDragColumns";

const rolePermissions: Record<UserRole, Record<PermissionKey, boolean>> = {
  admin: {
    canCreateProject: true,
    canDeleteProject: true,
    canCreateColumn: true,
    canEditColumn: true,
    canDeleteColumn: true,
    canCreateTask: true,
    canEditAnyTask: true,
    canDeleteAnyTask: true,
    canManageTeam: true,
    canDragColumns: true,
  },
  manager: {
    canCreateProject: true,
    canDeleteProject: false,
    canCreateColumn: true,
    canEditColumn: true,
    canDeleteColumn: false,
    canCreateTask: true,
    canEditAnyTask: true,
    canDeleteAnyTask: true,
    canManageTeam: false,
    canDragColumns: true,
  },
  developer: {
    canCreateProject: false,
    canDeleteProject: false,
    canCreateColumn: false,
    canEditColumn: false,
    canDeleteColumn: false,
    canCreateTask: true,
    canEditAnyTask: false,
    canDeleteAnyTask: false,
    canManageTeam: false,
    canDragColumns: false,
  },
};

const fallbackUsers: User[] = [
  {
    id: 1,
    name: "Anahita",
    email: "anahita@example.com",
    role: "admin",
    avatar: "A",
    createdAt: 1,
    skills: ["frontend", "ui", "bug", "management"],
    shift: "full",
    capacity: 8,
  },
  {
    id: 2,
    name: "Sara",
    email: "sara@example.com",
    role: "developer",
    avatar: "S",
    createdAt: 2,
    skills: ["frontend", "ui", "bug", "test"],
    shift: "morning",
    capacity: 5,
  },
  {
    id: 3,
    name: "Reza",
    email: "reza@example.com",
    role: "developer",
    avatar: "R",
    createdAt: 3,
    skills: ["backend", "api", "database", "network"],
    shift: "evening",
    capacity: 5,
  },
];

const makeAvatar = (name: string) => {
  const letters = name
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return letters || "U";
};

const daysUntil = (dateValue: string) => {
  if (!dateValue) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const target = new Date(dateValue);
  target.setHours(0, 0, 0, 0);

  const diff = target.getTime() - today.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

const estimateWeight: Record<Estimate, number> = {
  small: 1,
  medium: 2,
  large: 3,
};

const normalizePriority = (value: string): Priority => {
  const normalized = value.toLowerCase().trim();
  if (["urgent", "highest", "blocker", "critical"].includes(normalized)) return "urgent";
  if (["high", "major"].includes(normalized)) return "high";
  if (["low", "minor", "lowest"].includes(normalized)) return "low";
  return "medium";
};

const normalizeEstimate = (value: string): Estimate => {
  const normalized = value.toLowerCase().trim();
  if (["large", "l", "8", "13"].includes(normalized)) return "large";
  if (["small", "s", "1", "2"].includes(normalized)) return "small";
  return "medium";
};

const normalizeTaskType = (value: string): TaskType => {
  const normalized = value.toLowerCase().trim();
  if (["feature", "story"].includes(normalized)) return "feature";
  if (["ui", "design"].includes(normalized)) return "ui";
  if (["api"].includes(normalized)) return "api";
  if (["deploy", "release"].includes(normalized)) return "deploy";
  if (["test", "qa"].includes(normalized)) return "test";
  return "bug";
};

const normalizeErrorType = (value: string): ErrorType => {
  const normalized = value.toLowerCase().trim();
  if (["frontend", "backend", "database", "network", "security", "devops"].includes(normalized)) {
    return normalized as ErrorType;
  }
  return "unknown";
};

const parseCsv = (content: string) => {
  const rows: string[][] = [];
  let row: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === "," && !quoted) {
      row.push(current.trim());
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(current.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      current = "";
      continue;
    }

    current += char;
  }

  row.push(current.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
};

const rowValue = (row: Record<string, string>, keys: string[]) => {
  const normalized = Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key.toLowerCase().trim(), value])
  );

  for (const key of keys) {
    const value = normalized[key.toLowerCase().trim()];
    if (value !== undefined) return value;
  }

  return "";
};

type ImportPreviewRow = {
  title: string;
  description: string;
  projectKey: string;
  projectName: string;
  sprintName: string;
  status: string;
  assigneeEmail: string;
  assigneeName: string;
  priority: Priority;
  deadline: string;
  labels: string[];
  taskType: TaskType;
  errorType: ErrorType;
  estimate: Estimate;
};

export default function Home() {
  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(true);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  const [users, setUsers] = useState<User[]>(fallbackUsers);
  const [currentUserId, setCurrentUserId] = useState<number>(1);

  const appUser = authUser
    ? users.find(
        (user) =>
          user.uid === authUser.uid ||
          user.email.toLowerCase() === (authUser.email || "").toLowerCase()
      ) || null
    : null;

  const currentUser = appUser || users.find((user) => user.id === currentUserId) || users[0];
  const permissions = rolePermissions[currentUser.role];
  const [activeView, setActiveView] = useState<ActiveView>("board");

  const [projects, setProjects] = useState<Project[]>([
    { id: 1, name: "راه برد محصول", key: "RB", createdAt: 1 },
  ]);

  const [activeProjectId, setActiveProjectId] = useState(1);
  const [projectSearch, setProjectSearch] = useState("");
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectKey, setProjectKey] = useState("");
  const [editingProjectId, setEditingProjectId] = useState<number | null>(null);

  const [columns, setColumns] = useState<Column[]>([
    { key: "todo", label: "To Do", order: 0 },
    { key: "inprogress", label: "In Progress", order: 1 },
    { key: "readyfortest", label: "Ready For Test", order: 2 },
    { key: "waitdeploy", label: "Waiting Deploy", order: 3 },
    { key: "done", label: "Done", order: 4 },
  ]);

  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [activeSprintId, setActiveSprintId] = useState<number | null>(null);
  const [isSprintModalOpen, setIsSprintModalOpen] = useState(false);
  const [editingSprintId, setEditingSprintId] = useState<number | null>(null);
  const [sprintName, setSprintName] = useState("");
  const [sprintGoal, setSprintGoal] = useState("");
  const [sprintStartDate, setSprintStartDate] = useState("");
  const [sprintEndDate, setSprintEndDate] = useState("");
  const [sprintStatus, setSprintStatus] = useState<SprintStatus>("planned");

  const [tasks, setTasks] = useState<Task[]>([]);

  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const [draggedColumnKey, setDraggedColumnKey] = useState<string | null>(null);

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);

  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskLabels, setTaskLabels] = useState("");
  const [taskAssigneeId, setTaskAssigneeId] = useState<number | null>(null);
  const [taskDeadline, setTaskDeadline] = useState("");
  const [taskPriority, setTaskPriority] = useState<Priority>("medium");
  const [taskType, setTaskType] = useState<TaskType>("bug");
  const [errorType, setErrorType] = useState<ErrorType>("frontend");
  const [taskEstimate, setTaskEstimate] = useState<Estimate>("medium");
  const [shiftNeed, setShiftNeed] = useState<ShiftNeed>("any");
  const [taskSprintId, setTaskSprintId] = useState<number | null>(null);
  const [taskDefaultStatus, setTaskDefaultStatus] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");

  const [isColumnModalOpen, setIsColumnModalOpen] = useState(false);
  const [columnTitle, setColumnTitle] = useState("");
  const [editingColumnKey, setEditingColumnKey] = useState<string | null>(null);

  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserRole, setNewUserRole] = useState<UserRole>("developer");
  const [newUserSkills, setNewUserSkills] = useState("");
  const [newUserShift, setNewUserShift] = useState<Shift>("morning");
  const [newUserCapacity, setNewUserCapacity] = useState(5);

  const [search, setSearch] = useState("");
  const [filterAssignee, setFilterAssignee] = useState("all");
  const [filterLabel, setFilterLabel] = useState("all");

  const [reportFromDate, setReportFromDate] = useState("");
  const [reportToDate, setReportToDate] = useState("");
  const [reportSprintId, setReportSprintId] = useState("all");
  const [reportUserId, setReportUserId] = useState("all");
  const [reportProjectId, setReportProjectId] = useState("all");

  const [importPreview, setImportPreview] = useState<ImportPreviewRow[]>([]);
  const [importLog, setImportLog] = useState<string[]>([]);

  const [activityLogs, setActivityLogs] = useState<string[]>([]);
  const [notifications, setNotifications] = useState<string[]>([]);

  const activeProject = projects.find((project) => project.id === activeProjectId);
  const projectSprints = useMemo(
    () => sprints.filter((sprint) => sprint.projectId === activeProjectId),
    [sprints, activeProjectId]
  );
  const activeSprint = activeSprintId
    ? sprints.find((sprint) => sprint.id === activeSprintId) || null
    : null;

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (appUser) {
      setCurrentUserId(appUser.id);
    }
  }, [appUser]);

  const handleLogin = async () => {
    if (!loginEmail.trim() || !loginPassword.trim()) return;

    setLoginError("");

    try {
      await signInWithEmailAndPassword(
        auth,
        loginEmail.trim(),
        loginPassword.trim()
      );
      setLoginPassword("");
    } catch (error) {
      console.error("Login error:", error);
      setLoginError("ایمیل یا رمز عبور اشتباه است.");
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  const addLog = (text: string) => {
    setActivityLogs((prev) => [`${new Date().toLocaleTimeString()} - ${text}`, ...prev]);
  };

  const notify = (text: string) => {
    setNotifications((prev) => [text, ...prev.slice(0, 4)]);
  };

  const showNoAccess = () => {
    notify("شما دسترسی انجام این عملیات را ندارید");
  };

  const canEditTask = (task: Task) => {
    return permissions.canEditAnyTask || task.createdBy === currentUser.id;
  };

  const canDeleteTask = (task: Task) => {
    return permissions.canDeleteAnyTask || task.createdBy === currentUser.id;
  };

  useEffect(() => {
    const q = query(collection(db, "users"), orderBy("createdAt", "asc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const firebaseUsers = snapshot.docs.map((docItem) => {
        const data = docItem.data() as User;

        return {
          ...data,
          id: Number(data.id || docItem.id),
          skills: data.skills || [],
          shift: data.shift || "full",
          capacity: data.capacity || 5,
        };
      });

      setUsers(firebaseUsers);
      setUsersLoading(false);

      if (firebaseUsers.length > 0) {
        const stillExists = firebaseUsers.some((user) => user.id === currentUserId);

        if (!stillExists) {
          setCurrentUserId(firebaseUsers[0].id);
        }
      }
    });

    return () => unsubscribe();
  }, [currentUserId]);

  useEffect(() => {
    const q = query(collection(db, "projects"), orderBy("createdAt", "asc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const firebaseProjects = snapshot.docs.map((docItem) => {
        const data = docItem.data() as Project;

        return {
          ...data,
          id: Number(docItem.id),
        };
      });

      if (firebaseProjects.length > 0) {
        setProjects(firebaseProjects);

        const stillExists = firebaseProjects.some(
          (project) => project.id === activeProjectId
        );

        if (!stillExists) {
          setActiveProjectId(firebaseProjects[0].id);
        }
      }
    });

    return () => unsubscribe();
  }, [activeProjectId]);

  useEffect(() => {
    const q = query(collection(db, "columns"), orderBy("order", "asc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const firebaseColumns = snapshot.docs.map((docItem) => {
        const data = docItem.data();

        return {
          key: docItem.id,
          label: data.label,
          order: data.order,
        } as Column;
      });

      if (firebaseColumns.length > 0) {
        setColumns(firebaseColumns);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, "sprints"), orderBy("createdAt", "asc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const firebaseSprints = snapshot.docs.map((docItem) => {
        const data = docItem.data() as Sprint;

        return {
          ...data,
          id: Number(docItem.id),
          status: data.status || "planned",
        };
      });

      setSprints(firebaseSprints);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const active = projectSprints.find((sprint) => sprint.status === "active");
    const first = projectSprints[0];

    if (activeSprintId && projectSprints.some((sprint) => sprint.id === activeSprintId)) return;

    setActiveSprintId(active?.id || first?.id || null);
  }, [projectSprints, activeSprintId]);

  useEffect(() => {
    const q = query(collection(db, "tasks"), orderBy("id", "asc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const firebaseTasks = snapshot.docs.map((docItem) => {
        const data = docItem.data() as Task;
        return {
          ...data,
          sprintId: data.sprintId ?? null,
          source: data.source || "manual",
        };
      });
      setTasks(firebaseTasks);
    });

    return () => unsubscribe();
  }, []);

  const projectTasks = useMemo(
    () => tasks.filter((task) => task.projectId === activeProjectId),
    [tasks, activeProjectId]
  );

  const boardTasks = useMemo(
    () => projectTasks.filter((task) => task.sprintId === activeSprintId),
    [projectTasks, activeSprintId]
  );

  const backlogTasks = useMemo(
    () => projectTasks.filter((task) => !task.sprintId),
    [projectTasks]
  );

  const activeTasks = useMemo(
    () => projectTasks.filter((task) => task.status !== "done"),
    [projectTasks]
  );

  const workloadByUser = useMemo(() => {
    return users.map((user) => {
      const userTasks = activeTasks.filter((task) => task.assigneeId === user.id);
      const load = userTasks.reduce(
        (sum, task) => sum + estimateWeight[task.estimate || "medium"],
        0
      );

      return {
        user,
        count: userTasks.length,
        load,
        capacity: user.capacity || 5,
      };
    });
  }, [users, activeTasks]);

  const recommendAssignee = () => {
    const candidates = users.filter((user) => user.role === "developer");

    if (candidates.length === 0) {
      return {
        assigneeId: null,
        reason: "دولوپری برای اساین خودکار پیدا نشد.",
      };
    }

    const scored = candidates.map((user) => {
      const skills = (user.skills || []).map((skill) => skill.toLowerCase());
      const userWorkload = workloadByUser.find((item) => item.user.id === user.id);
      const currentLoad = userWorkload?.load || 0;
      const capacity = user.capacity || 5;
      const freeCapacity = Math.max(capacity - currentLoad, 0);

      let score = 0;
      const reasons: string[] = [];

      if (skills.includes(errorType)) {
        score += 4;
        reasons.push(`تخصص ${errorType}`);
      }

      if (skills.includes(taskType)) {
        score += 3;
        reasons.push(`تجربه ${taskType}`);
      }

      if (shiftNeed === "any" || user.shift === "full" || user.shift === shiftNeed) {
        score += 2;
        reasons.push("شیفت مناسب");
      } else {
        score -= 2;
      }

      if (freeCapacity > 0) {
        score += freeCapacity;
        reasons.push("ظرفیت آزاد");
      } else {
        score -= 4;
        reasons.push("حجم کاری بالا");
      }

      if (taskPriority === "urgent" && skills.includes("urgent")) {
        score += 2;
        reasons.push("آماده برای فوری");
      }

      return {
        user,
        score,
        reason: reasons.join(" + ") || "انتخاب بر اساس کمترین حجم کاری",
      };
    });

    scored.sort((a, b) => b.score - a.score);

    const best = scored[0];

    return {
      assigneeId: best.user.id,
      reason: `${best.user.name} انتخاب شد: ${best.reason}`,
    };
  };

  const pulse = useMemo(() => {
    const total = boardTasks.length;
    const done = boardTasks.filter((task) => task.status === "done").length;
    const urgent = boardTasks.filter((task) => task.priority === "urgent").length;
    const dueSoon = boardTasks.filter((task) => {
      const days = daysUntil(task.deadline);
      return days !== null && days >= 0 && days <= 3 && task.status !== "done";
    }).length;
    const overdue = boardTasks.filter((task) => {
      const days = daysUntil(task.deadline);
      return days !== null && days < 0 && task.status !== "done";
    }).length;

    const progress = total === 0 ? 0 : Math.round((done / total) * 100);

    const columnLoads = columns.map((column) => ({
      label: column.label,
      count: boardTasks.filter((task) => task.status === column.key).length,
    }));

    const busiestColumn = columnLoads.reduce(
      (max, item) => (item.count > max.count ? item : max),
      { label: "-", count: 0 }
    );

    let health: "healthy" | "risk" | "critical" = "healthy";
    let message = "پروژه در وضعیت خوب است.";

    if (overdue > 0 || urgent >= 3) {
      health = "critical";
      message = "چند تسک فوری یا عقب‌افتاده دارید؛ بهتر است اولویت‌بندی شود.";
    } else if (dueSoon > 0 || urgent > 0 || progress < 35) {
      health = "risk";
      message = "پروژه نیاز به بررسی دارد؛ چند تسک به ددلاین نزدیک شده‌اند.";
    }

    return {
      total,
      done,
      progress,
      urgent,
      dueSoon,
      overdue,
      busiestColumn,
      health,
      message,
    };
  }, [boardTasks, columns]);

  const addUser = async () => {
    if (!permissions.canManageTeam) {
      showNoAccess();
      return;
    }

    if (!newUserName.trim() || !newUserEmail.trim()) return;

    const emailExists = users.some(
      (user) => user.email.toLowerCase() === newUserEmail.trim().toLowerCase()
    );

    if (emailExists) {
      alert("این ایمیل قبلاً اضافه شده است.");
      return;
    }

    const name = newUserName.trim();
    const email = newUserEmail.trim();
    const skills = newUserSkills
      .split(",")
      .map((skill) => skill.trim().toLowerCase())
      .filter(Boolean);

    const newUser: User = {
      id: Date.now(),
      name,
      email,
      role: newUserRole,
      avatar: makeAvatar(name),
      createdAt: Date.now(),
      skills,
      shift: newUserShift,
      capacity: newUserCapacity,
    };

    setIsUserModalOpen(false);
    setNewUserName("");
    setNewUserEmail("");
    setNewUserRole("developer");
    setNewUserSkills("");
    setNewUserShift("morning");
    setNewUserCapacity(5);

    try {
      await setDoc(doc(db, "users", String(newUser.id)), newUser);

      addLog(`عضو جدید ${newUser.name} اضافه شد`);
      notify("عضو جدید به تیم اضافه شد");
    } catch (error) {
      console.error("User save error:", error);
      alert("ذخیره عضو با خطا مواجه شد.");
    }
  };

  const deleteUser = async (userId: number) => {
    if (!permissions.canManageTeam) {
      showNoAccess();
      return;
    }

    if (userId === currentUser.id) {
      alert("نمی‌توانی کاربر فعلی را حذف کنی.");
      return;
    }

    if (!confirm("این عضو از تیم حذف شود؟")) return;

    await deleteDoc(doc(db, "users", String(userId)));

    addLog("یک عضو از تیم حذف شد");
    notify("عضو تیم حذف شد");
  };

  const updateUserRole = async (user: User, role: UserRole) => {
    if (!permissions.canManageTeam) {
      showNoAccess();
      return;
    }

    if (user.id === currentUser.id && role !== "admin") {
      alert("نقش کاربر فعلی را از admin تغییر نده؛ ممکن است دسترسی مدیریت را از دست بدهی.");
      return;
    }

    await setDoc(doc(db, "users", String(user.id)), {
      ...user,
      role,
    });

    addLog(`نقش ${user.name} تغییر کرد`);
    notify("نقش عضو تغییر کرد");
  };

  const openNewProjectModal = () => {
    if (!permissions.canCreateProject) {
      showNoAccess();
      return;
    }

    setEditingProjectId(null);
    setProjectName("");
    setProjectKey("");
    setIsProjectModalOpen(true);
  };

  const openEditProjectModal = (project: Project) => {
    if (!permissions.canCreateProject) {
      showNoAccess();
      return;
    }

    setEditingProjectId(project.id);
    setProjectName(project.name);
    setProjectKey(project.key);
    setIsProjectModalOpen(true);
  };

  const closeProjectModal = () => {
    setIsProjectModalOpen(false);
    setEditingProjectId(null);
    setProjectName("");
    setProjectKey("");
  };

  const saveProject = async () => {
    if (!permissions.canCreateProject) {
      showNoAccess();
      return;
    }

    if (!projectName.trim() || !projectKey.trim()) return;

    const name = projectName.trim();
    const key = projectKey.trim().toUpperCase();
    const currentEditingProjectId = editingProjectId;

    closeProjectModal();

    try {
      if (currentEditingProjectId) {
        const currentProject = projects.find(
          (project) => project.id === currentEditingProjectId
        );

        if (!currentProject) return;

        const updatedProject: Project = {
          ...currentProject,
          name,
          key,
        };

        await setDoc(doc(db, "projects", String(updatedProject.id)), updatedProject);

        addLog(`پروژه ${updatedProject.name} ویرایش شد`);
        notify("پروژه ویرایش شد");
        return;
      }

      const newProject: Project = {
        id: Date.now(),
        name,
        key,
        createdAt: Date.now(),
      };

      await setDoc(doc(db, "projects", String(newProject.id)), newProject);

      setActiveProjectId(newProject.id);
      addLog(`پروژه ${newProject.name} ساخته شد`);
      notify("پروژه جدید ساخته شد");
    } catch (error) {
      console.error("Project save error:", error);
      alert("ذخیره پروژه با خطا مواجه شد.");
    }
  };

  const deleteProject = async (projectId: number) => {
    if (!permissions.canDeleteProject) {
      showNoAccess();
      return;
    }

    if (projects.length === 1) {
      alert("حداقل یک پروژه باید باقی بماند.");
      return;
    }

    if (!confirm("با حذف پروژه، همه تسک‌های داخل آن هم حذف می‌شوند. مطمئنی؟")) return;

    const projectTasksToDelete = tasks.filter((task) => task.projectId === projectId);

    await Promise.all([
      deleteDoc(doc(db, "projects", String(projectId))),
      ...projectTasksToDelete.map((task) => deleteDoc(doc(db, "tasks", String(task.id)))),
    ]);

    const remainingProjects = projects.filter((project) => project.id !== projectId);

    if (activeProjectId === projectId && remainingProjects.length > 0) {
      setActiveProjectId(remainingProjects[0].id);
    }

    addLog("یک پروژه حذف شد");
    notify("پروژه حذف شد");
  };

  const openNewTaskModal = (defaultStatus?: string, defaultSprintId?: number | null) => {
    if (!permissions.canCreateTask) {
      showNoAccess();
      return;
    }

    setSelectedTask(null);
    setTaskTitle("");
    setTaskDescription("");
    setTaskLabels("");
    setTaskAssigneeId(null);
    setTaskDeadline("");
    setTaskPriority("medium");
    setTaskType("bug");
    setErrorType("frontend");
    setTaskEstimate("medium");
    setShiftNeed("any");
    setTaskSprintId(defaultSprintId === undefined ? activeSprintId : defaultSprintId);
    setTaskDefaultStatus(defaultStatus || columns[0]?.key || "todo");
    setCommentText("");
    setIsTaskModalOpen(true);
  };

  const openTask = (task: Task) => {
    setSelectedTask(task);
    setTaskTitle(task.title);
    setTaskDescription(task.description);
    setTaskLabels(task.labels.join(", "));
    setTaskAssigneeId(task.assigneeId);
    setTaskDeadline(task.deadline);
    setTaskPriority(task.priority);
    setTaskType(task.taskType || "bug");
    setErrorType(task.errorType || "frontend");
    setTaskEstimate(task.estimate || "medium");
    setShiftNeed(task.shiftNeed || "any");
    setTaskSprintId(task.sprintId ?? null);
    setTaskDefaultStatus(task.status);
    setCommentText("");
    setIsTaskModalOpen(true);
  };

  const saveTask = async () => {
    if (selectedTask && !canEditTask(selectedTask)) {
      showNoAccess();
      return;
    }

    if (!selectedTask && !permissions.canCreateTask) {
      showNoAccess();
      return;
    }

    if (!taskTitle.trim()) return;

    const labels = taskLabels
      .split(",")
      .map((label) => label.trim())
      .filter(Boolean);

    const title = taskTitle;
    const description = taskDescription;
    let assigneeId = taskAssigneeId;
    let autoAssigned = false;
    let assignmentReason = "";

    if (!selectedTask && !assigneeId) {
      const recommendation = recommendAssignee();
      assigneeId = recommendation.assigneeId;
      autoAssigned = Boolean(recommendation.assigneeId);
      assignmentReason = recommendation.reason;
    }

    const deadline = taskDeadline;
    const priority = taskPriority;
    const currentSelectedTask = selectedTask;

    setIsTaskModalOpen(false);

    try {
      if (currentSelectedTask) {
        const currentTask = tasks.find((task) => task.id === currentSelectedTask.id);

        if (!currentTask) return;

        const updatedTask: Task = {
          ...currentTask,
          title,
          description,
          labels,
          assigneeId,
          deadline,
          priority,
          taskType,
          errorType,
          estimate: taskEstimate,
          shiftNeed,
          sprintId: taskSprintId,
        };

        await setDoc(doc(db, "tasks", String(updatedTask.id)), updatedTask);

        addLog(`تسک ${updatedTask.code} ویرایش شد`);
        notify(`تسک ${updatedTask.code} آپدیت شد`);
      } else {
        const nextId = Date.now();
        const projectKey = activeProject?.key || "RB";

        const newTask: Task = {
          id: nextId,
          projectId: activeProjectId,
          code: `${projectKey}-${nextId}`,
          sprintId: taskSprintId,
          title,
          description,
          status: taskDefaultStatus || columns[0]?.key || "todo",
          comments: [],
          attachments: [],
          labels,
          assigneeId,
          deadline,
          priority,
          createdBy: currentUser.id,
          taskType,
          errorType,
          estimate: taskEstimate,
          shiftNeed,
          autoAssigned,
          assignmentReason,
          source: "manual",
        };

        await setDoc(doc(db, "tasks", String(newTask.id)), newTask);

        addLog(`تسک ${newTask.code} ساخته شد`);
        notify(autoAssigned ? `تسک جدید ساخته شد و خودکار اساین شد` : "تسک جدید ساخته شد");
      }
    } catch (error) {
      console.error("Task save error:", error);
      alert("ذخیره تسک با خطا مواجه شد.");
    }
  };

  const deleteTask = async (id: number) => {
    const task = tasks.find((item) => item.id === id);

    if (!task) return;

    if (!canDeleteTask(task)) {
      showNoAccess();
      return;
    }

    await deleteDoc(doc(db, "tasks", String(id)));

    setIsTaskModalOpen(false);

    addLog(`تسک ${task.code} حذف شد`);
    notify(`تسک ${task.code} حذف شد`);
  };

  const addComment = async () => {
    if (!selectedTask || !commentText.trim()) return;

    if (!canEditTask(selectedTask)) {
      showNoAccess();
      return;
    }

    const currentTask = tasks.find((task) => task.id === selectedTask.id);

    if (!currentTask) return;

    const mentionedUsers = users.filter((user) =>
      commentText.includes(`@${user.name}`)
    );

    const updatedTask: Task = {
      ...currentTask,
      comments: [
        ...currentTask.comments,
        {
          id: Date.now(),
          text: commentText,
          author: currentUser.name,
        },
      ],
    };

    await setDoc(doc(db, "tasks", String(updatedTask.id)), updatedTask);

    addLog(`کامنت جدید روی ${updatedTask.code} ثبت شد`);

    mentionedUsers.forEach((user) => {
      notify(`${user.name} در ${updatedTask.code} منشن شد`);
    });

    setCommentText("");
  };

  const addAttachment = async (files: FileList | null) => {
    if (!selectedTask || !files) return;

    if (!canEditTask(selectedTask)) {
      showNoAccess();
      return;
    }

    const currentTask = tasks.find((task) => task.id === selectedTask.id);

    if (!currentTask) return;

    const newFiles: Attachment[] = Array.from(files).map((file) => ({
      id: Date.now() + Math.random(),
      name: file.name,
      type: file.type,
      url: URL.createObjectURL(file),
    }));

    const updatedTask: Task = {
      ...currentTask,
      attachments: [...currentTask.attachments, ...newFiles],
    };

    await setDoc(doc(db, "tasks", String(updatedTask.id)), updatedTask);

    addLog(`فایل به ${updatedTask.code} اضافه شد`);
  };

  const openNewSprintModal = () => {
    if (!permissions.canCreateTask) {
      showNoAccess();
      return;
    }

    setEditingSprintId(null);
    setSprintName("");
    setSprintGoal("");
    setSprintStartDate("");
    setSprintEndDate("");
    setSprintStatus("planned");
    setIsSprintModalOpen(true);
  };

  const openEditSprintModal = (sprint: Sprint) => {
    if (!permissions.canCreateTask) {
      showNoAccess();
      return;
    }

    setEditingSprintId(sprint.id);
    setSprintName(sprint.name);
    setSprintGoal(sprint.goal || "");
    setSprintStartDate(sprint.startDate || "");
    setSprintEndDate(sprint.endDate || "");
    setSprintStatus(sprint.status || "planned");
    setIsSprintModalOpen(true);
  };

  const closeSprintModal = () => {
    setIsSprintModalOpen(false);
    setEditingSprintId(null);
    setSprintName("");
    setSprintGoal("");
    setSprintStartDate("");
    setSprintEndDate("");
    setSprintStatus("planned");
  };

  const saveSprint = async () => {
    if (!permissions.canCreateTask) {
      showNoAccess();
      return;
    }

    if (!sprintName.trim()) return;

    const sprintId = editingSprintId || Date.now();
    const newSprint: Sprint = {
      id: sprintId,
      projectId: activeProjectId,
      name: sprintName.trim(),
      goal: sprintGoal.trim(),
      startDate: sprintStartDate,
      endDate: sprintEndDate,
      status: sprintStatus,
      createdAt: editingSprintId
        ? sprints.find((item) => item.id === editingSprintId)?.createdAt || Date.now()
        : Date.now(),
    };

    closeSprintModal();

    await setDoc(doc(db, "sprints", String(newSprint.id)), newSprint);
    setActiveSprintId(newSprint.id);
    addLog(`اسپرینت ${newSprint.name} ذخیره شد`);
    notify("اسپرینت ذخیره شد");
  };

  const deleteSprint = async (sprintId: number) => {
    if (!permissions.canCreateTask) {
      showNoAccess();
      return;
    }

    if (!confirm("اسپرینت حذف شود؟ تسک‌های آن به بک‌لاگ منتقل می‌شوند.")) return;

    const sprintTasks = tasks.filter((task) => task.sprintId === sprintId);

    await Promise.all([
      deleteDoc(doc(db, "sprints", String(sprintId))),
      ...sprintTasks.map((task) =>
        setDoc(doc(db, "tasks", String(task.id)), {
          ...task,
          sprintId: null,
        })
      ),
    ]);

    if (activeSprintId === sprintId) setActiveSprintId(null);
    notify("اسپرینت حذف شد و تسک‌ها به بک‌لاگ برگشتند");
  };

  const moveTaskToSprint = async (task: Task, sprintId: number | null) => {
    if (!canEditTask(task)) {
      showNoAccess();
      return;
    }

    const updatedTask: Task = {
      ...task,
      sprintId,
    };

    await setDoc(doc(db, "tasks", String(updatedTask.id)), updatedTask);
    notify(sprintId ? "تسک به اسپرینت منتقل شد" : "تسک به بک‌لاگ برگشت");
    addLog(`${task.code} بین بک‌لاگ و اسپرینت جابه‌جا شد`);
  };

  const openNewColumnModal = () => {
    if (!permissions.canCreateColumn) {
      showNoAccess();
      return;
    }

    setEditingColumnKey(null);
    setColumnTitle("");
    setIsColumnModalOpen(true);
  };

  const openEditColumnModal = (column: Column) => {
    if (!permissions.canEditColumn) {
      showNoAccess();
      return;
    }

    setEditingColumnKey(column.key);
    setColumnTitle(column.label);
    setIsColumnModalOpen(true);
  };

  const saveColumn = async () => {
    if (editingColumnKey && !permissions.canEditColumn) {
      showNoAccess();
      return;
    }

    if (!editingColumnKey && !permissions.canCreateColumn) {
      showNoAccess();
      return;
    }

    if (!columnTitle.trim()) return;

    const title = columnTitle;
    const editingKey = editingColumnKey;

    setIsColumnModalOpen(false);
    setColumnTitle("");
    setEditingColumnKey(null);

    try {
      if (editingKey) {
        const order = columns.findIndex((column) => column.key === editingKey);

        await setDoc(doc(db, "columns", editingKey), {
          label: title,
          order,
        });

        addLog("نام ستون تغییر کرد");
      } else {
        const key = title.toLowerCase().replace(/\s+/g, "-") + "-" + Date.now();

        await setDoc(doc(db, "columns", key), {
          label: title,
          order: columns.length,
        });

        addLog(`ستون ${title} اضافه شد`);
      }
    } catch (error) {
      console.error("Column save error:", error);
      alert("ذخیره ستون با خطا مواجه شد.");
    }
  };

  const deleteColumn = async (key: string) => {
    if (!permissions.canDeleteColumn) {
      showNoAccess();
      return;
    }

    if (!confirm("با حذف ستون، تسک‌های داخل آن هم حذف می‌شوند. مطمئنی؟")) return;

    const columnTasks = tasks.filter((task) => task.status === key);

    await Promise.all([
      deleteDoc(doc(db, "columns", key)),
      ...columnTasks.map((task) => deleteDoc(doc(db, "tasks", String(task.id)))),
    ]);

    addLog("یک ستون حذف شد");
  };

  const onDropToColumn = async (targetColumnKey: string) => {
    if (draggedColumnKey) {
      if (!permissions.canDragColumns) {
        showNoAccess();
        setDraggedColumnKey(null);
        return;
      }

      const fromIndex = columns.findIndex((column) => column.key === draggedColumnKey);
      const toIndex = columns.findIndex((column) => column.key === targetColumnKey);

      if (fromIndex === -1 || toIndex === -1) return;

      const updated = [...columns];

      const [moved] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, moved);

      await Promise.all(
        updated.map((column, index) =>
          setDoc(doc(db, "columns", column.key), {
            label: column.label,
            order: index,
          })
        )
      );

      setDraggedColumnKey(null);
      addLog("ستون‌ها جابه‌جا شدند");
      return;
    }

    if (draggedTask) {
      const currentTask = tasks.find((task) => task.id === draggedTask.id);

      if (!currentTask) return;

      if (!canEditTask(currentTask)) {
        showNoAccess();
        setDraggedTask(null);
        return;
      }

      const updatedTask: Task = {
        ...currentTask,
        status: targetColumnKey,
        sprintId: currentTask.sprintId ?? activeSprintId,
      };

      await setDoc(doc(db, "tasks", String(updatedTask.id)), updatedTask);

      addLog(`تسک ${updatedTask.code} جابه‌جا شد`);
      setDraggedTask(null);
    }
  };

  const parseImportFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      let rows: ImportPreviewRow[] = [];

      if (file.name.toLowerCase().endsWith(".json")) {
        const json = JSON.parse(content);
        const items = Array.isArray(json) ? json : json.issues || json.tasks || [];

        rows = items.map((item: any) => {
          const fields = item.fields || item;
          const project = fields.project || {};

          return {
            title: fields.summary || fields.title || item.key || "بدون عنوان",
            description: fields.description || "",
            projectKey: project.key || fields.projectKey || activeProject?.key || "RB",
            projectName: project.name || fields.projectName || activeProject?.name || "Imported Project",
            sprintName: fields.sprint || fields.sprintName || "",
            status: fields.status?.name || fields.status || columns[0]?.key || "todo",
            assigneeEmail: fields.assignee?.emailAddress || fields.assigneeEmail || "",
            assigneeName: fields.assignee?.displayName || fields.assigneeName || "",
            priority: normalizePriority(fields.priority?.name || fields.priority || "medium"),
            deadline: fields.duedate || fields.deadline || "",
            labels: Array.isArray(fields.labels)
              ? fields.labels
              : String(fields.labels || "").split(",").map((label) => label.trim()).filter(Boolean),
            taskType: normalizeTaskType(fields.issueType?.name || fields.issuetype?.name || fields.taskType || "bug"),
            errorType: normalizeErrorType(fields.errorType || ""),
            estimate: normalizeEstimate(String(fields.estimate || fields.storyPoints || "medium")),
          };
        });
      } else {
        const csvRows = parseCsv(content);
        const headers = csvRows[0] || [];

        rows = csvRows.slice(1).map((values) => {
          const row = Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));

          return {
            title: rowValue(row, ["Summary", "Title", "Issue key", "Task"]) || "بدون عنوان",
            description: rowValue(row, ["Description"]),
            projectKey: rowValue(row, ["Project key", "Project Key", "Project"]) || activeProject?.key || "RB",
            projectName: rowValue(row, ["Project name", "Project Name"]) || activeProject?.name || "Imported Project",
            sprintName: rowValue(row, ["Sprint", "Sprint Name", "Fix Version/s"]),
            status: rowValue(row, ["Status"]) || columns[0]?.key || "todo",
            assigneeEmail: rowValue(row, ["Assignee email", "Assignee Email", "Assignee"]),
            assigneeName: rowValue(row, ["Assignee name", "Assignee Name", "Assignee"]),
            priority: normalizePriority(rowValue(row, ["Priority"])),
            deadline: rowValue(row, ["Due date", "Due Date", "Deadline"]),
            labels: rowValue(row, ["Labels"]).split(",").map((label) => label.trim()).filter(Boolean),
            taskType: normalizeTaskType(rowValue(row, ["Issue Type", "Type", "Task Type"])),
            errorType: normalizeErrorType(rowValue(row, ["Error Type", "Component/s", "Component"])),
            estimate: normalizeEstimate(rowValue(row, ["Story Points", "Estimate", "Original estimate"])),
          };
        });
      }

      setImportPreview(rows.filter((row) => row.title.trim()));
      setImportLog((prev) => [`${rows.length} ردیف از فایل خوانده شد`, ...prev]);
    } catch (error) {
      console.error("Import parse error:", error);
      alert("خواندن فایل با خطا مواجه شد. فایل CSV یا JSON خروجی Jira را بررسی کن.");
    }
  };

  const importTasks = async () => {
    if (!permissions.canCreateTask) {
      showNoAccess();
      return;
    }

    if (importPreview.length === 0) return;

    const now = Date.now();
    const writes: Promise<void>[] = [];
    const localProjects = [...projects];
    const localSprints = [...sprints];
    const logs: string[] = [];

    importPreview.forEach((row, index) => {
      let project = localProjects.find(
        (item) =>
          item.key.toLowerCase() === row.projectKey.toLowerCase() ||
          item.name.toLowerCase() === row.projectName.toLowerCase()
      );

      if (!project) {
        project = {
          id: now + index + 10,
          name: row.projectName || row.projectKey,
          key: (row.projectKey || `IMP${index}`).toUpperCase().slice(0, 8),
          createdAt: now + index,
        };

        localProjects.push(project);
        writes.push(setDoc(doc(db, "projects", String(project.id)), project));
        logs.push(`پروژه ${project.name} ساخته شد`);
      }

      let sprintId: number | null = null;

      if (row.sprintName.trim()) {
        let sprint = localSprints.find(
          (item) =>
            item.projectId === project!.id &&
            item.name.toLowerCase() === row.sprintName.toLowerCase()
        );

        if (!sprint) {
          sprint = {
            id: now + index + 10000,
            projectId: project.id,
            name: row.sprintName.trim(),
            goal: "ایمپورت شده از Jira",
            status: "planned",
            createdAt: now + index,
          };

          localSprints.push(sprint);
          writes.push(setDoc(doc(db, "sprints", String(sprint.id)), sprint));
          logs.push(`اسپرینت ${sprint.name} ساخته شد`);
        }

        sprintId = sprint.id;
      }

      const assignee = users.find(
        (user) =>
          user.email.toLowerCase() === row.assigneeEmail.toLowerCase() ||
          user.name.toLowerCase() === row.assigneeName.toLowerCase()
      );

      const statusColumn =
        columns.find(
          (column) =>
            column.key.toLowerCase() === row.status.toLowerCase().replace(/\s+/g, "") ||
            column.label.toLowerCase() === row.status.toLowerCase()
        ) || columns[0];

      const taskId = now + index + 100000;
      const task: Task = {
        id: taskId,
        projectId: project.id,
        sprintId,
        code: `${project.key}-${taskId}`,
        title: row.title,
        status: statusColumn?.key || "todo",
        description: row.description,
        comments: [],
        attachments: [],
        labels: row.labels,
        assigneeId: assignee?.id || null,
        deadline: row.deadline,
        priority: row.priority,
        createdBy: currentUser.id,
        taskType: row.taskType,
        errorType: row.errorType,
        estimate: row.estimate,
        shiftNeed: "any",
        source: "import",
        importedAt: now,
      };

      writes.push(setDoc(doc(db, "tasks", String(task.id)), task));
    });

    await Promise.all(writes);

    setImportLog((prev) => [`${importPreview.length} تسک ایمپورت شد`, ...logs, ...prev]);
    setImportPreview([]);
    notify("ایمپورت با موفقیت انجام شد");
    addLog("تسک‌ها از فایل ایمپورت شدند");
  };

  const exportReportCsv = () => {
    const headers = ["Project", "Sprint", "Code", "Title", "Status", "Assignee", "Priority", "Deadline", "Estimate", "Source"];
    const lines = reportTasks.map((task) => {
      const project = projects.find((item) => item.id === task.projectId);
      const sprint = sprints.find((item) => item.id === task.sprintId);
      const assignee = users.find((item) => item.id === task.assigneeId);

      return [
        project?.name || "",
        sprint?.name || "Backlog",
        task.code,
        task.title,
        task.status,
        assignee?.name || "",
        task.priority,
        task.deadline,
        task.estimate || "",
        task.source || "manual",
      ].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",");
    });

    const csv = [headers.join(","), ...lines].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `rahboard-report-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const allLabels = Array.from(
    new Set(projectTasks.flatMap((task) => task.labels))
  );

  const filteredProjects = projects.filter(
    (project) =>
      project.name.toLowerCase().includes(projectSearch.toLowerCase()) ||
      project.key.toLowerCase().includes(projectSearch.toLowerCase())
  );

  const filteredTasks = boardTasks.filter((task) => {
    const matchesSearch =
      task.title.toLowerCase().includes(search.toLowerCase()) ||
      task.description.toLowerCase().includes(search.toLowerCase()) ||
      task.code.toLowerCase().includes(search.toLowerCase());

    const matchesAssignee =
      filterAssignee === "all" || String(task.assigneeId) === filterAssignee;

    const matchesLabel = filterLabel === "all" || task.labels.includes(filterLabel);

    return matchesSearch && matchesAssignee && matchesLabel;
  });

  const reportTasks = tasks.filter((task) => {
    const projectMatch = reportProjectId === "all" || task.projectId === Number(reportProjectId);
    const sprintMatch =
      reportSprintId === "all" ||
      (reportSprintId === "backlog" && !task.sprintId) ||
      task.sprintId === Number(reportSprintId);
    const userMatch = reportUserId === "all" || task.assigneeId === Number(reportUserId);

    const deadlineTime = task.deadline ? new Date(task.deadline).getTime() : null;
    const fromMatch =
      !reportFromDate || (deadlineTime !== null && deadlineTime >= new Date(reportFromDate).getTime());
    const toMatch =
      !reportToDate || (deadlineTime !== null && deadlineTime <= new Date(reportToDate).getTime());

    return projectMatch && sprintMatch && userMatch && fromMatch && toMatch;
  });

  const reportDone = reportTasks.filter((task) => task.status === "done").length;
  const reportOverdue = reportTasks.filter((task) => {
    const days = daysUntil(task.deadline);
    return days !== null && days < 0 && task.status !== "done";
  }).length;
  const reportProgress = reportTasks.length ? Math.round((reportDone / reportTasks.length) * 100) : 0;

  const currentSelectedTask = selectedTask
    ? tasks.find((task) => task.id === selectedTask.id)
    : null;

  const taskModalCanEdit = selectedTask
    ? canEditTask(currentSelectedTask || selectedTask)
    : permissions.canCreateTask;

  const priorityStyle: Record<Priority, string> = {
    low: "bg-slate-100 text-slate-700 border-slate-200",
    medium: "bg-blue-50 text-blue-700 border-blue-200",
    high: "bg-orange-50 text-orange-700 border-orange-200",
    urgent: "bg-red-50 text-red-700 border-red-200",
  };

  const priorityDot: Record<Priority, string> = {
    low: "bg-slate-400",
    medium: "bg-blue-500",
    high: "bg-orange-500",
    urgent: "bg-red-500",
  };

  const healthStyle = {
    healthy: "bg-emerald-50 text-emerald-700 border-emerald-200",
    risk: "bg-amber-50 text-amber-700 border-amber-200",
    critical: "bg-red-50 text-red-700 border-red-200",
  }[pulse.health];

  if (authLoading) {
    return (
      <div dir="rtl" className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-700">
        <div className="rounded-3xl bg-white p-6 shadow-xl">در حال بررسی ورود...</div>
      </div>
    );
  }

  if (!authUser) {
    return (
      <div dir="rtl" className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-slate-100 to-blue-50 p-4 text-slate-800">
        <div className="w-full max-w-md rounded-3xl border border-white/70 bg-white/90 p-7 shadow-2xl backdrop-blur">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-lg font-bold text-white">
              R
            </div>
            <div>
              <h1 className="text-2xl font-black">ورود به RahBoard</h1>
              <p className="text-sm text-slate-500">با ایمیل و رمز عبور تیم وارد شو</p>
            </div>
          </div>

          <div className="space-y-4">
            <input
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              type="email"
              placeholder="ایمیل"
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500"
            />

            <input
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              type="password"
              placeholder="رمز عبور"
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleLogin();
              }}
            />

            {loginError && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {loginError}
              </div>
            )}

            <button
              onClick={handleLogin}
              className="w-full rounded-2xl bg-blue-600 px-5 py-3 font-bold text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700"
            >
              ورود
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (authUser && usersLoading) {
    return (
      <div dir="rtl" className="flex min-h-screen items-center justify-center bg-slate-100 p-4 text-slate-800">
        <div className="w-full max-w-md rounded-3xl bg-white p-7 text-center shadow-xl">
          <div className="mx-auto mb-5 h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
          <h1 className="text-2xl font-black">در حال آماده‌سازی حساب شما...</h1>
          <p className="mt-3 leading-7 text-slate-500">
            لطفاً چند لحظه صبر کنید؛ در حال بررسی دسترسی و اطلاعات تیم هستیم.
          </p>
          <p className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm font-mono text-slate-500">
            {authUser.email}
          </p>
        </div>
      </div>
    );
  }

  if (!appUser) {
    return (
      <div dir="rtl" className="flex min-h-screen items-center justify-center bg-slate-100 p-4 text-slate-800">
        <div className="w-full max-w-md rounded-3xl bg-white p-7 text-center shadow-xl">
          <h1 className="text-2xl font-black">عضویت تأیید نشده</h1>
          <p className="mt-3 leading-7 text-slate-500">
            شما وارد شده‌اید، اما ایمیل شما هنوز در لیست اعضای RahBoard ثبت نشده است.
          </p>
          <p className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm font-mono text-slate-500">
            {authUser.email}
          </p>
          <button
            onClick={handleLogout}
            className="mt-5 rounded-2xl bg-slate-900 px-5 py-3 font-medium text-white"
          >
            خروج
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-blue-50 text-slate-800"
    >
      <div className="flex min-h-screen">
        <aside className="hidden w-72 shrink-0 border-l border-white/70 bg-white/70 p-5 shadow-xl shadow-slate-200/60 backdrop-blur lg:block">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-lg font-bold text-white shadow-lg shadow-blue-200">
              R
            </div>

            <div>
              <h2 className="text-xl font-black">RahBoard</h2>
              <p className="text-xs text-slate-500">EFEX Workspace</p>
            </div>
          </div>

          <div className="mb-6 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-bold">پروژه‌ها</p>

              {permissions.canCreateProject && (
                <button
                  onClick={openNewProjectModal}
                  className="text-xs font-bold text-blue-600"
                >
                  + جدید
                </button>
              )}
            </div>

            <input
              value={projectSearch}
              onChange={(e) => setProjectSearch(e.target.value)}
              placeholder="جستجوی پروژه..."
              className="mb-3 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
            />

            <div className="space-y-2">
              {filteredProjects.map((project) => (
                <div
                  key={project.id}
                  className={`group flex items-center justify-between rounded-2xl transition ${
                    activeProjectId === project.id
                      ? "bg-blue-50 text-blue-700"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <button
                    onClick={() => setActiveProjectId(project.id)}
                    className="flex-1 px-4 py-3 text-right text-sm"
                  >
                    <span className="font-bold">{project.name}</span>
                    <span className="mr-2 text-xs text-slate-400">({project.key})</span>
                  </button>

                  {permissions.canCreateProject && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditProjectModal(project);
                      }}
                      className="rounded-full px-2 py-1 text-xs text-blue-600 opacity-0 transition hover:bg-blue-50 group-hover:opacity-100"
                    >
                      ویرایش
                    </button>
                  )}

                  {permissions.canDeleteProject && (
                    <button
                      onClick={() => deleteProject(project.id)}
                      className="ml-2 rounded-full px-2 py-1 text-xs text-red-500 opacity-0 transition hover:bg-red-50 group-hover:opacity-100"
                    >
                      حذف
                    </button>
                  )}
                </div>
              ))}

              {filteredProjects.length === 0 && (
                <div className="rounded-2xl bg-slate-50 p-3 text-center text-xs text-slate-400">
                  پروژه‌ای پیدا نشد
                </div>
              )}
            </div>
          </div>

          <nav className="space-y-2 text-sm">
            <button
              onClick={() => setActiveView("board")}
              className={`w-full rounded-2xl px-4 py-3 text-right font-semibold ${
                activeView === "board"
                  ? "bg-blue-50 text-blue-700"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              بورد پروژه
            </button>

            <button
              onClick={() => setActiveView("backlog")}
              className={`w-full rounded-2xl px-4 py-3 text-right font-semibold ${
                activeView === "backlog"
                  ? "bg-blue-50 text-blue-700"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              بک‌لاگ
            </button>

            <button
              onClick={() => setActiveView("myTasks")}
              className={`w-full rounded-2xl px-4 py-3 text-right font-semibold ${
                activeView === "myTasks"
                  ? "bg-blue-50 text-blue-700"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              تسک‌های من
            </button>

            <button
              onClick={() => setActiveView("reports")}
              className={`w-full rounded-2xl px-4 py-3 text-right font-semibold ${
                activeView === "reports"
                  ? "bg-blue-50 text-blue-700"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              گزارش‌ها
            </button>

            <button
              onClick={() => setActiveView("imports")}
              className={`w-full rounded-2xl px-4 py-3 text-right font-semibold ${
                activeView === "imports"
                  ? "bg-blue-50 text-blue-700"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              ایمپورت فایل
            </button>

            {permissions.canManageTeam && (
              <button
                onClick={() => setActiveView("teamSettings")}
                className={`w-full rounded-2xl px-4 py-3 text-right font-semibold ${
                  activeView === "teamSettings"
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                تنظیمات تیم
              </button>
            )}
          </nav>

          {permissions.canManageTeam && (
            <div className="mt-10 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-bold">اعضای تیم</p>

                <button
                  onClick={() => setIsUserModalOpen(true)}
                  className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white"
                >
                  + عضو
                </button>
              </div>

              <div className="space-y-3">
                {users.slice(0, 6).map((user) => {
                  const userLoad = workloadByUser.find((item) => item.user.id === user.id);

                  return (
                    <div key={user.id} className="rounded-2xl bg-slate-50 p-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                          {user.avatar}
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold">{user.name}</p>
                          <p className="truncate text-[11px] text-slate-400">{user.email}</p>
                          <p className="truncate text-[11px] text-slate-400">
                            {user.role} · {user.shift || "full"} · {userLoad?.load || 0}/{user.capacity || 5}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {users.length > 6 && (
                  <button
                    onClick={() => setActiveView("teamSettings")}
                    className="w-full rounded-2xl bg-slate-50 px-3 py-2 text-xs font-bold text-blue-600 hover:bg-blue-50"
                  >
                    مشاهده همه اعضا
                  </button>
                )}
              </div>
            </div>
          )}
        </aside>

        <main className="flex-1 overflow-hidden p-6">
          <header className="mb-6 rounded-3xl border border-white/70 bg-white/80 p-5 shadow-xl shadow-slate-200/70 backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                    {activeProject?.key}
                  </span>

                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                    {activeProject?.name}
                  </span>

                  <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">
                    {activeSprint ? activeSprint.name : "بدون اسپرینت فعال"}
                  </span>

                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                    {currentUser.role}
                  </span>
                </div>

                <h1 className="text-3xl font-black tracking-tight">RahBoard</h1>
                <p className="mt-1 text-sm text-slate-500">
                  مدیریت پروژه، بک‌لاگ، اسپرینت و تسک‌های تیم افکس
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-2">
                  <p className="mb-1 text-[11px] font-bold text-slate-400">کاربر واردشده</p>
                  <p className="text-sm font-bold">{currentUser.name}</p>
                  <p className="text-[11px] text-slate-400">{currentUser.email}</p>
                </div>

                <button
                  onClick={handleLogout}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50"
                >
                  خروج
                </button>

                <select
                  value={activeProjectId}
                  onChange={(e) => setActiveProjectId(Number(e.target.value))}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none"
                >
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>

                <select
                  value={activeSprintId || ""}
                  onChange={(e) => setActiveSprintId(e.target.value ? Number(e.target.value) : null)}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none"
                >
                  <option value="">انتخاب اسپرینت</option>
                  {projectSprints.map((sprint) => (
                    <option key={sprint.id} value={sprint.id}>
                      {sprint.name} - {sprint.status}
                    </option>
                  ))}
                </select>

                {permissions.canCreateProject && (
                  <button
                    onClick={openNewProjectModal}
                    className="rounded-2xl bg-slate-900 px-5 py-3 font-medium text-white shadow-lg transition hover:-translate-y-0.5"
                  >
                    افزودن پروژه
                  </button>
                )}

                {permissions.canCreateColumn && (
                  <button
                    onClick={openNewColumnModal}
                    className="rounded-2xl bg-emerald-600 px-5 py-3 font-medium text-white shadow-lg shadow-emerald-200 transition hover:-translate-y-0.5 hover:bg-emerald-700"
                  >
                    افزودن ستون
                  </button>
                )}

                {permissions.canCreateTask && (
                  <>
                    <button
                      onClick={openNewSprintModal}
                      className="rounded-2xl bg-indigo-600 px-5 py-3 font-medium text-white shadow-lg shadow-indigo-200 transition hover:-translate-y-0.5 hover:bg-indigo-700"
                    >
                      ایجاد اسپرینت
                    </button>

                    <button
                      onClick={() => openNewTaskModal()}
                      className="rounded-2xl bg-blue-600 px-5 py-3 font-medium text-white shadow-lg shadow-blue-200 transition hover:-translate-y-0.5 hover:bg-blue-700"
                    >
                      افزودن تسک
                    </button>
                  </>
                )}

                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white shadow-lg">
                  {currentUser.avatar}
                </div>
              </div>
            </div>
          </header>

          {activeView === "board" && (
            <>
          <section className="mb-6 rounded-3xl border border-white/70 bg-white/70 p-4 shadow-lg shadow-slate-200/60 backdrop-blur">
            <div className="flex flex-wrap gap-3">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="جستجوی سریع تسک، توضیحات یا شماره..."
                className="min-w-[280px] flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              />

              <select
                value={filterAssignee}
                onChange={(e) => setFilterAssignee(e.target.value)}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none"
              >
                <option value="all">همه افراد</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} - {user.role}
                  </option>
                ))}
              </select>

              <select
                value={filterLabel}
                onChange={(e) => setFilterLabel(e.target.value)}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none"
              >
                <option value="all">همه لیبل‌ها</option>
                {allLabels.map((label) => (
                  <option key={label} value={label}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </section>

          <section className="mb-6 rounded-3xl border border-white/70 bg-white/80 p-5 shadow-xl shadow-slate-200/60 backdrop-blur">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black">Sprint Pulse</h2>
                <p className="mt-1 text-sm text-slate-500">نبض اسپرینت فعال، ریسک ددلاین و حجم کاری تیم</p>
              </div>

              <div className={`rounded-2xl border px-4 py-3 text-sm font-bold ${healthStyle}`}>
                {pulse.health === "healthy" && "🟢 Healthy"}
                {pulse.health === "risk" && "🟡 At Risk"}
                {pulse.health === "critical" && "🔴 Critical"}
              </div>
            </div>

            <div className="mb-5 grid gap-3 md:grid-cols-5">
              <div className="rounded-3xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-bold text-slate-400">پیشرفت</p>
                <p className="mt-2 text-3xl font-black text-blue-700">{pulse.progress}%</p>
                <div className="mt-3 h-2 rounded-full bg-slate-100">
                  <div
                    className="h-2 rounded-full bg-blue-600"
                    style={{ width: `${pulse.progress}%` }}
                  />
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-bold text-slate-400">تکمیل شده</p>
                <p className="mt-2 text-3xl font-black">{pulse.done}/{pulse.total}</p>
                <p className="mt-1 text-xs text-slate-400">تسک تکمیل‌شده</p>
              </div>

              <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-xs font-bold text-amber-600">ددلاین نزدیک</p>
                <p className="mt-2 text-3xl font-black text-amber-700">{pulse.dueSoon}</p>
                <p className="mt-1 text-xs text-amber-600">تا ۳ روز آینده</p>
              </div>

              <div className="rounded-3xl border border-red-200 bg-red-50 p-4">
                <p className="text-xs font-bold text-red-600">عقب‌افتاده</p>
                <p className="mt-2 text-3xl font-black text-red-700">{pulse.overdue}</p>
                <p className="mt-1 text-xs text-red-600">نیازمند اقدام سریع</p>
              </div>

              <div className="rounded-3xl border border-purple-200 bg-purple-50 p-4">
                <p className="text-xs font-bold text-purple-600">گلوگاه</p>
                <p className="mt-2 text-lg font-black text-purple-700">{pulse.busiestColumn.label}</p>
                <p className="mt-1 text-xs text-purple-600">{pulse.busiestColumn.count} تسک</p>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-3xl border border-slate-200 bg-white p-4 lg:col-span-2">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-black">Workload Radar</p>
                  <p className="text-xs text-slate-400">حجم کاری فعال هر نفر</p>
                </div>

                <div className="space-y-3">
                  {workloadByUser
                    .filter((item) => item.user.role === "developer")
                    .map((item) => {
                      const percent = Math.min(100, Math.round((item.load / item.capacity) * 100));

                      return (
                        <div key={item.user.id}>
                          <div className="mb-1 flex items-center justify-between text-xs">
                            <span className="font-bold">{item.user.name}</span>
                            <span className="text-slate-400">
                              {item.load}/{item.capacity} · {item.user.shift}
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-slate-100">
                            <div
                              className="h-2 rounded-full bg-slate-900"
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-black">Smart Insight</p>
                <p className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm leading-7 text-slate-600">
                  {pulse.message}
                </p>
                <p className="mt-3 text-xs leading-6 text-slate-400">
                  تسک‌های بدون اسپرینت در بک‌لاگ می‌مانند و با انتخاب اسپرینت به بورد فعال منتقل می‌شوند.
                </p>
              </div>
            </div>
          </section>

          {notifications.length > 0 && (
            <section className="mb-6 rounded-3xl border border-blue-100 bg-white/80 p-4 shadow-lg shadow-slate-200/60 backdrop-blur">
              <h3 className="mb-3 text-sm font-bold text-slate-700">نوتیفیکیشن‌ها</h3>

              <div className="grid gap-2 md:grid-cols-2">
                {notifications.map((notification, index) => (
                  <div
                    key={index}
                    className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700"
                  >
                    {notification}
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="overflow-x-auto pb-5">
            <div className="flex min-w-max gap-5">
              {columns.map((column) => (
                <div
                  key={column.key}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDropToColumn(column.key)}
                  className="flex min-h-[560px] w-[315px] flex-col rounded-3xl border border-slate-200 bg-white/75 p-4 shadow-xl shadow-slate-200/60 backdrop-blur"
                >
                  <div
                    draggable={permissions.canDragColumns}
                    onDragStart={() => {
                      if (!permissions.canDragColumns) return;
                      setDraggedColumnKey(column.key);
                    }}
                    className={`mb-4 flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 ${
                      permissions.canDragColumns ? "cursor-grab" : "cursor-default"
                    }`}
                  >
                    <div>
                      <h2 className="text-sm font-black">{column.label}</h2>
                      <p className="mt-1 text-[11px] text-slate-400">
                        {permissions.canDragColumns ? "" : "View only"}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-bold shadow-sm">
                        {filteredTasks.filter((task) => task.status === column.key).length}
                      </span>

                      {permissions.canEditColumn && (
                        <button
                          onClick={() => openEditColumnModal(column)}
                          className="text-xs font-medium text-blue-600 hover:text-blue-800"
                        >
                          ویرایش
                        </button>
                      )}

                      {permissions.canDeleteColumn && (
                        <button
                          onClick={() => deleteColumn(column.key)}
                          className="text-xs font-medium text-red-500 hover:text-red-700"
                        >
                          حذف
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 space-y-3">
                    {filteredTasks
                      .filter((task) => task.status === column.key)
                      .map((task) => {
                        const assignee = users.find((user) => user.id === task.assigneeId);
                        const creator = users.find((user) => user.id === task.createdBy);
                        const deadlineDays = daysUntil(task.deadline);

                        return (
                          <div
                            key={task.id}
                            draggable={canEditTask(task)}
                            onDragStart={(e) => {
                              e.stopPropagation();

                              if (!canEditTask(task)) {
                                showNoAccess();
                                return;
                              }

                              setDraggedTask(task);
                              setDraggedColumnKey(null);
                            }}
                            onClick={() => openTask(task)}
                            className="group cursor-pointer rounded-3xl border border-slate-200 bg-white p-4 shadow-md shadow-slate-200/70 transition-all hover:-translate-y-1 hover:border-blue-300 hover:shadow-xl"
                          >
                            <div className="mb-3 flex items-start justify-between gap-2">
                              <div>
                                <span className="text-xs font-black text-blue-600">
                                  {task.code}
                                </span>
                                <h3 className="mt-1 text-sm font-bold leading-6">
                                  {task.title}
                                </h3>
                              </div>

                              {canDeleteTask(task) && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteTask(task.id);
                                  }}
                                  className="rounded-full px-2 py-1 text-xs text-red-500 opacity-70 hover:bg-red-50 hover:opacity-100"
                                >
                                  حذف
                                </button>
                              )}
                            </div>

                            {task.description && (
                              <p className="line-clamp-2 text-xs leading-6 text-slate-500">
                                {task.description}
                              </p>
                            )}

                            <div className="mt-3 flex flex-wrap gap-1 text-[11px]">
                              <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">
                                {task.taskType || "bug"}
                              </span>
                              <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">
                                {task.errorType || "unknown"}
                              </span>
                              <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">
                                {task.estimate || "medium"}
                              </span>
                            </div>

                            {task.autoAssigned && task.assignmentReason && (
                              <div className="mt-3 rounded-2xl border border-blue-100 bg-blue-50 p-2 text-[11px] leading-5 text-blue-700">
                                🤖 {task.assignmentReason}
                              </div>
                            )}

                            <div className="mt-3 text-[11px] text-slate-400">
                              سازنده: {creator ? creator.name : "نامشخص"}
                            </div>

                            <div className="mt-4 flex flex-wrap gap-1">
                              {task.labels.map((label) => (
                                <span
                                  key={label}
                                  className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-600"
                                >
                                  {label}
                                </span>
                              ))}
                            </div>

                            <div className="mt-4 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {assignee ? (
                                  <>
                                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">
                                      {assignee.avatar}
                                    </div>
                                    <span className="text-xs text-slate-500">
                                      {assignee.name}
                                    </span>
                                  </>
                                ) : (
                                  <span className="text-xs text-slate-400">بدون مسئول</span>
                                )}
                              </div>

                              <span
                                className={`flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-bold ${priorityStyle[task.priority]}`}
                              >
                                <span
                                  className={`h-2 w-2 rounded-full ${priorityDot[task.priority]}`}
                                />
                                {task.priority}
                              </span>
                            </div>

                            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-400">
                              <span>💬 {task.comments.length}</span>
                              <span>📎 {task.attachments.length}</span>
                              <span>
                                {task.deadline
                                  ? deadlineDays !== null && deadlineDays < 0
                                    ? `⚠️ ${Math.abs(deadlineDays)} روز عقب`
                                    : `⏰ ${task.deadline}`
                                  : "بدون ددلاین"}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                  </div>

                  {permissions.canCreateTask && (
                    <button
                      onClick={() => openNewTaskModal(column.key, activeSprintId)}
                      className="mt-4 w-full rounded-3xl border-2 border-dashed border-blue-200 bg-blue-50/60 px-4 py-5 text-sm font-black text-blue-700 transition hover:-translate-y-0.5 hover:border-blue-400 hover:bg-blue-50"
                    >
                      + افزودن تسک در {column.label}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="mt-6 rounded-3xl border border-white/70 bg-white/80 p-5 shadow-xl shadow-slate-200/60 backdrop-blur">
            <h3 className="mb-3 font-black">Activity Log</h3>

            <div className="max-h-40 space-y-2 overflow-y-auto text-sm text-slate-600">
              {activityLogs.length === 0 && <p>هنوز فعالیتی ثبت نشده.</p>}

              {activityLogs.map((log, index) => (
                <div key={index} className="rounded-2xl bg-slate-50 p-3">
                  {log}
                </div>
              ))}
            </div>
          </section>
            </>
          )}

          {activeView === "backlog" && (
            <section className="rounded-3xl border border-white/70 bg-white/80 p-6 shadow-xl shadow-slate-200/60 backdrop-blur">
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-black">بک‌لاگ</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    تسک‌هایی که هنوز وارد اسپرینت فعال نشده‌اند اینجا نگهداری می‌شوند.
                  </p>
                </div>

                <button
                  onClick={() => openNewTaskModal(columns[0]?.key || "todo", null)}
                  className="rounded-2xl bg-blue-600 px-5 py-3 font-bold text-white shadow-lg shadow-blue-200 hover:bg-blue-700"
                >
                  + تسک جدید در بک‌لاگ
                </button>
              </div>

              <div className="mb-6 rounded-3xl border border-indigo-100 bg-indigo-50 p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-black text-indigo-800">اسپرینت‌ها</h3>
                    <p className="mt-1 text-sm text-indigo-600">
                  
                    </p>
                  </div>

                  <button
                    onClick={openNewSprintModal}
                    className="rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white hover:bg-indigo-700"
                  >
                    + ایجاد اسپرینت
                  </button>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {projectSprints.map((sprint) => {
                    const count = projectTasks.filter((task) => task.sprintId === sprint.id).length;
                    const done = projectTasks.filter((task) => task.sprintId === sprint.id && task.status === "done").length;
                    const progress = count ? Math.round((done / count) * 100) : 0;

                    return (
                      <div key={sprint.id} className="rounded-3xl border border-indigo-100 bg-white p-4 shadow-sm">
                        <div className="mb-3 flex items-start justify-between gap-2">
                          <div>
                            <p className="font-black">{sprint.name}</p>
                            <p className="mt-1 text-xs text-slate-400">{sprint.startDate || "-"} تا {sprint.endDate || "-"}</p>
                          </div>

                          <span className="rounded-full bg-indigo-50 px-2 py-1 text-[11px] font-bold text-indigo-700">
                            {sprint.status}
                          </span>
                        </div>

                        <p className="min-h-10 text-sm leading-6 text-slate-500">{sprint.goal || "هدف ثبت نشده"}</p>

                        <div className="mt-4">
                          <div className="mb-1 flex justify-between text-xs">
                            <span>{done}/{count} Done</span>
                            <span>{progress}%</span>
                          </div>
                          <div className="h-2 rounded-full bg-slate-100">
                            <div className="h-2 rounded-full bg-indigo-600" style={{ width: `${progress}%` }} />
                          </div>
                        </div>

                        <div className="mt-4 flex gap-2">
                          <button
                            onClick={() => {
                              setActiveSprintId(sprint.id);
                              setActiveView("board");
                            }}
                            className="flex-1 rounded-2xl bg-slate-900 px-3 py-2 text-xs font-bold text-white"
                          >
                            باز کردن بورد
                          </button>

                          <button
                            onClick={() => openEditSprintModal(sprint)}
                            className="rounded-2xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600"
                          >
                            ویرایش
                          </button>

                          <button
                            onClick={() => deleteSprint(sprint.id)}
                            className="rounded-2xl border border-red-100 px-3 py-2 text-xs font-bold text-red-500"
                          >
                            حذف
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {projectSprints.length === 0 && (
                    <div className="rounded-3xl border border-dashed border-indigo-200 bg-white p-6 text-center text-sm text-slate-400">
                      هنوز اسپرینتی ساخته نشده است.
                    </div>
                  )}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {backlogTasks.map((task) => {
                  const assignee = users.find((user) => user.id === task.assigneeId);
                  const deadlineDays = daysUntil(task.deadline);

                  return (
                    <div
                      key={task.id}
                      onClick={() => openTask(task)}
                      className="cursor-pointer rounded-3xl border border-slate-200 bg-white p-4 shadow-md transition hover:-translate-y-1 hover:border-blue-300 hover:shadow-xl"
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <span className="text-xs font-black text-blue-600">{task.code}</span>
                        <span className={`rounded-full border px-2 py-1 text-[11px] font-bold ${priorityStyle[task.priority]}`}>
                          {task.priority}
                        </span>
                      </div>

                      <h3 className="font-bold leading-7">{task.title}</h3>

                      {task.description && (
                        <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">{task.description}</p>
                      )}

                      <div className="mt-3 text-xs text-slate-400">
                        مسئول: {assignee?.name || "بدون مسئول"} · ددلاین: {task.deadline ? deadlineDays !== null && deadlineDays < 0 ? `${Math.abs(deadlineDays)} روز عقب` : task.deadline : "ندارد"}
                      </div>

                      <div className="mt-4 flex gap-2 border-t border-slate-100 pt-3">
                        <select
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            const value = Number(e.target.value);
                            if (value) moveTaskToSprint(task, value);
                          }}
                          className="flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none"
                          defaultValue=""
                        >
                          <option value="">انتقال به اسپرینت...</option>
                          {projectSprints.map((sprint) => (
                            <option key={sprint.id} value={sprint.id}>
                              {sprint.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })}

                {backlogTasks.length === 0 && (
                  <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-6 text-center text-slate-400">
                    بک‌لاگ خالی است.
                  </div>
                )}
              </div>
            </section>
          )}

          {activeView === "myTasks" && (
            <section className="rounded-3xl border border-white/70 bg-white/80 p-6 shadow-xl shadow-slate-200/60 backdrop-blur">
              <div className="mb-6">
                <h2 className="text-2xl font-black">تسک‌های من</h2>
                <p className="mt-1 text-sm text-slate-500">تسک‌هایی که به شما اختصاص داده شده‌اند.</p>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {projectTasks
                  .filter((task) => task.assigneeId === currentUser.id)
                  .map((task) => {
                    const deadlineDays = daysUntil(task.deadline);

                    return (
                      <div
                        key={task.id}
                        onClick={() => openTask(task)}
                        className="cursor-pointer rounded-3xl border border-slate-200 bg-white p-4 shadow-md transition hover:-translate-y-1 hover:border-blue-300 hover:shadow-xl"
                      >
                        <div className="mb-3 flex items-center justify-between">
                          <span className="text-xs font-black text-blue-600">{task.code}</span>
                          <span className={`rounded-full border px-2 py-1 text-[11px] font-bold ${priorityStyle[task.priority]}`}>
                            {task.priority}
                          </span>
                        </div>

                        <h3 className="font-bold leading-7">{task.title}</h3>

                        {task.description && (
                          <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">
                            {task.description}
                          </p>
                        )}

                        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-400">
                          <span>{task.status}</span>
                          <span>
                            {task.deadline
                              ? deadlineDays !== null && deadlineDays < 0
                                ? `${Math.abs(deadlineDays)} روز عقب`
                                : task.deadline
                              : "بدون ددلاین"}
                          </span>
                        </div>
                      </div>
                    );
                  })}

                {projectTasks.filter((task) => task.assigneeId === currentUser.id).length === 0 && (
                  <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-6 text-center text-slate-400">
                    فعلاً تسکی به شما اختصاص داده نشده.
                  </div>
                )}
              </div>
            </section>
          )}

          {activeView === "reports" && (
            <section className="rounded-3xl border border-white/70 bg-white/80 p-6 shadow-xl shadow-slate-200/60 backdrop-blur">
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-black">گزارش‌ها</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    خروجی بر اساس تاریخ، اسپرینت، کاربر و پروژه.
                  </p>
                </div>

                <button
                  onClick={exportReportCsv}
                  className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-bold text-white hover:bg-black"
                >
                  خروجی CSV
                </button>
              </div>

              <div className="mb-6 grid gap-3 md:grid-cols-5">
                <input
                  type="date"
                  value={reportFromDate}
                  onChange={(e) => setReportFromDate(e.target.value)}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none"
                />

                <input
                  type="date"
                  value={reportToDate}
                  onChange={(e) => setReportToDate(e.target.value)}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none"
                />

                <select
                  value={reportProjectId}
                  onChange={(e) => setReportProjectId(e.target.value)}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none"
                >
                  <option value="all">همه پروژه‌ها</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>

                <select
                  value={reportSprintId}
                  onChange={(e) => setReportSprintId(e.target.value)}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none"
                >
                  <option value="all">همه اسپرینت‌ها</option>
                  <option value="backlog">بک‌لاگ</option>
                  {sprints.map((sprint) => (
                    <option key={sprint.id} value={sprint.id}>
                      {sprint.name}
                    </option>
                  ))}
                </select>

                <select
                  value={reportUserId}
                  onChange={(e) => setReportUserId(e.target.value)}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none"
                >
                  <option value="all">همه کاربران</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-4 md:grid-cols-5">
                <div className="rounded-3xl border border-slate-200 bg-white p-5">
                  <p className="text-sm text-slate-400">کل تسک‌ها</p>
                  <p className="mt-2 text-3xl font-black">{reportTasks.length}</p>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-5">
                  <p className="text-sm text-slate-400">تکمیل‌شده</p>
                  <p className="mt-2 text-3xl font-black text-blue-700">{reportDone}</p>
                </div>

                <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5">
                  <p className="text-sm text-emerald-600">پیشرفت</p>
                  <p className="mt-2 text-3xl font-black text-emerald-700">{reportProgress}%</p>
                </div>

                <div className="rounded-3xl border border-red-200 bg-red-50 p-5">
                  <p className="text-sm text-red-600">عقب‌افتاده</p>
                  <p className="mt-2 text-3xl font-black text-red-700">{reportOverdue}</p>
                </div>

                <div className="rounded-3xl border border-purple-200 bg-purple-50 p-5">
                  <p className="text-sm text-purple-600">ایمپورت‌شده</p>
                  <p className="mt-2 text-3xl font-black text-purple-700">
                    {reportTasks.filter((task) => task.source === "import").length}
                  </p>
                </div>
              </div>

              <div className="mt-6 overflow-x-auto rounded-3xl border border-slate-200 bg-white">
                <table className="w-full min-w-[900px] text-right text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500">
                    <tr>
                      <th className="p-4">کد</th>
                      <th className="p-4">عنوان</th>
                      <th className="p-4">پروژه</th>
                      <th className="p-4">اسپرینت</th>
                      <th className="p-4">کاربر</th>
                      <th className="p-4">وضعیت</th>
                      <th className="p-4">اولویت</th>
                      <th className="p-4">ددلاین</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportTasks.map((task) => {
                      const project = projects.find((item) => item.id === task.projectId);
                      const sprint = sprints.find((item) => item.id === task.sprintId);
                      const assignee = users.find((item) => item.id === task.assigneeId);

                      return (
                        <tr key={task.id} className="border-t border-slate-100">
                          <td className="p-4 font-bold text-blue-600">{task.code}</td>
                          <td className="p-4">{task.title}</td>
                          <td className="p-4">{project?.name || "-"}</td>
                          <td className="p-4">{sprint?.name || "Backlog"}</td>
                          <td className="p-4">{assignee?.name || "بدون مسئول"}</td>
                          <td className="p-4">{task.status}</td>
                          <td className="p-4">{task.priority}</td>
                          <td className="p-4">{task.deadline || "-"}</td>
                        </tr>
                      );
                    })}

                    {reportTasks.length === 0 && (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-slate-400">
                          گزارشی با این فیلترها پیدا نشد.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activeView === "imports" && (
            <section className="rounded-3xl border border-white/70 bg-white/80 p-6 shadow-xl shadow-slate-200/60 backdrop-blur">
              <div className="mb-6">
                <h2 className="text-2xl font-black">ایمپورت فایل</h2>
                <p className="mt-1 text-sm leading-7 text-slate-500">
                  فایل CSV یا JSON خروجی Jira را انتخاب کن. تسک‌ها بر اساس پروژه و اسپرینت ساخته یا به موارد موجود وصل می‌شوند.
                </p>
              </div>

              <div className="mb-6 rounded-3xl border border-dashed border-blue-200 bg-blue-50 p-6">
                <input
                  type="file"
                  accept=".csv,.json"
                  onChange={(e) => parseImportFile(e.target.files)}
                  className="w-full rounded-2xl border border-blue-100 bg-white px-4 py-3"
                />

                <p className="mt-3 text-xs leading-6 text-blue-700">
                  ستون‌های قابل شناسایی: Summary/Title، Description، Project Key، Project Name، Sprint، Status، Assignee، Priority، Due Date، Labels، Issue Type، Story Points.
                </p>
              </div>

              {importPreview.length > 0 && (
                <>
                  <div className="mb-4 flex items-center justify-between">
                    <p className="font-bold">{importPreview.length} تسک آماده ایمپورت است.</p>

                    <button
                      onClick={importTasks}
                      className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-700"
                    >
                      تایید و ایمپورت
                    </button>
                  </div>

                  <div className="max-h-[460px] overflow-auto rounded-3xl border border-slate-200 bg-white">
                    <table className="w-full min-w-[900px] text-right text-sm">
                      <thead className="bg-slate-50 text-xs text-slate-500">
                        <tr>
                          <th className="p-4">عنوان</th>
                          <th className="p-4">پروژه</th>
                          <th className="p-4">اسپرینت</th>
                          <th className="p-4">وضعیت</th>
                          <th className="p-4">مسئول</th>
                          <th className="p-4">اولویت</th>
                          <th className="p-4">ددلاین</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.slice(0, 100).map((row, index) => (
                          <tr key={`${row.title}-${index}`} className="border-t border-slate-100">
                            <td className="p-4 font-bold">{row.title}</td>
                            <td className="p-4">{row.projectName} ({row.projectKey})</td>
                            <td className="p-4">{row.sprintName || "Backlog"}</td>
                            <td className="p-4">{row.status}</td>
                            <td className="p-4">{row.assigneeName || row.assigneeEmail || "-"}</td>
                            <td className="p-4">{row.priority}</td>
                            <td className="p-4">{row.deadline || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-5">
                <h3 className="mb-3 font-black">لاگ ایمپورت</h3>

                <div className="max-h-52 space-y-2 overflow-y-auto text-sm text-slate-600">
                  {importLog.length === 0 && <p className="text-slate-400">هنوز ایمپورتی انجام نشده.</p>}

                  {importLog.map((log, index) => (
                    <div key={index} className="rounded-2xl bg-slate-50 p-3">
                      {log}
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {activeView === "teamSettings" && permissions.canManageTeam && (
            <section className="rounded-3xl border border-white/70 bg-white/80 p-6 shadow-xl shadow-slate-200/60 backdrop-blur">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-black">تنظیمات تیم</h2>
                  <p className="mt-1 text-sm text-slate-500">مدیریت اعضا، نقش‌ها، تخصص‌ها و ظرفیت کاری.</p>
                </div>

                <button
                  onClick={() => setIsUserModalOpen(true)}
                  className="rounded-2xl bg-blue-600 px-5 py-3 font-bold text-white shadow-lg shadow-blue-200"
                >
                  + افزودن عضو
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {users.map((user) => {
                  const userLoad = workloadByUser.find((item) => item.user.id === user.id);

                  return (
                    <div key={user.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="mb-4 flex items-center justify-between">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
                            {user.avatar}
                          </div>

                          <div>
                            <p className="truncate font-bold">{user.name}</p>
                            <p className="truncate text-xs text-slate-400">{user.email}</p>
                          </div>
                        </div>

                        {user.id !== currentUser.id && (
                          <button
                            onClick={() => deleteUser(user.id)}
                            className="shrink-0 rounded-full px-3 py-1 text-xs text-red-500 hover:bg-red-50"
                          >
                            حذف
                          </button>
                        )}
                      </div>

                      <select
                        value={user.role}
                        onChange={(e) => updateUserRole(user, e.target.value as UserRole)}
                        className="mb-3 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                      >
                        <option value="admin">admin</option>
                        <option value="manager">manager</option>
                        <option value="developer">developer</option>
                      </select>

                      <div className="mb-3 rounded-2xl bg-slate-50 p-3 text-sm text-slate-500">
                        شیفت: {user.shift || "full"} · ظرفیت: {userLoad?.load || 0}/{user.capacity || 5}
                      </div>

                      <div className="flex flex-wrap gap-1">
                        {(user.skills || []).map((skill) => (
                          <span key={skill} className="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </main>
      </div>

      {isProjectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <h2 className="mb-5 text-xl font-black">
              {editingProjectId ? "ویرایش پروژه" : "افزودن پروژه"}
            </h2>

            {!permissions.canCreateProject ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">
                شما اجازه ساخت پروژه جدید را ندارید.
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  <input
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="نام پروژه..."
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500"
                  />

                  <input
                    value={projectKey}
                    onChange={(e) => setProjectKey(e.target.value)}
                    placeholder="کد پروژه، مثلا RB"
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500"
                  />
                </div>

                <div className="mt-5 flex gap-3">
                  <button
                    onClick={saveProject}
                    className="rounded-2xl bg-slate-900 px-5 py-3 text-white"
                  >
                    {editingProjectId ? "ذخیره تغییرات" : "ساخت پروژه"}
                  </button>

                  <button
                    onClick={closeProjectModal}
                    className="rounded-2xl bg-slate-100 px-5 py-3"
                  >
                    انصراف
                  </button>
                </div>
              </>
            )}

            {!permissions.canCreateProject && (
              <div className="mt-5 flex gap-3">
                <button
                  onClick={closeProjectModal}
                  className="rounded-2xl bg-slate-100 px-5 py-3"
                >
                  بستن
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {isSprintModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">
            <h2 className="mb-5 text-xl font-black">
              {editingSprintId ? "ویرایش اسپرینت" : "ایجاد اسپرینت"}
            </h2>

            <div className="grid gap-4 md:grid-cols-2">
              <input
                value={sprintName}
                onChange={(e) => setSprintName(e.target.value)}
                placeholder="نام اسپرینت"
                className="rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-500 md:col-span-2"
              />

              <input
                type="date"
                value={sprintStartDate}
                onChange={(e) => setSprintStartDate(e.target.value)}
                className="rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-500"
              />

              <input
                type="date"
                value={sprintEndDate}
                onChange={(e) => setSprintEndDate(e.target.value)}
                className="rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-500"
              />

              <select
                value={sprintStatus}
                onChange={(e) => setSprintStatus(e.target.value as SprintStatus)}
                className="rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-500 md:col-span-2"
              >
                <option value="planned">planned</option>
                <option value="active">active</option>
                <option value="closed">closed</option>
              </select>

              <textarea
                value={sprintGoal}
                onChange={(e) => setSprintGoal(e.target.value)}
                placeholder="هدف اسپرینت"
                rows={4}
                className="rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-500 md:col-span-2"
              />
            </div>

            <div className="mt-5 flex gap-3">
              <button
                onClick={saveSprint}
                className="rounded-2xl bg-indigo-600 px-5 py-3 font-medium text-white"
              >
                ذخیره
              </button>

              <button
                onClick={closeSprintModal}
                className="rounded-2xl bg-slate-100 px-5 py-3"
              >
                انصراف
              </button>
            </div>
          </div>
        </div>
      )}

      {isColumnModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <h2 className="mb-5 text-xl font-black">
              {editingColumnKey ? "ویرایش ستون" : "افزودن ستون"}
            </h2>

            <input
              value={columnTitle}
              onChange={(e) => setColumnTitle(e.target.value)}
              disabled={
                editingColumnKey
                  ? !permissions.canEditColumn
                  : !permissions.canCreateColumn
              }
              placeholder="عنوان ستون..."
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-green-500 disabled:bg-slate-100 disabled:text-slate-400"
            />

            <div className="mt-5 flex gap-3">
              {(editingColumnKey
                ? permissions.canEditColumn
                : permissions.canCreateColumn) && (
                <button
                  onClick={saveColumn}
                  className="rounded-2xl bg-green-600 px-5 py-3 font-medium text-white"
                >
                  ذخیره
                </button>
              )}

              <button
                onClick={() => setIsColumnModalOpen(false)}
                className="rounded-2xl bg-slate-100 px-5 py-3"
              >
                انصراف
              </button>
            </div>
          </div>
        </div>
      )}

      {isUserModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <h2 className="mb-5 text-xl font-black">افزودن عضو تیم</h2>

            <div className="space-y-4">
              <input
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                placeholder="نام کامل..."
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500"
              />

              <input
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                placeholder="ایمیل..."
                type="email"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500"
              />

              <select
                value={newUserRole}
                onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500"
              >
                <option value="admin">Admin</option>
                <option value="manager">Manager</option>
                <option value="developer">Developer</option>
              </select>

              <input
                value={newUserSkills}
                onChange={(e) => setNewUserSkills(e.target.value)}
                placeholder="تخصص‌ها با کاما: frontend, ui, bug"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500"
              />

              <div className="grid grid-cols-2 gap-3">
                <select
                  value={newUserShift}
                  onChange={(e) => setNewUserShift(e.target.value as Shift)}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500"
                >
                  <option value="morning">Morning</option>
                  <option value="evening">Evening</option>
                  <option value="night">Night</option>
                  <option value="full">Full</option>
                </select>

                <input
                  value={newUserCapacity}
                  onChange={(e) => setNewUserCapacity(Number(e.target.value))}
                  type="number"
                  min={1}
                  max={20}
                  placeholder="ظرفیت"
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="mt-5 flex gap-3">
              <button
                onClick={addUser}
                className="rounded-2xl bg-blue-600 px-5 py-3 font-medium text-white"
              >
                افزودن عضو
              </button>

              <button
                onClick={() => setIsUserModalOpen(false)}
                className="rounded-2xl bg-slate-100 px-5 py-3"
              >
                انصراف
              </button>
            </div>
          </div>
        </div>
      )}

      {isTaskModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-2xl font-black">
                {selectedTask ? `جزئیات تسک ${selectedTask.code}` : "افزودن تسک"}
              </h2>

              <button
                onClick={() => setIsTaskModalOpen(false)}
                className="rounded-full bg-slate-100 px-3 py-2 text-slate-500 hover:text-red-500"
              >
                ✕
              </button>
            </div>

            {selectedTask && (
              <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm">
                لینک تسک:{" "}
                <span className="font-mono text-blue-600">/tasks/{selectedTask.code}</span>
              </div>
            )}

            {!taskModalCanEdit && (
              <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">
                شما فقط اجازه مشاهده این تسک را دارید.
              </div>
            )}

            <div className="grid gap-5 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium">عنوان تسک</label>
                <input
                  value={taskTitle}
                  disabled={!taskModalCanEdit}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-400"
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium">توضیحات</label>
                <textarea
                  value={taskDescription}
                  disabled={!taskModalCanEdit}
                  onChange={(e) => setTaskDescription(e.target.value)}
                  rows={5}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-400"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">نوع تسک</label>
                <select
                  value={taskType}
                  disabled={!taskModalCanEdit}
                  onChange={(e) => setTaskType(e.target.value as TaskType)}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <option value="bug">Bug</option>
                  <option value="feature">Feature</option>
                  <option value="ui">UI</option>
                  <option value="api">API</option>
                  <option value="deploy">Deploy</option>
                  <option value="test">Test</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">نوع خطا / تخصص</label>
                <select
                  value={errorType}
                  disabled={!taskModalCanEdit}
                  onChange={(e) => setErrorType(e.target.value as ErrorType)}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <option value="frontend">Frontend</option>
                  <option value="backend">Backend</option>
                  <option value="database">Database</option>
                  <option value="network">Network</option>
                  <option value="security">Security</option>
                  <option value="devops">DevOps</option>
                  <option value="unknown">Unknown</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">حجم کار</label>
                <select
                  value={taskEstimate}
                  disabled={!taskModalCanEdit}
                  onChange={(e) => setTaskEstimate(e.target.value as Estimate)}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <option value="small">Small</option>
                  <option value="medium">Medium</option>
                  <option value="large">Large</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">شیفت موردنیاز</label>
                <select
                  value={shiftNeed}
                  disabled={!taskModalCanEdit}
                  onChange={(e) => setShiftNeed(e.target.value as ShiftNeed)}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <option value="any">Any</option>
                  <option value="morning">Morning</option>
                  <option value="evening">Evening</option>
                  <option value="night">Night</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">لیبل‌ها</label>
                <input
                  value={taskLabels}
                  disabled={!taskModalCanEdit}
                  onChange={(e) => setTaskLabels(e.target.value)}
                  placeholder="مثلا: اپ, فرانت, فوری"
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 disabled:bg-slate-100 disabled:text-slate-400"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">مسئول</label>
                <select
                  value={taskAssigneeId ?? ""}
                  disabled={!taskModalCanEdit}
                  onChange={(e) =>
                    setTaskAssigneeId(e.target.value ? Number(e.target.value) : null)
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <option value="">اساین خودکار هوشمند</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} - {user.role}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">ددلاین</label>
                <input
                  type="date"
                  value={taskDeadline}
                  disabled={!taskModalCanEdit}
                  onChange={(e) => setTaskDeadline(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 disabled:bg-slate-100 disabled:text-slate-400"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">اهمیت</label>
                <select
                  value={taskPriority}
                  disabled={!taskModalCanEdit}
                  onChange={(e) => setTaskPriority(e.target.value as Priority)}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">اسپرینت</label>
                <select
                  value={taskSprintId || ""}
                  disabled={!taskModalCanEdit}
                  onChange={(e) => setTaskSprintId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <option value="">بک‌لاگ / بدون اسپرینت</option>
                  {projectSprints.map((sprint) => (
                    <option key={sprint.id} value={sprint.id}>
                      {sprint.name}
                    </option>
                  ))}
                </select>
              </div>

              {!selectedTask && (
                <div>
                  <label className="mb-2 block text-sm font-medium">ستون شروع</label>
                  <select
                    value={taskDefaultStatus || columns[0]?.key || "todo"}
                    disabled={!taskModalCanEdit}
                    onChange={(e) => setTaskDefaultStatus(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    {columns.map((column) => (
                      <option key={column.key} value={column.key}>
                        {column.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {selectedTask?.autoAssigned && selectedTask.assignmentReason && (
              <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                🤖 {selectedTask.assignmentReason}
              </div>
            )}

            {taskModalCanEdit && (
              <button
                onClick={saveTask}
                className="my-8 rounded-2xl bg-blue-600 px-6 py-3 font-medium text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700"
              >
                ذخیره
              </button>
            )}

            {selectedTask && currentSelectedTask && (
              <>
                <div className="mb-8 rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <h3 className="mb-4 text-xl font-black">فایل‌ها</h3>

                  {taskModalCanEdit && (
                    <input
                      type="file"
                      multiple
                      accept="image/*,video/*"
                      onChange={(e) => addAttachment(e.target.files)}
                      className="mb-4 block w-full rounded-2xl border border-slate-200 bg-white p-3"
                    />
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    {currentSelectedTask.attachments.map((file) => (
                      <div
                        key={file.id}
                        className="rounded-2xl border border-slate-200 bg-white p-3"
                      >
                        {file.type.startsWith("image/") && (
                          <img
                            src={file.url}
                            alt={file.name}
                            className="h-40 w-full rounded-xl object-cover"
                          />
                        )}

                        {file.type.startsWith("video/") && (
                          <video
                            src={file.url}
                            controls
                            className="h-40 w-full rounded-xl object-cover"
                          />
                        )}

                        <p className="mt-2 truncate text-xs text-slate-500">{file.name}</p>
                      </div>
                    ))}

                    {currentSelectedTask.attachments.length === 0 && (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-400">
                        فایلی اضافه نشده.
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <h3 className="mb-4 text-xl font-black">کامنت‌ها</h3>

                  <div className="space-y-3">
                    {currentSelectedTask.comments.map((comment) => (
                      <div key={comment.id} className="rounded-2xl bg-white p-4 shadow-sm">
                        <div className="mb-1 text-xs font-bold text-slate-400">
                          {comment.author}
                        </div>
                        {comment.text}
                      </div>
                    ))}

                    {currentSelectedTask.comments.length === 0 && (
                      <div className="rounded-2xl bg-white p-4 text-sm text-slate-400">
                        هنوز کامنتی ثبت نشده.
                      </div>
                    )}
                  </div>

                  {taskModalCanEdit && (
                    <div className="mt-5 flex gap-3">
                      <input
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        placeholder="کامنت جدید... برای منشن از @Anahita استفاده کن"
                        className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-blue-500"
                      />

                      <button
                        onClick={addComment}
                        className="rounded-2xl bg-slate-900 px-5 py-3 text-white transition hover:bg-black"
                      >
                        ارسال
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
