"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore";
import { db } from "./firebase";

type BasicUser = {
  id: number;
  name: string;
  email?: string;
  avatar?: string;
  role?: string;
};

type BasicProject = {
  id: number;
  name: string;
  key?: string;
};

type OKRLevel = "company" | "team" | "personal";
type OKRStatus = "on_track" | "at_risk" | "behind" | "closed";
type ReviewStatus = "draft" | "submitted" | "approved";

type Objective = {
  id: number;
  title: string;
  description: string;
  level: OKRLevel;
  status: OKRStatus;
  ownerId: number | null;
  projectId: number | null;
  period: string;
  progress: number;
  createdAt: number;
};

type KeyResult = {
  id: number;
  objectiveId: number;
  title: string;
  startValue: number;
  currentValue: number;
  targetValue: number;
  unit: string;
  weight: number;
  progress: number;
  createdAt: number;
};

type KPI = {
  id: number;
  title: string;
  ownerId: number | null;
  projectId: number | null;
  currentValue: number;
  targetValue: number;
  unit: string;
  status: OKRStatus;
  createdAt: number;
};

type PerformanceReview = {
  id: number;
  userId: number | null;
  managerId: number | null;
  period: string;
  score: number;
  status: ReviewStatus;
  strengths: string;
  improvements: string;
  note: string;
  createdAt: number;
};

type OKRPerformancePageProps = {
  users: BasicUser[];
  projects: BasicProject[];
  currentUser: BasicUser;
};

const clamp = (value: number) => Math.max(0, Math.min(100, value));

const calculateProgress = (
  startValue: number,
  currentValue: number,
  targetValue: number
) => {
  if (targetValue === startValue) return currentValue >= targetValue ? 100 : 0;
  return clamp(Math.round(((currentValue - startValue) / (targetValue - startValue)) * 100));
};

const statusLabel: Record<OKRStatus, string> = {
  on_track: "در مسیر",
  at_risk: "نیاز به توجه",
  behind: "عقب‌مانده",
  closed: "بسته‌شده",
};

const levelLabel: Record<OKRLevel, string> = {
  company: "شرکتی",
  team: "تیمی",
  personal: "فردی",
};

const reviewStatusLabel: Record<ReviewStatus, string> = {
  draft: "پیش‌نویس",
  submitted: "ارسال‌شده",
  approved: "تأییدشده",
};

const statusStyle: Record<OKRStatus, string> = {
  on_track: "border-emerald-200 bg-emerald-50 text-emerald-700",
  at_risk: "border-amber-200 bg-amber-50 text-amber-700",
  behind: "border-red-200 bg-red-50 text-red-700",
  closed: "border-slate-200 bg-slate-100 text-slate-600",
};

