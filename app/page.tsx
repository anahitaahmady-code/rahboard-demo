"use client";

import { useEffect, useState } from "react";
import { db } from "./firebase";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore";

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

type User = {
  id: number;
  name: string;
  role: UserRole;
  avatar: string;
};

type Priority = "low" | "medium" | "high" | "urgent";

type Project = {
  id: number;
  name: string;
  key: string;
  createdAt?: number;
};

type Task = {
  id: number;
  projectId: number;
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

export default function Home() {
  const users: User[] = [
    { id: 1, name: "Anahita", role: "admin", avatar: "A" },
    { id: 2, name: "Ali", role: "manager", avatar: "AL" },
    { id: 3, name: "Sara", role: "developer", avatar: "S" },
    { id: 4, name: "Reza", role: "developer", avatar: "R" },
  ];

  const [currentUserId, setCurrentUserId] = useState<number>(1);

  const currentUser = users.find((user) => user.id === currentUserId) || users[0];
  const permissions = rolePermissions[currentUser.role];

  const [projects, setProjects] = useState<Project[]>([
    { id: 1, name: "RahBoard Main", key: "RB", createdAt: 1 },
  ]);

  const [activeProjectId, setActiveProjectId] = useState(1);
  const [projectSearch, setProjectSearch] = useState("");
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectKey, setProjectKey] = useState("");

  const [columns, setColumns] = useState<Column[]>([
    { key: "todo", label: "To Do", order: 0 },
    { key: "inprogress", label: "In Progress", order: 1 },
    { key: "readyfortest", label: "Ready For Test", order: 2 },
    { key: "waitdeploy", label: "Waiting Deploy", order: 3 },
    { key: "done", label: "Done", order: 4 },
  ]);

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
  const [commentText, setCommentText] = useState("");

  const [isColumnModalOpen, setIsColumnModalOpen] = useState(false);
  const [columnTitle, setColumnTitle] = useState("");
  const [editingColumnKey, setEditingColumnKey] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [filterAssignee, setFilterAssignee] = useState("all");
  const [filterLabel, setFilterLabel] = useState("all");

  const [activityLogs, setActivityLogs] = useState<string[]>([]);
  const [notifications, setNotifications] = useState<string[]>([]);

  const activeProject = projects.find((project) => project.id === activeProjectId);

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
    const q = query(collection(db, "tasks"), orderBy("id", "asc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const firebaseTasks = snapshot.docs.map((docItem) => docItem.data() as Task);
      setTasks(firebaseTasks);
    });

    return () => unsubscribe();
  }, []);

  const addProject = async () => {
    if (!permissions.canCreateProject) {
      showNoAccess();
      return;
    }

    if (!projectName.trim() || !projectKey.trim()) return;

    const newProject: Project = {
      id: Date.now(),
      name: projectName,
      key: projectKey.toUpperCase(),
      createdAt: Date.now(),
    };

    setIsProjectModalOpen(false);
    setProjectName("");
    setProjectKey("");

    try {
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

    const projectTasks = tasks.filter((task) => task.projectId === projectId);

    await Promise.all([
      deleteDoc(doc(db, "projects", String(projectId))),
      ...projectTasks.map((task) => deleteDoc(doc(db, "tasks", String(task.id)))),
    ]);

    const remainingProjects = projects.filter((project) => project.id !== projectId);

    if (activeProjectId === projectId && remainingProjects.length > 0) {
      setActiveProjectId(remainingProjects[0].id);
    }

    addLog("یک پروژه حذف شد");
    notify("پروژه حذف شد");
  };

  const openNewTaskModal = () => {
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
    const assigneeId = taskAssigneeId;
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
          title,
          description,
          status: columns[0]?.key || "todo",
          comments: [],
          attachments: [],
          labels,
          assigneeId,
          deadline,
          priority,
          createdBy: currentUser.id,
        };

        await setDoc(doc(db, "tasks", String(newTask.id)), newTask);

        addLog(`تسک ${newTask.code} ساخته شد`);
        notify("تسک جدید ساخته شد");
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
      };

      await setDoc(doc(db, "tasks", String(updatedTask.id)), updatedTask);

      addLog(`تسک ${updatedTask.code} جابه‌جا شد`);
      setDraggedTask(null);
    }
  };

  const allLabels = Array.from(
    new Set(
      tasks
        .filter((task) => task.projectId === activeProjectId)
        .flatMap((task) => task.labels)
    )
  );

  const filteredProjects = projects.filter(
    (project) =>
      project.name.toLowerCase().includes(projectSearch.toLowerCase()) ||
      project.key.toLowerCase().includes(projectSearch.toLowerCase())
  );

  const filteredTasks = tasks.filter((task) => {
    const matchesProject = task.projectId === activeProjectId;

    const matchesSearch =
      task.title.toLowerCase().includes(search.toLowerCase()) ||
      task.description.toLowerCase().includes(search.toLowerCase()) ||
      task.code.toLowerCase().includes(search.toLowerCase());

    const matchesAssignee =
      filterAssignee === "all" || String(task.assigneeId) === filterAssignee;

    const matchesLabel = filterLabel === "all" || task.labels.includes(filterLabel);

    return matchesProject && matchesSearch && matchesAssignee && matchesLabel;
  });

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
                  onClick={() => setIsProjectModalOpen(true)}
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
            <button className="w-full rounded-2xl bg-blue-50 px-4 py-3 text-right font-semibold text-blue-700">
              بورد پروژه
            </button>
            <button className="w-full rounded-2xl px-4 py-3 text-right text-slate-600 hover:bg-slate-100">
              تسک‌های من
            </button>
            <button className="w-full rounded-2xl px-4 py-3 text-right text-slate-600 hover:bg-slate-100">
              گزارش‌ها
            </button>
            {permissions.canManageTeam && (
              <button className="w-full rounded-2xl px-4 py-3 text-right text-slate-600 hover:bg-slate-100">
                تنظیمات تیم
              </button>
            )}
          </nav>

          {permissions.canManageTeam && (
            <div className="mt-10 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="mb-3 text-sm font-bold">اعضای تیم</p>

              <div className="space-y-3">
                {users.map((user) => (
                  <div key={user.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                        {user.avatar}
                      </div>

                      <div>
                        <p className="text-sm font-medium">{user.name}</p>
                        <p className="text-[11px] text-slate-400">{user.role}</p>
                      </div>
                    </div>
                  </div>
                ))}
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
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                    {currentUser.role}
                  </span>
                </div>

                <h1 className="text-3xl font-black tracking-tight">RahBoard</h1>
                <p className="mt-1 text-sm text-slate-500">
                  مدیریت پروژه و تسک‌های تیم EFEX
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-2">
                  <p className="mb-1 text-[11px] font-bold text-slate-400">کاربر فعلی</p>

                  <select
                    value={currentUserId}
                    onChange={(e) => setCurrentUserId(Number(e.target.value))}
                    className="bg-transparent text-sm font-bold outline-none"
                  >
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name} - {user.role}
                      </option>
                    ))}
                  </select>
                </div>

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

                {permissions.canCreateProject && (
                  <button
                    onClick={() => setIsProjectModalOpen(true)}
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
                  <button
                    onClick={openNewTaskModal}
                    className="rounded-2xl bg-blue-600 px-5 py-3 font-medium text-white shadow-lg shadow-blue-200 transition hover:-translate-y-0.5 hover:bg-blue-700"
                  >
                    افزودن تسک
                  </button>
                )}

                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white shadow-lg">
                  {currentUser.avatar}
                </div>
              </div>
            </div>
          </header>

          <section className="mb-6 rounded-3xl border border-white/70 bg-white/70 p-4 shadow-lg shadow-slate-200/60 backdrop-blur">
            <div className="flex flex-wrap gap-3">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="جستجوی تسک، توضیحات یا شماره..."
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
                  className="min-h-[560px] w-[315px] rounded-3xl border border-slate-200 bg-white/75 p-4 shadow-xl shadow-slate-200/60 backdrop-blur"
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
                        {permissions.canDragColumns ? "Drag column" : "View only"}
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

                  <div className="space-y-3">
                    {filteredTasks
                      .filter((task) => task.status === column.key)
                      .map((task) => {
                        const assignee = users.find((user) => user.id === task.assigneeId);
                        const creator = users.find((user) => user.id === task.createdBy);

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
                                {task.deadline ? `⏰ ${task.deadline}` : "بدون ددلاین"}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                  </div>
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
        </main>
      </div>

      {isProjectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <h2 className="mb-5 text-xl font-black">افزودن پروژه</h2>

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
                    onClick={addProject}
                    className="rounded-2xl bg-slate-900 px-5 py-3 text-white"
                  >
                    ساخت پروژه
                  </button>

                  <button
                    onClick={() => setIsProjectModalOpen(false)}
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
                  onClick={() => setIsProjectModalOpen(false)}
                  className="rounded-2xl bg-slate-100 px-5 py-3"
                >
                  بستن
                </button>
              </div>
            )}
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
                  <option value="">بدون مسئول</option>
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
            </div>

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