const reviewStatusStyle: Record<ReviewStatus, string> = {
  draft: "border-slate-200 bg-slate-50 text-slate-600",
  submitted: "border-blue-200 bg-blue-50 text-blue-700",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

export default function OKRPerformancePage({
  users,
  projects,
  currentUser,
}: OKRPerformancePageProps) {
  const [activeTab, setActiveTab] = useState<
    "dashboard" | "objectives" | "kpis" | "reviews"
  >("dashboard");

  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [keyResults, setKeyResults] = useState<KeyResult[]>([]);
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [reviews, setReviews] = useState<PerformanceReview[]>([]);

  const [search, setSearch] = useState("");
  const [filterLevel, setFilterLevel] = useState<"all" | OKRLevel>("all");
  const [filterStatus, setFilterStatus] = useState<"all" | OKRStatus>("all");
  const [filterPeriod, setFilterPeriod] = useState("all");

  const [isObjectiveModalOpen, setIsObjectiveModalOpen] = useState(false);
  const [editingObjectiveId, setEditingObjectiveId] = useState<number | null>(null);
  const [objectiveTitle, setObjectiveTitle] = useState("");
  const [objectiveDescription, setObjectiveDescription] = useState("");
  const [objectiveLevel, setObjectiveLevel] = useState<OKRLevel>("team");
  const [objectiveStatus, setObjectiveStatus] = useState<OKRStatus>("on_track");
  const [objectiveOwnerId, setObjectiveOwnerId] = useState<number | null>(
    currentUser?.id || null
  );
  const [objectiveProjectId, setObjectiveProjectId] = useState<number | null>(null);
  const [objectivePeriod, setObjectivePeriod] = useState("Q1 2026");

  const [isKeyResultModalOpen, setIsKeyResultModalOpen] = useState(false);
  const [selectedObjectiveId, setSelectedObjectiveId] = useState<number | null>(null);
  const [keyResultTitle, setKeyResultTitle] = useState("");
  const [keyResultStartValue, setKeyResultStartValue] = useState(0);
  const [keyResultCurrentValue, setKeyResultCurrentValue] = useState(0);
  const [keyResultTargetValue, setKeyResultTargetValue] = useState(100);
  const [keyResultUnit, setKeyResultUnit] = useState("%");
  const [keyResultWeight, setKeyResultWeight] = useState(1);

  const [isKpiModalOpen, setIsKpiModalOpen] = useState(false);
  const [kpiTitle, setKpiTitle] = useState("");
  const [kpiOwnerId, setKpiOwnerId] = useState<number | null>(currentUser?.id || null);
  const [kpiProjectId, setKpiProjectId] = useState<number | null>(null);
  const [kpiCurrentValue, setKpiCurrentValue] = useState(0);
  const [kpiTargetValue, setKpiTargetValue] = useState(100);
  const [kpiUnit, setKpiUnit] = useState("%");
  const [kpiStatus, setKpiStatus] = useState<OKRStatus>("on_track");

  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [reviewUserId, setReviewUserId] = useState<number | null>(currentUser?.id || null);
  const [reviewManagerId, setReviewManagerId] = useState<number | null>(
    currentUser?.id || null
  );
  const [reviewPeriod, setReviewPeriod] = useState("Q1 2026");
  const [reviewScore, setReviewScore] = useState(80);
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>("draft");
  const [reviewStrengths, setReviewStrengths] = useState("");
  const [reviewImprovements, setReviewImprovements] = useState("");
  const [reviewNote, setReviewNote] = useState("");

  useEffect(() => {
    const q = query(collection(db, "objectives"), orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map((docItem) => {
        const data = docItem.data() as Objective;
        return {
          ...data,
          id: Number(data.id || docItem.id),
          progress: Number(data.progress || 0),
        };
      });

      setObjectives(items);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, "keyResults"), orderBy("createdAt", "asc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map((docItem) => {
        const data = docItem.data() as KeyResult;
        return {
          ...data,
          id: Number(data.id || docItem.id),
          progress: Number(data.progress || 0),
        };
      });

      setKeyResults(items);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, "kpis"), orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map((docItem) => {
        const data = docItem.data() as KPI;
        return {
          ...data,
          id: Number(data.id || docItem.id),
        };
      });

      setKpis(items);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, "performanceReviews"), orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map((docItem) => {
        const data = docItem.data() as PerformanceReview;
        return {
          ...data,
          id: Number(data.id || docItem.id),
        };
      });

      setReviews(items);
    });

    return () => unsubscribe();
  }, []);

  const periods = useMemo(() => {
    return Array.from(
      new Set([
        ...objectives.map((item) => item.period).filter(Boolean),
        ...reviews.map((item) => item.period).filter(Boolean),
        "Q1 2026",
        "Q2 2026",
        "Q3 2026",
        "Q4 2026",
      ])
    );
  }, [objectives, reviews]);

  const getUser = (id: number | null | undefined) =>
    users.find((user) => user.id === id) || null;

  const getProject = (id: number | null | undefined) =>
    projects.find((project) => project.id === id) || null;

  const getObjectiveKeyResults = (objectiveId: number) =>
    keyResults.filter((item) => item.objectiveId === objectiveId);

  const getObjectiveProgress = (objective: Objective) => {
    const objectiveKeyResults = getObjectiveKeyResults(objective.id);

    if (objectiveKeyResults.length === 0) {
      return objective.progress || 0;
    }

    const totalWeight = objectiveKeyResults.reduce(
      (sum, item) => sum + Number(item.weight || 1),
      0
    );

    if (totalWeight === 0) return 0;

    const weightedProgress = objectiveKeyResults.reduce(
      (sum, item) => sum + Number(item.progress || 0) * Number(item.weight || 1),
      0
    );

    return Math.round(weightedProgress / totalWeight);
  };

  const filteredObjectives = objectives.filter((objective) => {
    const owner = getUser(objective.ownerId);
    const project = getProject(objective.projectId);

    const matchesSearch =
      objective.title.toLowerCase().includes(search.toLowerCase()) ||
      objective.description.toLowerCase().includes(search.toLowerCase()) ||
      owner?.name?.toLowerCase().includes(search.toLowerCase()) ||
      project?.name?.toLowerCase().includes(search.toLowerCase());

    const matchesLevel = filterLevel === "all" || objective.level === filterLevel;
    const matchesStatus = filterStatus === "all" || objective.status === filterStatus;
    const matchesPeriod = filterPeriod === "all" || objective.period === filterPeriod;

    return matchesSearch && matchesLevel && matchesStatus && matchesPeriod;
  });

  const dashboard = useMemo(() => {
    const totalObjectives = objectives.length;
    const totalKeyResults = keyResults.length;
    const totalKpis = kpis.length;
    const totalReviews = reviews.length;

    const progress =
      totalObjectives === 0
        ? 0
        : Math.round(
            objectives.reduce((sum, item) => sum + getObjectiveProgress(item), 0) /
              totalObjectives
          );

    const onTrack = objectives.filter((item) => item.status === "on_track").length;
    const atRisk = objectives.filter((item) => item.status === "at_risk").length;
    const behind = objectives.filter((item) => item.status === "behind").length;
    const closed = objectives.filter((item) => item.status === "closed").length;

    const averageReviewScore =
      totalReviews === 0
        ? 0
        : Math.round(
            reviews.reduce((sum, item) => sum + Number(item.score || 0), 0) /
              totalReviews
          );

    const bestTeamObjective = [...objectives]
      .filter((item) => item.level === "team")
      .sort((a, b) => getObjectiveProgress(b) - getObjectiveProgress(a))[0];

    return {
      totalObjectives,
      totalKeyResults,
      totalKpis,
      totalReviews,
      progress,
      onTrack,
      atRisk,
      behind,
      closed,
      averageReviewScore,
      bestTeamObjective,
    };
  }, [objectives, keyResults, kpis, reviews]);

  const openNewObjectiveModal = () => {
    setEditingObjectiveId(null);
    setObjectiveTitle("");
    setObjectiveDescription("");
    setObjectiveLevel("team");
    setObjectiveStatus("on_track");
    setObjectiveOwnerId(currentUser?.id || null);
    setObjectiveProjectId(null);
    setObjectivePeriod("Q1 2026");
    setIsObjectiveModalOpen(true);
  };

  const openEditObjectiveModal = (objective: Objective) => {
    setEditingObjectiveId(objective.id);
    setObjectiveTitle(objective.title);
    setObjectiveDescription(objective.description || "");
    setObjectiveLevel(objective.level);
    setObjectiveStatus(objective.status);
    setObjectiveOwnerId(objective.ownerId ?? null);
    setObjectiveProjectId(objective.projectId ?? null);
    setObjectivePeriod(objective.period || "Q1 2026");
    setIsObjectiveModalOpen(true);
  };

  const saveObjective = async () => {
    if (!objectiveTitle.trim()) return;

    const id = editingObjectiveId || Date.now();

    const currentObjective = objectives.find((item) => item.id === editingObjectiveId);

    const objective: Objective = {
      id,
      title: objectiveTitle.trim(),
      description: objectiveDescription.trim(),
      level: objectiveLevel,
      status: objectiveStatus,
      ownerId: objectiveOwnerId,
      projectId: objectiveProjectId,
      period: objectivePeriod.trim() || "Q1 2026",
      progress: currentObjective?.progress || 0,
      createdAt: currentObjective?.createdAt || Date.now(),
    };

    await setDoc(doc(db, "objectives", String(id)), objective);

    setIsObjectiveModalOpen(false);
  };

  const deleteObjective = async (objectiveId: number) => {
    if (!confirm("این هدف حذف شود؟ Key Result های مربوط به آن هم حذف می‌شوند.")) {
      return;
    }

    const relatedKeyResults = keyResults.filter(
      (item) => item.objectiveId === objectiveId
    );

    await Promise.all([
      deleteDoc(doc(db, "objectives", String(objectiveId))),
      ...relatedKeyResults.map((item) =>
        deleteDoc(doc(db, "keyResults", String(item.id)))
      ),
    ]);
  };

  const openNewKeyResultModal = (objectiveId: number) => {
    setSelectedObjectiveId(objectiveId);
    setKeyResultTitle("");
    setKeyResultStartValue(0);
    setKeyResultCurrentValue(0);
    setKeyResultTargetValue(100);
    setKeyResultUnit("%");
    setKeyResultWeight(1);
    setIsKeyResultModalOpen(true);
  };

  const saveKeyResult = async () => {
    if (!selectedObjectiveId || !keyResultTitle.trim()) return;

    const id = Date.now();
    const progress = calculateProgress(
      Number(keyResultStartValue),
      Number(keyResultCurrentValue),
      Number(keyResultTargetValue)
    );

    const keyResult: KeyResult = {
      id,
      objectiveId: selectedObjectiveId,
      title: keyResultTitle.trim(),
      startValue: Number(keyResultStartValue),
      currentValue: Number(keyResultCurrentValue),
      targetValue: Number(keyResultTargetValue),
      unit: keyResultUnit.trim() || "%",
      weight: Number(keyResultWeight || 1),
      progress,
      createdAt: Date.now(),
    };

    await setDoc(doc(db, "keyResults", String(id)), keyResult);

    setIsKeyResultModalOpen(false);
  };

  const updateKeyResultValue = async (keyResult: KeyResult, currentValue: number) => {
    const progress = calculateProgress(
      Number(keyResult.startValue),
      Number(currentValue),
      Number(keyResult.targetValue)
    );

    await setDoc(doc(db, "keyResults", String(keyResult.id)), {
      ...keyResult,
      currentValue: Number(currentValue),
      progress,
    });
  };

  const deleteKeyResult = async (id: number) => {
    if (!confirm("این Key Result حذف شود؟")) return;
    await deleteDoc(doc(db, "keyResults", String(id)));
  };

  const openNewKpiModal = () => {
    setKpiTitle("");
    setKpiOwnerId(currentUser?.id || null);
    setKpiProjectId(null);
    setKpiCurrentValue(0);
    setKpiTargetValue(100);
    setKpiUnit("%");
    setKpiStatus("on_track");
    setIsKpiModalOpen(true);
  };

  const saveKpi = async () => {
    if (!kpiTitle.trim()) return;

    const id = Date.now();

    const kpi: KPI = {
      id,
      title: kpiTitle.trim(),
      ownerId: kpiOwnerId,
      projectId: kpiProjectId,
      currentValue: Number(kpiCurrentValue),
      targetValue: Number(kpiTargetValue),
      unit: kpiUnit.trim() || "%",
      status: kpiStatus,
      createdAt: Date.now(),
    };

    await setDoc(doc(db, "kpis", String(id)), kpi);

    setIsKpiModalOpen(false);
  };

  const deleteKpi = async (id: number) => {
    if (!confirm("این KPI حذف شود؟")) return;
    await deleteDoc(doc(db, "kpis", String(id)));
  };

  const openNewReviewModal = () => {
    setReviewUserId(currentUser?.id || null);
    setReviewManagerId(currentUser?.id || null);
    setReviewPeriod("Q1 2026");
    setReviewScore(80);
    setReviewStatus("draft");
    setReviewStrengths("");
    setReviewImprovements("");
    setReviewNote("");
    setIsReviewModalOpen(true);
  };

  const saveReview = async () => {
    if (!reviewUserId) return;

    const id = Date.now();

    const review: PerformanceReview = {
      id,
      userId: reviewUserId,
      managerId: reviewManagerId,
      period: reviewPeriod.trim() || "Q1 2026",
      score: Number(reviewScore),
      status: reviewStatus,
      strengths: reviewStrengths.trim(),
      improvements: reviewImprovements.trim(),
      note: reviewNote.trim(),
      createdAt: Date.now(),
    };

    await setDoc(doc(db, "performanceReviews", String(id)), review);

    setIsReviewModalOpen(false);
  };

  const deleteReview = async (id: number) => {
    if (!confirm("این ارزیابی حذف شود؟")) return;
    await deleteDoc(doc(db, "performanceReviews", String(id)));
  };

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-white/70 bg-white/80 p-6 shadow-xl shadow-slate-200/60 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="mb-3 flex flex-wrap gap-2">
              <span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-black text-purple-700">
                OKR
              </span>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
                Performance
              </span>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
                KPI
              </span>
            </div>

            <h2 className="text-3xl font-black text-slate-900">
              OKR و ارزیابی عملکرد
            </h2>
            <p className="mt-2 text-sm leading-7 text-slate-500">
              مدیریت اهداف، نتایج کلیدی، KPI و ارزیابی عملکرد اعضای تیم
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={openNewObjectiveModal}
              className="rounded-2xl bg-purple-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-purple-200 transition hover:-translate-y-0.5 hover:bg-purple-700"
            >
              + ساخت OKR
            </button>

            <button
              onClick={openNewKpiModal}
              className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-black text-white shadow-lg shadow-slate-200 transition hover:-translate-y-0.5"
            >
              + KPI
            </button>

            <button
              onClick={openNewReviewModal}
              className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50"
            >
              + ارزیابی عملکرد
            </button>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          {[
            ["dashboard", "داشبورد"],
            ["objectives", "اهداف و KR"],
            ["kpis", "KPI"],
            ["reviews", "ارزیابی عملکرد"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key as typeof activeTab)}
              className={`rounded-2xl px-4 py-3 text-sm font-black transition ${
                activeTab === key
                  ? "bg-purple-600 text-white shadow-lg shadow-purple-100"
                  : "bg-slate-50 text-slate-600 hover:bg-slate-100"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "dashboard" && (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-bold text-slate-400">کل OKRها</p>
              <p className="mt-3 text-3xl font-black">{dashboard.totalObjectives}</p>
              <p className="mt-1 text-xs text-slate-400">
                {dashboard.totalKeyResults} نتیجه کلیدی
              </p>
            </div>

            <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
              <p className="text-sm font-bold text-emerald-600">میانگین پیشرفت</p>
              <p className="mt-3 text-3xl font-black text-emerald-700">
                {dashboard.progress}٪
              </p>
              <div className="mt-4 h-2 rounded-full bg-emerald-100">
                <div
                  className="h-2 rounded-full bg-emerald-600"
                  style={{ width: `${dashboard.progress}%` }}
                />
              </div>
            </div>

            <div className="rounded-3xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
              <p className="text-sm font-bold text-blue-600">KPI فعال</p>
              <p className="mt-3 text-3xl font-black text-blue-700">
                {dashboard.totalKpis}
              </p>
              <p className="mt-1 text-xs text-blue-600">شاخص‌های قابل اندازه‌گیری</p>
            </div>

            <div className="rounded-3xl border border-purple-200 bg-purple-50 p-5 shadow-sm">
              <p className="text-sm font-bold text-purple-600">میانگین ارزیابی</p>
              <p className="mt-3 text-3xl font-black text-purple-700">
                {dashboard.averageReviewScore}
              </p>
              <p className="mt-1 text-xs text-purple-600">
                از {dashboard.totalReviews} ارزیابی
              </p>
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-3">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-black">وضعیت OKRها</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    نمای کلی از سلامت اهداف سازمانی، تیمی و فردی
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-xs font-bold text-emerald-600">در مسیر</p>
                  <p className="mt-2 text-3xl font-black text-emerald-700">
                    {dashboard.onTrack}
                  </p>
                </div>

                <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-xs font-bold text-amber-600">نیاز به توجه</p>
                  <p className="mt-2 text-3xl font-black text-amber-700">
                    {dashboard.atRisk}
                  </p>
                </div>

                <div className="rounded-3xl border border-red-200 bg-red-50 p-4">
                  <p className="text-xs font-bold text-red-600">عقب‌مانده</p>
                  <p className="mt-2 text-3xl font-black text-red-700">
                    {dashboard.behind}
                  </p>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-bold text-slate-500">بسته‌شده</p>
                  <p className="mt-2 text-3xl font-black text-slate-700">
                    {dashboard.closed}
                  </p>
                </div>
              </div>

              <div className="mt-6 space-y-3">
                {objectives.slice(0, 5).map((objective) => {
                  const owner = getUser(objective.ownerId);
                  const progress = getObjectiveProgress(objective);

                  return (
                    <div
                      key={objective.id}
                      className="rounded-3xl border border-slate-100 bg-slate-50 p-4"
                    >
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div>
                          <p className="font-black text-slate-800">{objective.title}</p>
                          <p className="mt-1 text-xs text-slate-400">
                            {owner?.name || "بدون مسئول"} · {objective.period}
                          </p>
                        </div>

                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-black ${statusStyle[objective.status]}`}
                        >
                          {statusLabel[objective.status]}
                        </span>
                      </div>

                      <div className="mt-3 flex items-center gap-3">
                        <div className="h-2 flex-1 rounded-full bg-white">
                          <div
                            className="h-2 rounded-full bg-purple-600"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <span className="w-12 text-left text-xs font-black text-slate-500">
                          {progress}٪
                        </span>
                      </div>
                    </div>
                  );
                })}

                {objectives.length === 0 && (
                  <div className="rounded-3xl border border-dashed border-slate-200 p-8 text-center text-slate-400">
                    هنوز OKR ثبت نشده است.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-xl font-black">بینش مدیریتی</h3>

              <div className="mt-4 space-y-3">
                <div className="rounded-3xl border border-purple-100 bg-purple-50 p-4">
                  <p className="text-sm font-black text-purple-700">
                    بهترین هدف تیمی
                  </p>
                  <p className="mt-2 text-sm leading-7 text-purple-600">
                    {dashboard.bestTeamObjective
                      ? `${dashboard.bestTeamObjective.title} با ${getObjectiveProgress(
                          dashboard.bestTeamObjective
                        )}٪ پیشرفت`
                      : "هنوز هدف تیمی ثبت نشده است."}
                  </p>
                </div>

                <div className="rounded-3xl border border-amber-100 bg-amber-50 p-4">
                  <p className="text-sm font-black text-amber-700">
                    هشدارهای قابل بررسی
                  </p>
                  <p className="mt-2 text-sm leading-7 text-amber-600">
                    {dashboard.behind > 0
                      ? `${dashboard.behind} هدف عقب‌مانده وجود دارد و نیازمند اقدام است.`
                      : "فعلاً هدف عقب‌مانده‌ای ثبت نشده است."}
                  </p>
                </div>

                <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-4">
                  <p className="text-sm font-black text-emerald-700">
                    وضعیت عملکرد
                  </p>
                  <p className="mt-2 text-sm leading-7 text-emerald-600">
                    میانگین امتیاز عملکرد تیم {dashboard.averageReviewScore} از ۱۰۰ است.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {activeTab === "objectives" && (
        <div className="rounded-3xl border border-white/70 bg-white/80 p-5 shadow-xl shadow-slate-200/60 backdrop-blur">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-xl font-black">اهداف و نتایج کلیدی</h3>
              <p className="mt-1 text-sm text-slate-500">
                Objectiveها و Key Resultهای قابل اندازه‌گیری
              </p>
            </div>

            <button
              onClick={openNewObjectiveModal}
              className="rounded-2xl bg-purple-600 px-5 py-3 text-sm font-black text-white"
            >
              + هدف جدید
            </button>
          </div>

          <div className="mb-5 grid gap-3 lg:grid-cols-4">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="جستجوی هدف، مسئول یا پروژه..."
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-purple-500"
            />

            <select
              value={filterLevel}
              onChange={(e) => setFilterLevel(e.target.value as "all" | OKRLevel)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none"
            >
              <option value="all">همه سطح‌ها</option>
              <option value="company">شرکتی</option>
              <option value="team">تیمی</option>
              <option value="personal">فردی</option>
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as "all" | OKRStatus)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none"
            >
              <option value="all">همه وضعیت‌ها</option>
              <option value="on_track">در مسیر</option>
              <option value="at_risk">نیاز به توجه</option>
              <option value="behind">عقب‌مانده</option>
              <option value="closed">بسته‌شده</option>
            </select>

            <select
              value={filterPeriod}
              onChange={(e) => setFilterPeriod(e.target.value)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none"
            >
              <option value="all">همه دوره‌ها</option>
              {periods.map((period) => (
                <option key={period} value={period}>
                  {period}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-4">
            {filteredObjectives.map((objective) => {
              const owner = getUser(objective.ownerId);
              const project = getProject(objective.projectId);
              const objectiveKeyResults = getObjectiveKeyResults(objective.id);
              const progress = getObjectiveProgress(objective);

              return (
                <div
                  key={objective.id}
                  className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap gap-2">
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
                          {levelLabel[objective.level]}
                        </span>
                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-black ${statusStyle[objective.status]}`}
                        >
                          {statusLabel[objective.status]}
                        </span>
                        <span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-black text-purple-700">
                          {objective.period}
                        </span>
                      </div>

                      <h4 className="text-lg font-black text-slate-900">
                        {objective.title}
                      </h4>

                      {objective.description && (
                        <p className="mt-2 text-sm leading-7 text-slate-500">
                          {objective.description}
                        </p>
                      )}

                      <p className="mt-3 text-xs text-slate-400">
                        مسئول: {owner?.name || "نامشخص"} · پروژه:{" "}
                        {project?.name || "بدون پروژه"}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => openNewKeyResultModal(objective.id)}
                        className="rounded-2xl bg-purple-50 px-4 py-2 text-xs font-black text-purple-700 hover:bg-purple-100"
                      >
                        + KR
                      </button>

                      <button
                        onClick={() => openEditObjectiveModal(objective)}
                        className="rounded-2xl bg-slate-50 px-4 py-2 text-xs font-black text-slate-600 hover:bg-slate-100"
                      >
                        ویرایش
                      </button>

                      <button
                        onClick={() => deleteObjective(objective.id)}
                        className="rounded-2xl bg-red-50 px-4 py-2 text-xs font-black text-red-600 hover:bg-red-100"
                      >
                        حذف
                      </button>
                    </div>
                  </div>

                  <div className="mt-5 flex items-center gap-3">
                    <div className="h-3 flex-1 rounded-full bg-slate-100">
                      <div
                        className="h-3 rounded-full bg-purple-600"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <span className="w-14 text-left text-sm font-black text-slate-600">
                      {progress}٪
                    </span>
                  </div>

                  <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
                    {objectiveKeyResults.map((keyResult) => (
                      <div
                        key={keyResult.id}
                        className="rounded-2xl border border-slate-100 bg-slate-50 p-4"
                      >
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-black text-slate-800">
                              {keyResult.title}
                            </p>
                            <p className="mt-1 text-xs text-slate-400">
                              شروع: {keyResult.startValue} {keyResult.unit} · هدف:{" "}
                              {keyResult.targetValue} {keyResult.unit} · وزن:{" "}
                              {keyResult.weight}
                            </p>
                          </div>

                          <button
                            onClick={() => deleteKeyResult(keyResult.id)}
                            className="rounded-xl bg-white px-3 py-2 text-xs font-black text-red-500 hover:bg-red-50"
                          >
                            حذف
                          </button>
                        </div>

                        <div className="grid gap-3 md:grid-cols-[1fr_160px_60px] md:items-center">
                          <div className="h-2 rounded-full bg-white">
                            <div
                              className="h-2 rounded-full bg-slate-900"
                              style={{ width: `${keyResult.progress}%` }}
                            />
                          </div>

                          <input
                            value={keyResult.currentValue}
                            onChange={(e) =>
                              updateKeyResultValue(
                                keyResult,
                                Number(e.target.value || 0)
                              )
                            }
                            type="number"
                            className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-purple-500"
                          />

                          <span className="text-left text-sm font-black text-slate-600">
                            {keyResult.progress}٪
                          </span>
                        </div>
                      </div>
                    ))}

                    {objectiveKeyResults.length === 0 && (
                      <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-400">
                        هنوز Key Result برای این هدف ثبت نشده است.
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {filteredObjectives.length === 0 && (
              <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-8 text-center text-slate-400">
                هدفی با فیلترهای انتخاب‌شده پیدا نشد.
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "kpis" && (
        <div className="rounded-3xl border border-white/70 bg-white/80 p-5 shadow-xl shadow-slate-200/60 backdrop-blur">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-xl font-black">KPIها</h3>
              <p className="mt-1 text-sm text-slate-500">
                شاخص‌های کلیدی عملکرد تیم و پروژه‌ها
              </p>
            </div>

            <button
              onClick={openNewKpiModal}
              className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-black text-white"
            >
              + KPI جدید
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {kpis.map((kpi) => {
              const owner = getUser(kpi.ownerId);
              const project = getProject(kpi.projectId);
              const progress = calculateProgress(0, kpi.currentValue, kpi.targetValue);

              return (
                <div
                  key={kpi.id}
                  className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-black ${statusStyle[kpi.status]}`}
                      >
                        {statusLabel[kpi.status]}
                      </span>
                      <h4 className="mt-3 font-black text-slate-900">{kpi.title}</h4>
                    </div>

                    <button
                      onClick={() => deleteKpi(kpi.id)}
                      className="rounded-xl bg-red-50 px-3 py-2 text-xs font-black text-red-500"
                    >
                      حذف
                    </button>
                  </div>

                  <p className="text-xs leading-6 text-slate-400">
                    مسئول: {owner?.name || "نامشخص"} · پروژه:{" "}
                    {project?.name || "بدون پروژه"}
                  </p>

                  <div className="mt-5">
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="font-black text-slate-700">
                        {kpi.currentValue} / {kpi.targetValue} {kpi.unit}
                      </span>
                      <span className="font-black text-purple-700">{progress}٪</span>
                    </div>

                    <div className="h-3 rounded-full bg-slate-100">
                      <div
                        className="h-3 rounded-full bg-purple-600"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}

            {kpis.length === 0 && (
              <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-8 text-center text-slate-400">
                هنوز KPI ثبت نشده است.
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "reviews" && (
        <div className="rounded-3xl border border-white/70 bg-white/80 p-5 shadow-xl shadow-slate-200/60 backdrop-blur">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-xl font-black">ارزیابی عملکرد</h3>
              <p className="mt-1 text-sm text-slate-500">
                ثبت و مرور ارزیابی عملکرد اعضای تیم در دوره‌های مختلف
              </p>
            </div>

            <button
              onClick={openNewReviewModal}
              className="rounded-2xl bg-purple-600 px-5 py-3 text-sm font-black text-white"
            >
              + ارزیابی جدید
            </button>
          </div>

          <div className="space-y-4">
            {reviews.map((review) => {
              const user = getUser(review.userId);
              const manager = getUser(review.managerId);

              return (
                <div
                  key={review.id}
                  className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="mb-2 flex flex-wrap gap-2">
                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-black ${reviewStatusStyle[review.status]}`}
                        >
                          {reviewStatusLabel[review.status]}
                        </span>
                        <span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-black text-purple-700">
                          {review.period}
                        </span>
                      </div>

                      <h4 className="text-lg font-black text-slate-900">
                        {user?.name || "کاربر نامشخص"}
                      </h4>

                      <p className="mt-1 text-xs text-slate-400">
                        مدیر ارزیاب: {manager?.name || "نامشخص"}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="rounded-3xl bg-slate-900 px-5 py-4 text-center text-white">
                        <p className="text-xs text-slate-300">امتیاز</p>
                        <p className="text-2xl font-black">{review.score}</p>
                      </div>

                      <button
                        onClick={() => deleteReview(review.id)}
                        className="rounded-2xl bg-red-50 px-4 py-3 text-xs font-black text-red-600"
                      >
                        حذف
                      </button>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-3">
                    <div className="rounded-2xl bg-emerald-50 p-4">
                      <p className="mb-2 text-sm font-black text-emerald-700">
                        نقاط قوت
                      </p>
                      <p className="text-sm leading-7 text-emerald-600">
                        {review.strengths || "ثبت نشده"}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-amber-50 p-4">
                      <p className="mb-2 text-sm font-black text-amber-700">
                        قابل بهبود
                      </p>
                      <p className="text-sm leading-7 text-amber-600">
                        {review.improvements || "ثبت نشده"}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="mb-2 text-sm font-black text-slate-700">
                        توضیحات
                      </p>
                      <p className="text-sm leading-7 text-slate-500">
                        {review.note || "ثبت نشده"}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}

            {reviews.length === 0 && (
              <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-8 text-center text-slate-400">
                هنوز ارزیابی عملکرد ثبت نشده است.
              </div>
            )}
          </div>
        </div>
      )}

      {isObjectiveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-black">
                  {editingObjectiveId ? "ویرایش هدف" : "ساخت OKR جدید"}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  هدف را تعریف کن و بعد برایش Key Result بساز.
                </p>
              </div>

              <button
                onClick={() => setIsObjectiveModalOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <input
                value={objectiveTitle}
                onChange={(e) => setObjectiveTitle(e.target.value)}
                placeholder="عنوان هدف؛ مثلاً افزایش رضایت کاربران داخلی"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-purple-500"
              />

              <textarea
                value={objectiveDescription}
                onChange={(e) => setObjectiveDescription(e.target.value)}
                placeholder="توضیح هدف..."
                className="min-h-28 w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 leading-7 outline-none focus:border-purple-500"
              />

              <div className="grid gap-3 md:grid-cols-2">
                <select
                  value={objectiveLevel}
                  onChange={(e) => setObjectiveLevel(e.target.value as OKRLevel)}
                  className="rounded-2xl border border-slate-200 px-4 py-3 outline-none"
                >
                  <option value="company">شرکتی</option>
                  <option value="team">تیمی</option>
                  <option value="personal">فردی</option>
                </select>

                <select
                  value={objectiveStatus}
                  onChange={(e) => setObjectiveStatus(e.target.value as OKRStatus)}
                  className="rounded-2xl border border-slate-200 px-4 py-3 outline-none"
                >
                  <option value="on_track">در مسیر</option>
                  <option value="at_risk">نیاز به توجه</option>
                  <option value="behind">عقب‌مانده</option>
                  <option value="closed">بسته‌شده</option>
                </select>

                <select
                  value={objectiveOwnerId || ""}
                  onChange={(e) =>
                    setObjectiveOwnerId(e.target.value ? Number(e.target.value) : null)
                  }
                  className="rounded-2xl border border-slate-200 px-4 py-3 outline-none"
                >
                  <option value="">انتخاب مسئول</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>

                <select
                  value={objectiveProjectId || ""}
                  onChange={(e) =>
                    setObjectiveProjectId(e.target.value ? Number(e.target.value) : null)
                  }
                  className="rounded-2xl border border-slate-200 px-4 py-3 outline-none"
                >
                  <option value="">بدون پروژه</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>

                <input
                  value={objectivePeriod}
                  onChange={(e) => setObjectivePeriod(e.target.value)}
                  placeholder="دوره؛ مثلاً Q1 2026"
                  className="rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-purple-500 md:col-span-2"
                />
              </div>

              <div className="flex justify-end">
                <button
                  onClick={saveObjective}
                  className="rounded-2xl bg-purple-600 px-8 py-4 text-sm font-black text-white shadow-lg shadow-purple-200"
                >
                  ذخیره هدف
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isKeyResultModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-black">افزودن Key Result</h3>
                <p className="mt-1 text-sm text-slate-500">
                  نتیجه کلیدی باید قابل اندازه‌گیری باشد.
                </p>
              </div>

              <button
                onClick={() => setIsKeyResultModalOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <input
                value={keyResultTitle}
                onChange={(e) => setKeyResultTitle(e.target.value)}
                placeholder="مثلاً کاهش زمان رفع باگ از ۴۸ ساعت به ۲۴ ساعت"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-purple-500"
              />

              <div className="grid gap-3 md:grid-cols-2">
                <input
                  value={keyResultStartValue}
                  onChange={(e) => setKeyResultStartValue(Number(e.target.value || 0))}
                  type="number"
                  placeholder="مقدار شروع"
                  className="rounded-2xl border border-slate-200 px-4 py-3 outline-none"
                />

                <input
                  value={keyResultCurrentValue}
                  onChange={(e) =>
                    setKeyResultCurrentValue(Number(e.target.value || 0))
                  }
                  type="number"
                  placeholder="مقدار فعلی"
                  className="rounded-2xl border border-slate-200 px-4 py-3 outline-none"
                />

                <input
                  value={keyResultTargetValue}
                  onChange={(e) => setKeyResultTargetValue(Number(e.target.value || 0))}
                  type="number"
                  placeholder="مقدار هدف"
                  className="rounded-2xl border border-slate-200 px-4 py-3 outline-none"
                />

                <input
                  value={keyResultUnit}
                  onChange={(e) => setKeyResultUnit(e.target.value)}
                  placeholder="واحد؛ ٪، ساعت، عدد، نفر"
                  className="rounded-2xl border border-slate-200 px-4 py-3 outline-none"
                />

                <input
                  value={keyResultWeight}
                  onChange={(e) => setKeyResultWeight(Number(e.target.value || 1))}
                  type="number"
                  min={1}
                  placeholder="وزن"
                  className="rounded-2xl border border-slate-200 px-4 py-3 outline-none md:col-span-2"
                />
              </div>

              <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
                پیشرفت محاسبه‌شده:{" "}
                <span className="font-black text-purple-700">
                  {calculateProgress(
                    keyResultStartValue,
                    keyResultCurrentValue,
                    keyResultTargetValue
                  )}
                  ٪
                </span>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={saveKeyResult}
                  className="rounded-2xl bg-purple-600 px-8 py-4 text-sm font-black text-white"
                >
                  ذخیره KR
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isKpiModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-black">ساخت KPI</h3>
                <p className="mt-1 text-sm text-slate-500">
                  شاخص کلیدی عملکرد را برای تیم یا پروژه ثبت کن.
                </p>
              </div>

              <button
                onClick={() => setIsKpiModalOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <input
                value={kpiTitle}
                onChange={(e) => setKpiTitle(e.target.value)}
                placeholder="عنوان KPI"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-purple-500"
              />

              <div className="grid gap-3 md:grid-cols-2">
                <select
                  value={kpiOwnerId || ""}
                  onChange={(e) =>
                    setKpiOwnerId(e.target.value ? Number(e.target.value) : null)
                  }
                  className="rounded-2xl border border-slate-200 px-4 py-3 outline-none"
                >
                  <option value="">انتخاب مسئول</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>

                <select
                  value={kpiProjectId || ""}
                  onChange={(e) =>
                    setKpiProjectId(e.target.value ? Number(e.target.value) : null)
                  }
                  className="rounded-2xl border border-slate-200 px-4 py-3 outline-none"
                >
                  <option value="">بدون پروژه</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>

                <input
                  value={kpiCurrentValue}
                  onChange={(e) => setKpiCurrentValue(Number(e.target.value || 0))}
                  type="number"
                  placeholder="مقدار فعلی"
                  className="rounded-2xl border border-slate-200 px-4 py-3 outline-none"
                />

                <input
                  value={kpiTargetValue}
                  onChange={(e) => setKpiTargetValue(Number(e.target.value || 0))}
                  type="number"
                  placeholder="مقدار هدف"
                  className="rounded-2xl border border-slate-200 px-4 py-3 outline-none"
                />

                <input
                  value={kpiUnit}
                  onChange={(e) => setKpiUnit(e.target.value)}
                  placeholder="واحد"
                  className="rounded-2xl border border-slate-200 px-4 py-3 outline-none"
                />

                <select
                  value={kpiStatus}
                  onChange={(e) => setKpiStatus(e.target.value as OKRStatus)}
                  className="rounded-2xl border border-slate-200 px-4 py-3 outline-none"
                >
                  <option value="on_track">در مسیر</option>
                  <option value="at_risk">نیاز به توجه</option>
                  <option value="behind">عقب‌مانده</option>
                  <option value="closed">بسته‌شده</option>
                </select>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={saveKpi}
                  className="rounded-2xl bg-slate-900 px-8 py-4 text-sm font-black text-white"
                >
                  ذخیره KPI
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isReviewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-black">ثبت ارزیابی عملکرد</h3>
                <p className="mt-1 text-sm text-slate-500">
                  ارزیابی دوره‌ای کاربر را ثبت کن.
                </p>
              </div>

              <button
                onClick={() => setIsReviewModalOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <select
                  value={reviewUserId || ""}
                  onChange={(e) =>
                    setReviewUserId(e.target.value ? Number(e.target.value) : null)
                  }
                  className="rounded-2xl border border-slate-200 px-4 py-3 outline-none"
                >
                  <option value="">انتخاب کاربر</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>

                <select
                  value={reviewManagerId || ""}
                  onChange={(e) =>
                    setReviewManagerId(e.target.value ? Number(e.target.value) : null)
                  }
                  className="rounded-2xl border border-slate-200 px-4 py-3 outline-none"
                >
                  <option value="">انتخاب مدیر</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>

                <input
                  value={reviewPeriod}
                  onChange={(e) => setReviewPeriod(e.target.value)}
                  placeholder="دوره؛ مثلاً Q1 2026"
                  className="rounded-2xl border border-slate-200 px-4 py-3 outline-none"
                />

                <input
                  value={reviewScore}
                  onChange={(e) => setReviewScore(Number(e.target.value || 0))}
                  type="number"
                  min={0}
                  max={100}
                  placeholder="امتیاز"
                  className="rounded-2xl border border-slate-200 px-4 py-3 outline-none"
                />

                <select
                  value={reviewStatus}
                  onChange={(e) => setReviewStatus(e.target.value as ReviewStatus)}
                  className="rounded-2xl border border-slate-200 px-4 py-3 outline-none md:col-span-2"
                >
                  <option value="draft">پیش‌نویس</option>
                  <option value="submitted">ارسال‌شده</option>
                  <option value="approved">تأییدشده</option>
                </select>
              </div>

              <textarea
                value={reviewStrengths}
                onChange={(e) => setReviewStrengths(e.target.value)}
                placeholder="نقاط قوت..."
                className="min-h-24 w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 leading-7 outline-none"
              />

              <textarea
                value={reviewImprovements}
                onChange={(e) => setReviewImprovements(e.target.value)}
                placeholder="موارد قابل بهبود..."
                className="min-h-24 w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 leading-7 outline-none"
              />

              <textarea
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                placeholder="توضیحات تکمیلی..."
                className="min-h-24 w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 leading-7 outline-none"
              />

              <div className="flex justify-end">
                <button
                  onClick={saveReview}
                  className="rounded-2xl bg-purple-600 px-8 py-4 text-sm font-black text-white"
                >
                  ذخیره ارزیابی
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}