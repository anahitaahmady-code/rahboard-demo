"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
type Tone = "emerald" | "amber" | "red" | "blue" | "purple" | "slate";
type ActiveOkrTab =
  | "dashboard"
  | "objectives"
  | "teams"
  | "meetings"
  | "okrReports"
  | "kpis"
  | "reviews";

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

type TeamRow = {
  id: string;
  name: string;
  progress: number;
  objectiveCount: number;
  keyResultCount: number;
  kpiCount: number;
  ownerCount: number;
  riskCount: number;
  status: OKRStatus;
};

type MemberRow = {
  id: number;
  name: string;
  role: string;
  objectiveCount: number;
  progress: number;
  reviewScore: number;
  riskCount: number;
};

type AiOkrKeyResultSuggestion = {
  title: string;
  startValue: number;
  targetValue: number;
  unit: string;
  weight: number;
  confidence: number;
};

type AiOkrSuggestion = {
  title: string;
  description: string;
  confidence: number;
  rationale: string;
  keyResults: AiOkrKeyResultSuggestion[];
  risks: string[];
  checkpoints: string[];
};

type MeetingPlan = {
  id: string;
  title: string;
  team: string;
  time: string;
  status: string;
  tone: Tone;
  agenda: string[];
  decisions: string[];
  owners: string[];
};

const numberFormatter = new Intl.NumberFormat("fa-IR");

const clamp = (value: number) => Math.max(0, Math.min(100, value));
const formatNumber = (value: number) => numberFormatter.format(Math.round(value || 0));
const formatPercent = (value: number) => `${formatNumber(clamp(value))}٪`;

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
  at_risk: "نیازمند توجه",
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

const progressFill: Record<Tone, string> = {
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  blue: "bg-blue-500",
  purple: "bg-purple-600",
  slate: "bg-slate-700",
};

const toneText: Record<Tone, string> = {
  emerald: "text-emerald-700",
  amber: "text-amber-700",
  red: "text-red-700",
  blue: "text-blue-700",
  purple: "text-purple-700",
  slate: "text-slate-700",
};

const toneSurface: Record<Tone, string> = {
  emerald: "border-emerald-100 bg-emerald-50",
  amber: "border-amber-100 bg-amber-50",
  red: "border-red-100 bg-red-50",
  blue: "border-blue-100 bg-blue-50",
  purple: "border-purple-100 bg-purple-50",
  slate: "border-slate-100 bg-slate-50",
};

const sparklineValues = [
  [26, 34, 38, 45, 42, 54, 62, 68, 74, 79],
  [52, 48, 57, 61, 58, 63, 70, 67, 73, 78],
  [34, 39, 35, 48, 56, 53, 61, 64, 72, 75],
  [70, 66, 62, 59, 55, 52, 49, 45, 41, 38],
];

function ProgressBar({ value, tone = "purple" }: { value: number; tone?: Tone }) {
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
      <div
        className={`h-full rounded-full ${progressFill[tone]}`}
        style={{ width: `${clamp(value)}%` }}
      />
    </div>
  );
}

function Sparkline({ values, tone }: { values: number[]; tone: Tone }) {
  return (
    <div className="flex h-10 items-end gap-1" aria-hidden="true">
      {values.map((value, index) => (
        <span
          key={`${value}-${index}`}
          className={`w-full rounded-t-full ${progressFill[tone]} opacity-80`}
          style={{ height: `${Math.max(20, value)}%` }}
        />
      ))}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm font-bold text-slate-400">
      {text}
    </div>
  );
}

export default function OKRPerformancePage({
  users,
  projects,
  currentUser,
}: OKRPerformancePageProps) {
  const [activeTab, setActiveTab] = useState<ActiveOkrTab>("dashboard");

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

  const [isAiOkrModalOpen, setIsAiOkrModalOpen] = useState(false);
  const [aiOkrStep, setAiOkrStep] = useState<1 | 2>(1);
  const [aiOkrTitle, setAiOkrTitle] = useState("");
  const [aiOkrContext, setAiOkrContext] = useState("");
  const [aiOkrProjectId, setAiOkrProjectId] = useState<number | null>(null);
  const [aiOkrOwnerId, setAiOkrOwnerId] = useState<number | null>(currentUser?.id || null);
  const [aiOkrLevel, setAiOkrLevel] = useState<OKRLevel>("team");
  const [aiOkrPeriod, setAiOkrPeriod] = useState("Q1 2026");
  const [aiOkrSuggestion, setAiOkrSuggestion] = useState<AiOkrSuggestion | null>(null);
  const [aiOkrSelectedKr, setAiOkrSelectedKr] = useState<number[]>([]);
  const [aiOkrLoading, setAiOkrLoading] = useState(false);
  const [aiOkrError, setAiOkrError] = useState("");
  const [aiOkrSource, setAiOkrSource] = useState<"openai" | "fallback" | "">("");

  const [selectedObjectiveDetailId, setSelectedObjectiveDetailId] = useState<number | null>(
    null
  );
  const [selectedKeyResultDetailId, setSelectedKeyResultDetailId] = useState<number | null>(
    null
  );
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);

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

  const getUser = useCallback(
    (id: number | null | undefined) => users.find((user) => user.id === id) || null,
    [users]
  );

  const getProject = useCallback(
    (id: number | null | undefined) =>
      projects.find((project) => project.id === id) || null,
    [projects]
  );

  const getObjectiveKeyResults = useCallback(
    (objectiveId: number) => keyResults.filter((item) => item.objectiveId === objectiveId),
    [keyResults]
  );

  const getObjectiveProgress = useCallback(
    (objective: Objective) => {
      const objectiveKeyResults = getObjectiveKeyResults(objective.id);

      if (objectiveKeyResults.length === 0) {
        return clamp(Number(objective.progress || 0));
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

      return clamp(Math.round(weightedProgress / totalWeight));
    },
    [getObjectiveKeyResults]
  );

  const filteredObjectives = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return objectives.filter((objective) => {
      const owner = getUser(objective.ownerId);
      const project = getProject(objective.projectId);

      const searchable = [
        objective.title,
        objective.description,
        owner?.name,
        project?.name,
        objective.period,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch = !normalizedSearch || searchable.includes(normalizedSearch);
      const matchesLevel = filterLevel === "all" || objective.level === filterLevel;
      const matchesStatus = filterStatus === "all" || objective.status === filterStatus;
      const matchesPeriod = filterPeriod === "all" || objective.period === filterPeriod;

      return matchesSearch && matchesLevel && matchesStatus && matchesPeriod;
    });
  }, [
    filterLevel,
    filterPeriod,
    filterStatus,
    getProject,
    getUser,
    objectives,
    search,
  ]);

  const dashboard = useMemo(() => {
    const totalObjectives = objectives.length;
    const totalKeyResults = keyResults.length;
    const totalKpis = kpis.length;
    const totalReviews = reviews.length;
    const objectiveProgresses = objectives.map((objective) => getObjectiveProgress(objective));

    const progress =
      totalObjectives === 0
        ? 0
        : Math.round(
            objectiveProgresses.reduce((sum, value) => sum + value, 0) / totalObjectives
          );

    const onTrack = objectives.filter((item) => item.status === "on_track").length;
    const atRisk = objectives.filter((item) => item.status === "at_risk").length;
    const behind = objectives.filter((item) => item.status === "behind").length;
    const closed = objectives.filter((item) => item.status === "closed").length;

    const averageReviewScore =
      totalReviews === 0
        ? 0
        : Math.round(
            reviews.reduce((sum, item) => sum + Number(item.score || 0), 0) / totalReviews
          );

    const keyResultProgress =
      totalKeyResults === 0
        ? 0
        : Math.round(
            keyResults.reduce((sum, item) => sum + Number(item.progress || 0), 0) /
              totalKeyResults
          );

    const kpiProgress =
      totalKpis === 0
        ? 0
        : Math.round(
            kpis.reduce(
              (sum, item) =>
                sum + calculateProgress(0, Number(item.currentValue), Number(item.targetValue)),
              0
            ) / totalKpis
          );

    const riskScore =
      totalObjectives === 0
        ? 0
        : clamp(Math.round(((behind * 2 + atRisk) / (totalObjectives * 2)) * 100));

    const bestTeamObjective = [...objectives]
      .filter((item) => item.level === "team")
      .sort((a, b) => getObjectiveProgress(b) - getObjectiveProgress(a))[0];

    const companyObjectives = objectives.filter((item) => item.level === "company");
    const primaryObjectives = (companyObjectives.length ? companyObjectives : objectives)
      .slice()
      .sort((a, b) => getObjectiveProgress(b) - getObjectiveProgress(a))
      .slice(0, 5);

    const rowsFromProjects: TeamRow[] = projects
      .map((project) => {
        const projectObjectives = objectives.filter((item) => item.projectId === project.id);
        const projectKpis = kpis.filter((item) => item.projectId === project.id);
        const relatedKeyResults = keyResults.filter((item) =>
          projectObjectives.some((objective) => objective.id === item.objectiveId)
        );
        const ownerCount = new Set(
          projectObjectives.map((item) => item.ownerId).filter(Boolean)
        ).size;
        const riskCount = projectObjectives.filter(
          (item) => item.status === "behind" || item.status === "at_risk"
        ).length;
        const rowProgress =
          projectObjectives.length === 0
            ? 0
            : Math.round(
                projectObjectives.reduce(
                  (sum, objective) => sum + getObjectiveProgress(objective),
                  0
                ) / projectObjectives.length
              );

        const status: OKRStatus =
          riskCount > 0
            ? projectObjectives.some((item) => item.status === "behind")
              ? "behind"
              : "at_risk"
            : rowProgress >= 100
              ? "closed"
              : "on_track";

        return {
          id: `project-${project.id}`,
          name: project.name,
          progress: rowProgress,
          objectiveCount: projectObjectives.length,
          keyResultCount: relatedKeyResults.length,
          kpiCount: projectKpis.length,
          ownerCount,
          riskCount,
          status,
        };
      })
      .filter((row) => row.objectiveCount > 0 || row.kpiCount > 0);

    const noProjectObjectives = objectives.filter((item) => !item.projectId);
    const withoutProjectRow: TeamRow | null =
      noProjectObjectives.length === 0
        ? null
        : {
            id: "without-project",
            name: "بدون پروژه",
            progress: Math.round(
              noProjectObjectives.reduce(
                (sum, objective) => sum + getObjectiveProgress(objective),
                0
              ) / noProjectObjectives.length
            ),
            objectiveCount: noProjectObjectives.length,
            keyResultCount: keyResults.filter((item) =>
              noProjectObjectives.some((objective) => objective.id === item.objectiveId)
            ).length,
            kpiCount: kpis.filter((item) => !item.projectId).length,
            ownerCount: new Set(noProjectObjectives.map((item) => item.ownerId).filter(Boolean))
              .size,
            riskCount: noProjectObjectives.filter(
              (item) => item.status === "behind" || item.status === "at_risk"
            ).length,
            status: noProjectObjectives.some((item) => item.status === "behind")
              ? "behind"
              : noProjectObjectives.some((item) => item.status === "at_risk")
                ? "at_risk"
                : "on_track",
          };

    const teamRows = [...rowsFromProjects, ...(withoutProjectRow ? [withoutProjectRow] : [])]
      .sort((a, b) => b.riskCount - a.riskCount || b.progress - a.progress)
      .slice(0, 6);

    const memberRows: MemberRow[] = users
      .map((user) => {
        const userObjectives = objectives.filter((item) => item.ownerId === user.id);
        const userReviews = reviews.filter((item) => item.userId === user.id);
        const reviewScore =
          userReviews.length === 0
            ? 0
            : Math.round(
                userReviews.reduce((sum, review) => sum + Number(review.score || 0), 0) /
                  userReviews.length
              );
        const userProgress =
          userObjectives.length === 0
            ? 0
            : Math.round(
                userObjectives.reduce(
                  (sum, objective) => sum + getObjectiveProgress(objective),
                  0
                ) / userObjectives.length
              );

        return {
          id: user.id,
          name: user.name,
          role: user.role || "عضو تیم",
          objectiveCount: userObjectives.length,
          progress: userProgress,
          reviewScore,
          riskCount: userObjectives.filter(
            (item) => item.status === "behind" || item.status === "at_risk"
          ).length,
        };
      })
      .sort((a, b) => b.riskCount - a.riskCount || b.progress - a.progress)
      .slice(0, 6);

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
      keyResultProgress,
      kpiProgress,
      riskScore,
      bestTeamObjective,
      primaryObjectives,
      teamRows,
      memberRows,
    };
  }, [getObjectiveProgress, keyResults, kpis, objectives, projects, reviews, users]);

  const donutStops = useMemo(() => {
    const total = Math.max(dashboard.totalObjectives, 1);
    const onTrackStop = (dashboard.onTrack / total) * 100;
    const atRiskStop = onTrackStop + (dashboard.atRisk / total) * 100;
    const behindStop = atRiskStop + (dashboard.behind / total) * 100;

    if (dashboard.totalObjectives === 0) {
      return "conic-gradient(#e2e8f0 0 100%)";
    }

    return `conic-gradient(#10b981 0 ${onTrackStop}%, #f59e0b ${onTrackStop}% ${atRiskStop}%, #ef4444 ${atRiskStop}% ${behindStop}%, #94a3b8 ${behindStop}% 100%)`;
  }, [dashboard.atRisk, dashboard.behind, dashboard.onTrack, dashboard.totalObjectives]);

  const insights = useMemo(() => {
    const items: { title: string; body: string; tone: Tone }[] = [];

    if (dashboard.behind > 0) {
      items.push({
        title: "اقدام فوری لازم است",
        body: `${formatNumber(dashboard.behind)} هدف عقب‌مانده ثبت شده و باید مالک، مانع و تصمیم بعدی مشخص شود.`,
        tone: "red",
      });
    }

    if (dashboard.atRisk > 0) {
      items.push({
        title: "ریسک قابل مدیریت",
        body: `${formatNumber(dashboard.atRisk)} هدف نیازمند توجه است؛ بهتر است در جلسه هفتگی بررسی شود.`,
        tone: "amber",
      });
    }

    if (dashboard.progress >= 75) {
      items.push({
        title: "پیشرفت سالم",
        body: `میانگین پیشرفت OKRها ${formatPercent(dashboard.progress)} است و مسیر کلی تیم مثبت دیده می‌شود.`,
        tone: "emerald",
      });
    } else {
      items.push({
        title: "نیاز به تمرکز مدیریتی",
        body: `میانگین پیشرفت OKRها ${formatPercent(dashboard.progress)} است؛ اولویت‌ها را کم و واضح نگه دارید.`,
        tone: "blue",
      });
    }

    if (dashboard.totalReviews === 0) {
      items.push({
        title: "ارزیابی عملکرد خالی است",
        body: "برای داشتن تصویر دقیق‌تر از عملکرد افراد، ارزیابی‌های دوره‌ای را ثبت کنید.",
        tone: "purple",
      });
    }

    return items.slice(0, 4);
  }, [dashboard.atRisk, dashboard.behind, dashboard.progress, dashboard.totalReviews]);

  const selectedObjectiveDetail = useMemo(() => {
    return (
      objectives.find((item) => item.id === selectedObjectiveDetailId) ||
      filteredObjectives[0] ||
      null
    );
  }, [filteredObjectives, objectives, selectedObjectiveDetailId]);

  const selectedObjectiveDetailKrs = useMemo(() => {
    return selectedObjectiveDetail ? getObjectiveKeyResults(selectedObjectiveDetail.id) : [];
  }, [getObjectiveKeyResults, selectedObjectiveDetail]);

  const selectedKeyResultDetail = useMemo(() => {
    return (
      keyResults.find((item) => item.id === selectedKeyResultDetailId) ||
      selectedObjectiveDetailKrs[0] ||
      null
    );
  }, [keyResults, selectedKeyResultDetailId, selectedObjectiveDetailKrs]);

  const selectedTeam = useMemo(() => {
    return dashboard.teamRows.find((item) => item.id === selectedTeamId) || dashboard.teamRows[0] || null;
  }, [dashboard.teamRows, selectedTeamId]);

  const meetingPlans = useMemo<MeetingPlan[]>(() => {
    const riskyTeam = dashboard.teamRows.find((team) => team.riskCount > 0);
    const bestTeam = dashboard.teamRows.find((team) => team.progress >= dashboard.progress);
    const topOwner = dashboard.memberRows[0]?.name || currentUser?.name || "مدیر تیم";

    return [
      {
        id: "risk-review",
        title: riskyTeam ? `بررسی ریسک‌های ${riskyTeam.name}` : "مرور هفتگی سلامت OKR",
        team: riskyTeam?.name || "همه تیم‌ها",
        time: "امروز · ۱۰:۰۰",
        status: dashboard.behind > 0 ? "فوری" : "در برنامه",
        tone: dashboard.behind > 0 ? "red" : "emerald",
        agenda: [
          "مرور هدف‌های عقب‌مانده و نیازمند توجه",
          "مشخص کردن مانع، مالک و تصمیم بعدی",
          "به‌روزرسانی KRهایی که عدد فعلی ندارند",
        ],
        decisions: [
          dashboard.behind > 0
            ? `${formatNumber(dashboard.behind)} هدف برای رفع مانع اولویت دارد.`
            : "فعلا هدف بحرانی ثبت نشده است.",
          "خروجی جلسه باید در توضیح OKR یا KR ثبت شود.",
        ],
        owners: [topOwner],
      },
      {
        id: "alignment",
        title: "هم‌راستاسازی هدف‌های شرکت و تیم‌ها",
        team: bestTeam?.name || "تیم محصول",
        time: "فردا · ۱۴:۰۰",
        status: "برنامه‌ریزی‌شده",
        tone: "blue",
        agenda: [
          "بررسی ارتباط OKRهای تیمی با هدف‌های شرکتی",
          "حذف هدف‌های کم‌اثر یا تکراری",
          "تبدیل خروجی‌ها به KR عددی",
        ],
        decisions: [
          "هر هدف تیمی باید حداقل یک KR قابل سنجش داشته باشد.",
          "اهداف بدون مالک در پایان جلسه تعیین تکلیف می‌شوند.",
        ],
        owners: [currentUser?.name || "مدیر"],
      },
      {
        id: "performance",
        title: "مرور عملکرد اعضای کلیدی",
        team: "منابع انسانی و مدیریت",
        time: "پنجشنبه · ۱۱:۰۰",
        status: "نیازمند ورودی",
        tone: "purple",
        agenda: [
          "مرور امتیازهای عملکرد ثبت‌شده",
          "بررسی اعضای بدون ارزیابی",
          "تعیین اقدام رشد یا پشتیبانی برای هر نفر",
        ],
        decisions: [
          `${formatNumber(dashboard.totalReviews)} ارزیابی عملکرد در سیستم ثبت شده است.`,
          "اعضای بدون ارزیابی باید قبل از پایان دوره تکمیل شوند.",
        ],
        owners: [topOwner],
      },
    ];
  }, [
    currentUser?.name,
    dashboard.behind,
    dashboard.memberRows,
    dashboard.progress,
    dashboard.teamRows,
    dashboard.totalReviews,
  ]);

  const selectedMeeting = useMemo(() => {
    return meetingPlans.find((item) => item.id === selectedMeetingId) || meetingPlans[0];
  }, [meetingPlans, selectedMeetingId]);

  const openAiOkrModal = () => {
    setAiOkrStep(1);
    setAiOkrTitle("");
    setAiOkrContext("");
    setAiOkrProjectId(projects[0]?.id || null);
    setAiOkrOwnerId(currentUser?.id || null);
    setAiOkrLevel("team");
    setAiOkrPeriod(periods[0] || "Q1 2026");
    setAiOkrSuggestion(null);
    setAiOkrSelectedKr([]);
    setAiOkrError("");
    setAiOkrSource("");
    setIsAiOkrModalOpen(true);
  };

  const requestAiOkrSuggestion = async () => {
    setAiOkrLoading(true);
    setAiOkrError("");

    try {
      const selectedProject = getProject(aiOkrProjectId);
      const selectedOwner = getUser(aiOkrOwnerId);
      const response = await fetch("api/okr-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: aiOkrTitle,
          context: aiOkrContext,
          period: aiOkrPeriod,
          level: aiOkrLevel,
          project: selectedProject,
          owner: selectedOwner,
          existingObjectives: objectives.slice(0, 8).map((objective) => ({
            title: objective.title,
            description: objective.description,
            level: objective.level,
            status: objective.status,
            period: objective.period,
            progress: getObjectiveProgress(objective),
          })),
        }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        source?: "openai" | "fallback";
        suggestion?: AiOkrSuggestion;
      };

      if (!response.ok || !data.ok || !data.suggestion) {
        throw new Error(data.error || "پیشنهاد OKR ساخته نشد.");
      }

      setAiOkrSuggestion(data.suggestion);
      setAiOkrSource(data.source || "fallback");
      setAiOkrSelectedKr(data.suggestion.keyResults.map((_, index) => index));
      setAiOkrStep(2);
    } catch (error) {
      setAiOkrError(error instanceof Error ? error.message : "خطای نامشخص رخ داد.");
    } finally {
      setAiOkrLoading(false);
    }
  };

  const createOkrFromAiSuggestion = async () => {
    if (!aiOkrSuggestion) return;

    const objectiveId = Date.now();
    const objective: Objective = {
      id: objectiveId,
      title: aiOkrSuggestion.title.trim(),
      description: aiOkrSuggestion.description.trim(),
      level: aiOkrLevel,
      status: "on_track",
      ownerId: aiOkrOwnerId,
      projectId: aiOkrProjectId,
      period: aiOkrPeriod.trim() || "Q1 2026",
      progress: 0,
      createdAt: Date.now(),
    };

    const selectedKeyResults = aiOkrSuggestion.keyResults.filter((_, index) =>
      aiOkrSelectedKr.includes(index)
    );

    await Promise.all([
      setDoc(doc(db, "objectives", String(objectiveId)), objective),
      ...selectedKeyResults.map((keyResult, index) => {
        const id = objectiveId + index + 1;
        const item: KeyResult = {
          id,
          objectiveId,
          title: keyResult.title.trim(),
          startValue: Number(keyResult.startValue || 0),
          currentValue: Number(keyResult.startValue || 0),
          targetValue: Number(keyResult.targetValue || 100),
          unit: keyResult.unit.trim() || "%",
          weight: Number(keyResult.weight || 1),
          progress: 0,
          createdAt: Date.now() + index + 1,
        };

        return setDoc(doc(db, "keyResults", String(id)), item);
      }),
    ]);

    setSelectedObjectiveDetailId(objectiveId);
    setSelectedKeyResultDetailId(null);
    setActiveTab("objectives");
    setIsAiOkrModalOpen(false);
  };

  const openNewObjectiveModal = () => {
    setEditingObjectiveId(null);
    setObjectiveTitle("");
    setObjectiveDescription("");
    setObjectiveLevel("team");
    setObjectiveStatus("on_track");
    setObjectiveOwnerId(currentUser?.id || null);
    setObjectiveProjectId(null);
    setObjectivePeriod(periods[0] || "Q1 2026");
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
    if (!confirm("این هدف حذف شود؟ نتیجه‌های کلیدی مربوط به آن هم حذف می‌شوند.")) return;

    const relatedKeyResults = keyResults.filter((item) => item.objectiveId === objectiveId);

    await Promise.all([
      deleteDoc(doc(db, "objectives", String(objectiveId))),
      ...relatedKeyResults.map((item) => deleteDoc(doc(db, "keyResults", String(item.id)))),
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
    if (!confirm("این نتیجه کلیدی حذف شود؟")) return;
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
    setReviewPeriod(periods[0] || "Q1 2026");
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
    <section dir="rtl" className="space-y-5 text-right">
      <div className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-xl shadow-slate-200/60 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="mb-3 flex flex-wrap gap-2">
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
                مرکز مدیریت عملکرد
              </span>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
                تیم‌ها، OKR و KPI
              </span>
            </div>
            <h2 className="text-2xl font-black text-slate-900 md:text-3xl">
              OKR و عملکرد تیم‌ها
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-500">
              نمای مدیریتی برای دیدن سلامت اهداف، ریسک تیم‌ها، پیشرفت نتیجه‌های کلیدی و وضعیت عملکرد اعضا.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={openAiOkrModal}
              className="rounded-2xl bg-purple-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-purple-100 transition hover:-translate-y-0.5 hover:bg-purple-700"
            >
              + ساخت OKR با AI
            </button>
            <button
              onClick={openNewObjectiveModal}
              className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-100 transition hover:-translate-y-0.5 hover:bg-blue-700"
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
              + ارزیابی
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="جستجو در هدف، مسئول، پروژه یا دوره..."
            className="min-h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-700 outline-none transition focus:border-blue-400 focus:bg-white"
          />

          <div className="flex flex-wrap gap-2">
            {[
              ["dashboard", "نمای مدیریت"],
              ["objectives", "OKR و KR"],
              ["teams", "تیم‌ها"],
              ["meetings", "جلسات"],
              ["okrReports", "گزارش‌ها"],
              ["kpis", "KPI"],
              ["reviews", "ارزیابی‌ها"],
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setActiveTab(key as typeof activeTab)}
                className={`rounded-2xl px-4 py-3 text-sm font-black transition ${
                  activeTab === key
                    ? "bg-slate-900 text-white shadow-lg shadow-slate-200"
                    : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {activeTab === "dashboard" && (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              {
                title: "میانگین پیشرفت OKR",
                value: formatPercent(dashboard.progress),
                sub: `${formatNumber(dashboard.totalObjectives)} هدف فعال`,
                tone: "emerald" as Tone,
                spark: sparklineValues[0],
              },
              {
                title: "پیشرفت نتیجه‌های کلیدی",
                value: formatPercent(dashboard.keyResultProgress),
                sub: `${formatNumber(dashboard.totalKeyResults)} KR ثبت‌شده`,
                tone: "blue" as Tone,
                spark: sparklineValues[1],
              },
              {
                title: "سلامت KPIها",
                value: formatPercent(dashboard.kpiProgress),
                sub: `${formatNumber(dashboard.totalKpis)} شاخص قابل اندازه‌گیری`,
                tone: "purple" as Tone,
                spark: sparklineValues[2],
              },
              {
                title: "شاخص ریسک",
                value: formatPercent(dashboard.riskScore),
                sub: `${formatNumber(dashboard.behind + dashboard.atRisk)} مورد نیازمند پیگیری`,
                tone: dashboard.riskScore > 40 ? ("red" as Tone) : ("amber" as Tone),
                spark: sparklineValues[3],
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-black text-slate-400">{item.title}</p>
                    <p className={`mt-3 text-3xl font-black ${toneText[item.tone]}`}>
                      {item.value}
                    </p>
                    <p className="mt-1 text-xs font-bold text-slate-400">{item.sub}</p>
                  </div>
                  <div className={`rounded-2xl border px-3 py-2 ${toneSurface[item.tone]}`}>
                    <span className={`text-sm font-black ${toneText[item.tone]}`}>●</span>
                  </div>
                </div>
                <div className="mt-5">
                  <Sparkline values={item.spark} tone={item.tone} />
                </div>
              </div>
            ))}
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr_0.9fr]">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-xl font-black text-slate-900">وضعیت OKRها</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    تقسیم‌بندی اهداف بر اساس سلامت اجرایی
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">
                  {periods[0] || "دوره جاری"}
                </span>
              </div>

              <div className="grid gap-5 md:grid-cols-[180px_1fr] md:items-center">
                <div className="mx-auto flex h-44 w-44 items-center justify-center rounded-full p-4" style={{ background: donutStops }}>
                  <div className="flex h-28 w-28 flex-col items-center justify-center rounded-full bg-white shadow-inner">
                    <span className="text-3xl font-black text-slate-900">
                      {formatNumber(dashboard.totalObjectives)}
                    </span>
                    <span className="mt-1 text-xs font-bold text-slate-400">OKR</span>
                  </div>
                </div>

                <div className="space-y-4">
                  {[
                    ["در مسیر", dashboard.onTrack, "emerald" as Tone],
                    ["نیازمند توجه", dashboard.atRisk, "amber" as Tone],
                    ["عقب‌مانده", dashboard.behind, "red" as Tone],
                    ["بسته‌شده", dashboard.closed, "slate" as Tone],
                  ].map(([label, value, tone]) => (
                    <div key={String(label)}>
                      <div className="mb-2 flex items-center justify-between text-sm">
                        <span className="font-black text-slate-700">{label}</span>
                        <span className={`font-black ${toneText[tone as Tone]}`}>
                          {formatNumber(Number(value))}
                        </span>
                      </div>
                      <ProgressBar
                        value={
                          dashboard.totalObjectives === 0
                            ? 0
                            : (Number(value) / dashboard.totalObjectives) * 100
                        }
                        tone={tone as Tone}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-black text-slate-900">وضعیت تیم‌ها</h3>
                  <p className="mt-1 text-sm text-slate-500">پیشرفت، ریسک و حجم کار هر تیم</p>
                </div>
                <button
                  onClick={() => setActiveTab("objectives")}
                  className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-black text-blue-700"
                >
                  جزئیات
                </button>
              </div>

              <div className="space-y-4">
                {dashboard.teamRows.map((team) => (
                  <div key={team.id} className="rounded-2xl border border-slate-100 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-black text-slate-800">{team.name}</p>
                        <p className="mt-1 text-xs font-bold text-slate-400">
                          {formatNumber(team.objectiveCount)} هدف · {formatNumber(team.keyResultCount)} KR · {formatNumber(team.ownerCount)} مسئول
                        </p>
                      </div>
                      <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusStyle[team.status]}`}>
                        {statusLabel[team.status]}
                      </span>
                    </div>
                    <div className="grid grid-cols-[1fr_auto] items-center gap-3">
                      <ProgressBar
                        value={team.progress}
                        tone={team.riskCount > 0 ? "amber" : "emerald"}
                      />
                      <span className="text-xs font-black text-slate-600">
                        {formatPercent(team.progress)}
                      </span>
                    </div>
                  </div>
                ))}

                {dashboard.teamRows.length === 0 && (
                  <EmptyState text="هنوز OKR یا KPI تیمی ثبت نشده است." />
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-black text-slate-900">بینش و هشدارها</h3>
                  <p className="mt-1 text-sm text-slate-500">خلاصه‌ای برای تصمیم مدیریتی</p>
                </div>
                <span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-black text-purple-700">
                  AI
                </span>
              </div>

              <div className="space-y-3">
                {insights.map((item) => (
                  <div
                    key={item.title}
                    className={`rounded-2xl border p-4 ${toneSurface[item.tone]}`}
                  >
                    <p className={`text-sm font-black ${toneText[item.tone]}`}>
                      {item.title}
                    </p>
                    <p className="mt-2 text-sm leading-7 text-slate-600">{item.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.4fr_0.8fr]">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-black text-slate-900">سنگ‌های اصلی شرکت</h3>
                  <p className="mt-1 text-sm text-slate-500">هدف‌های اصلی که مدیر باید هر هفته ببیند</p>
                </div>
                <button
                  onClick={() => setActiveTab("objectives")}
                  className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-600"
                >
                  مشاهده همه
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-xs text-slate-400">
                      <th className="py-3 text-right font-black">هدف</th>
                      <th className="py-3 text-right font-black">مسئول</th>
                      <th className="py-3 text-right font-black">سطح</th>
                      <th className="py-3 text-right font-black">وضعیت</th>
                      <th className="py-3 text-right font-black">پیشرفت</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.primaryObjectives.map((objective) => {
                      const owner = getUser(objective.ownerId);
                      const progress = getObjectiveProgress(objective);

                      return (
                        <tr key={objective.id} className="border-b border-slate-50">
                          <td className="max-w-[280px] py-4">
                            <p className="truncate font-black text-slate-800">
                              {objective.title}
                            </p>
                            <p className="mt-1 truncate text-xs font-bold text-slate-400">
                              {objective.period}
                            </p>
                          </td>
                          <td className="py-4 font-bold text-slate-600">
                            {owner?.name || "نامشخص"}
                          </td>
                          <td className="py-4 font-bold text-slate-600">
                            {levelLabel[objective.level]}
                          </td>
                          <td className="py-4">
                            <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusStyle[objective.status]}`}>
                              {statusLabel[objective.status]}
                            </span>
                          </td>
                          <td className="py-4">
                            <div className="grid grid-cols-[1fr_44px] items-center gap-2">
                              <ProgressBar
                                value={progress}
                                tone={objective.status === "behind" ? "red" : "emerald"}
                              />
                              <span className="text-xs font-black text-slate-600">
                                {formatPercent(progress)}
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {dashboard.primaryObjectives.length === 0 && (
                <EmptyState text="هنوز هدف اصلی ثبت نشده است." />
              )}
            </div>

            <div className="space-y-5">
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-xl font-black text-slate-900">جلسات و اقدامات بعدی</h3>
                <div className="mt-4 space-y-3">
                  {[
                    {
                      title:
                        dashboard.behind > 0
                          ? "جلسه رفع مانع اهداف عقب‌مانده"
                          : "مرور هفتگی سلامت OKR",
                      time: "امروز · ۱۰:۰۰",
                      tone: dashboard.behind > 0 ? ("red" as Tone) : ("emerald" as Tone),
                    },
                    {
                      title: "هم‌راستاسازی تیم‌ها با هدف شرکت",
                      time: "فردا · ۱۴:۰۰",
                      tone: "blue" as Tone,
                    },
                    {
                      title: "مرور عملکرد اعضای کلیدی",
                      time: "پنجشنبه · ۱۱:۰۰",
                      tone: "purple" as Tone,
                    },
                  ].map((item) => (
                    <div key={item.title} className="grid grid-cols-[72px_1fr] gap-3 rounded-2xl border border-slate-100 p-3">
                      <span className={`rounded-xl px-2 py-2 text-center text-xs font-black ${toneSurface[item.tone]} ${toneText[item.tone]}`}>
                        {item.time}
                      </span>
                      <p className="self-center text-sm font-black text-slate-700">{item.title}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-xl font-black text-slate-900">عملکرد اعضا</h3>
                <div className="mt-4 space-y-3">
                  {dashboard.memberRows.map((member) => (
                    <div key={member.id} className="rounded-2xl border border-slate-100 p-3">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-slate-800">
                            {member.name}
                          </p>
                          <p className="mt-1 text-xs font-bold text-slate-400">
                            {member.role} · {formatNumber(member.objectiveCount)} هدف
                          </p>
                        </div>
                        <span className="text-xs font-black text-slate-600">
                          {member.reviewScore > 0
                            ? formatNumber(member.reviewScore)
                            : "بدون ارزیابی"}
                        </span>
                      </div>
                      <ProgressBar
                        value={member.progress}
                        tone={member.riskCount > 0 ? "amber" : "blue"}
                      />
                    </div>
                  ))}
                  {dashboard.memberRows.length === 0 && (
                    <EmptyState text="هنوز عضوی برای نمایش وجود ندارد." />
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              {
                title: "راهنمای OKR",
                body: "اهداف را کم، شفاف و نتیجه‌های کلیدی را قابل اندازه‌گیری نگه دارید.",
                action: "مطالعه",
                tone: "blue" as Tone,
              },
              {
                title: "ساخت OKR با پیشنهاد AI",
                body: "هدف را وارد کنید تا AI هدف دقیق‌تر و KRهای عددی قابل ثبت پیشنهاد بدهد.",
                action: "شروع ساخت هوشمند",
                tone: "purple" as Tone,
                onClick: openAiOkrModal,
              },
              {
                title: "نقشه هم‌راستایی",
                body: `${formatNumber(dashboard.totalObjectives)} هدف در سطح شرکت، تیم و فرد ثبت شده است.`,
                action: "مرور",
                tone: "emerald" as Tone,
              },
              {
                title: "گزارش پیشرفت",
                body: "خلاصه OKR، KPI و عملکرد اعضا برای جلسه مدیریت آماده است.",
                action: "مشاهده",
                tone: "slate" as Tone,
                onClick: () => setActiveTab("reviews"),
              },
            ].map((item) => (
              <div
                key={item.title}
                className={`rounded-3xl border p-5 shadow-sm ${toneSurface[item.tone]}`}
              >
                <h3 className={`text-lg font-black ${toneText[item.tone]}`}>{item.title}</h3>
                <p className="mt-3 min-h-14 text-sm leading-7 text-slate-600">{item.body}</p>
                <button
                  onClick={item.onClick}
                  className="mt-4 rounded-2xl bg-white px-4 py-2 text-xs font-black text-slate-700 shadow-sm"
                >
                  {item.action}
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {activeTab === "objectives" && (
        <div className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-xl shadow-slate-200/60 backdrop-blur">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-xl font-black text-slate-900">اهداف و نتیجه‌های کلیدی</h3>
              <p className="mt-1 text-sm text-slate-500">مدیریت Objectiveها و KRهای قابل اندازه‌گیری</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={openAiOkrModal}
                className="rounded-2xl bg-purple-600 px-5 py-3 text-sm font-black text-white"
              >
                + OKR با AI
              </button>
              <button
                onClick={openNewObjectiveModal}
                className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white"
              >
                + هدف جدید
              </button>
            </div>
          </div>

          <div className="mb-5 grid gap-3 lg:grid-cols-4">
            <select
              value={filterLevel}
              onChange={(event) => setFilterLevel(event.target.value as "all" | OKRLevel)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none"
            >
              <option value="all">همه سطح‌ها</option>
              <option value="company">شرکتی</option>
              <option value="team">تیمی</option>
              <option value="personal">فردی</option>
            </select>

            <select
              value={filterStatus}
              onChange={(event) => setFilterStatus(event.target.value as "all" | OKRStatus)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none"
            >
              <option value="all">همه وضعیت‌ها</option>
              <option value="on_track">در مسیر</option>
              <option value="at_risk">نیازمند توجه</option>
              <option value="behind">عقب‌مانده</option>
              <option value="closed">بسته‌شده</option>
            </select>

            <select
              value={filterPeriod}
              onChange={(event) => setFilterPeriod(event.target.value)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none lg:col-span-2"
            >
              <option value="all">همه دوره‌ها</option>
              {periods.map((period) => (
                <option key={period} value={period}>
                  {period}
                </option>
              ))}
            </select>
          </div>

          {selectedObjectiveDetail && (
            <div className="mb-5 grid gap-5 xl:grid-cols-[1fr_0.9fr]">
              <div className="rounded-3xl border border-blue-100 bg-blue-50/60 p-5">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="mb-2 flex flex-wrap gap-2">
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-blue-700">
                        جزئیات OKR
                      </span>
                      <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusStyle[selectedObjectiveDetail.status]}`}>
                        {statusLabel[selectedObjectiveDetail.status]}
                      </span>
                    </div>
                    <h3 className="text-xl font-black text-slate-900">
                      {selectedObjectiveDetail.title}
                    </h3>
                    <p className="mt-2 text-sm leading-7 text-slate-600">
                      {selectedObjectiveDetail.description || "برای این هدف توضیحی ثبت نشده است."}
                    </p>
                  </div>
                  <span className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-blue-700">
                    {formatPercent(getObjectiveProgress(selectedObjectiveDetail))}
                  </span>
                </div>

                <ProgressBar value={getObjectiveProgress(selectedObjectiveDetail)} tone="blue" />

                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl bg-white p-4">
                    <p className="text-xs font-black text-slate-400">مسئول</p>
                    <p className="mt-2 font-black text-slate-800">
                      {getUser(selectedObjectiveDetail.ownerId)?.name || "نامشخص"}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white p-4">
                    <p className="text-xs font-black text-slate-400">پروژه</p>
                    <p className="mt-2 font-black text-slate-800">
                      {getProject(selectedObjectiveDetail.projectId)?.name || "بدون پروژه"}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white p-4">
                    <p className="text-xs font-black text-slate-400">KR فعال</p>
                    <p className="mt-2 font-black text-slate-800">
                      {formatNumber(selectedObjectiveDetailKrs.length)}
                    </p>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    onClick={() => openNewKeyResultModal(selectedObjectiveDetail.id)}
                    className="rounded-2xl bg-blue-600 px-4 py-3 text-xs font-black text-white"
                  >
                    + افزودن KR
                  </button>
                  <button
                    onClick={() => openEditObjectiveModal(selectedObjectiveDetail)}
                    className="rounded-2xl bg-white px-4 py-3 text-xs font-black text-slate-700"
                  >
                    ویرایش هدف
                  </button>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-black text-slate-900">جزئیات نتیجه کلیدی</h3>
                    <p className="mt-1 text-sm text-slate-500">برای دیدن جزئیات، روی KRهای پایین کلیک کن.</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">
                    KR Detail
                  </span>
                </div>

                {selectedKeyResultDetail ? (
                  <div className="space-y-4">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="font-black text-slate-900">{selectedKeyResultDetail.title}</p>
                      <p className="mt-2 text-sm leading-7 text-slate-500">
                        از {formatNumber(selectedKeyResultDetail.startValue)} تا{" "}
                        {formatNumber(selectedKeyResultDetail.targetValue)}{" "}
                        {selectedKeyResultDetail.unit} · وزن{" "}
                        {formatNumber(selectedKeyResultDetail.weight)}
                      </p>
                    </div>
                    <div>
                      <div className="mb-2 flex items-center justify-between text-sm">
                        <span className="font-black text-slate-700">پیشرفت فعلی</span>
                        <span className="font-black text-blue-700">
                          {formatPercent(selectedKeyResultDetail.progress)}
                        </span>
                      </div>
                      <ProgressBar value={selectedKeyResultDetail.progress} tone="blue" />
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                      {[42, 38, 31].map((value, index) => (
                        <div key={index} className="rounded-2xl border border-slate-100 p-3">
                          <p className="text-xs font-black text-slate-400">
                            هفته {formatNumber(index + 1)}
                          </p>
                          <p className="mt-2 text-lg font-black text-slate-800">
                            {formatPercent(Math.max(0, selectedKeyResultDetail.progress - value))}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <EmptyState text="برای این هدف هنوز KR ثبت نشده است." />
                )}
              </div>
            </div>
          )}

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
                        <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusStyle[objective.status]}`}>
                          {statusLabel[objective.status]}
                        </span>
                        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
                          {objective.period}
                        </span>
                      </div>

                      <h4 className="text-lg font-black text-slate-900">{objective.title}</h4>
                      {objective.description && (
                        <p className="mt-2 text-sm leading-7 text-slate-500">
                          {objective.description}
                        </p>
                      )}
                      <p className="mt-3 text-xs font-bold text-slate-400">
                        مسئول: {owner?.name || "نامشخص"} · پروژه: {project?.name || "بدون پروژه"}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => {
                          setSelectedObjectiveDetailId(objective.id);
                          setSelectedKeyResultDetailId(null);
                        }}
                        className="rounded-2xl bg-white px-4 py-2 text-xs font-black text-blue-700 ring-1 ring-blue-100 hover:bg-blue-50"
                      >
                        جزئیات
                      </button>
                      <button
                        onClick={() => openNewKeyResultModal(objective.id)}
                        className="rounded-2xl bg-blue-50 px-4 py-2 text-xs font-black text-blue-700 hover:bg-blue-100"
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

                  <div className="mt-5 grid grid-cols-[1fr_56px] items-center gap-3">
                    <ProgressBar value={progress} tone="purple" />
                    <span className="text-left text-sm font-black text-slate-600">
                      {formatPercent(progress)}
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
                            <p className="mt-1 text-xs font-bold text-slate-400">
                              شروع: {formatNumber(keyResult.startValue)} {keyResult.unit} · هدف: {formatNumber(keyResult.targetValue)} {keyResult.unit} · وزن: {formatNumber(keyResult.weight)}
                            </p>
                          </div>
                          <button
                            onClick={() => setSelectedKeyResultDetailId(keyResult.id)}
                            className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-black text-blue-600 hover:bg-blue-100"
                          >
                            جزئیات
                          </button>
                          <button
                            onClick={() => deleteKeyResult(keyResult.id)}
                            className="rounded-xl bg-white px-3 py-2 text-xs font-black text-red-500 hover:bg-red-50"
                          >
                            حذف
                          </button>
                        </div>

                        <div className="grid gap-3 md:grid-cols-[1fr_160px_60px] md:items-center">
                          <ProgressBar value={keyResult.progress} tone="slate" />
                          <input
                            value={keyResult.currentValue}
                            onChange={(event) =>
                              updateKeyResultValue(
                                keyResult,
                                Number(event.target.value || 0)
                              )
                            }
                            type="number"
                            className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold outline-none focus:border-blue-500"
                          />
                          <span className="text-left text-sm font-black text-slate-600">
                            {formatPercent(keyResult.progress)}
                          </span>
                        </div>
                      </div>
                    ))}

                    {objectiveKeyResults.length === 0 && (
                      <EmptyState text="هنوز نتیجه کلیدی برای این هدف ثبت نشده است." />
                    )}
                  </div>
                </div>
              );
            })}

            {filteredObjectives.length === 0 && (
              <EmptyState text="هدفی با فیلترهای انتخاب‌شده پیدا نشد." />
            )}
          </div>
        </div>
      )}

      {activeTab === "teams" && (
        <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-xl shadow-slate-200/60 backdrop-blur">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xl font-black text-slate-900">تیم‌ها</h3>
                <p className="mt-1 text-sm text-slate-500">لیست تیم‌ها با پیشرفت، ریسک و تعداد KR</p>
              </div>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
                Team List
              </span>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
              {dashboard.teamRows.map((team) => (
                <button
                  key={team.id}
                  onClick={() => setSelectedTeamId(team.id)}
                  className={`rounded-3xl border p-4 text-right transition ${
                    selectedTeam?.id === team.id
                      ? "border-blue-300 bg-blue-50"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-black text-slate-900">{team.name}</p>
                      <p className="mt-1 text-xs font-bold text-slate-400">
                        {formatNumber(team.objectiveCount)} OKR · {formatNumber(team.keyResultCount)} KR · {formatNumber(team.kpiCount)} KPI
                      </p>
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusStyle[team.status]}`}>
                      {statusLabel[team.status]}
                    </span>
                  </div>
                  <div className="grid grid-cols-[1fr_48px] items-center gap-3">
                    <ProgressBar value={team.progress} tone={team.riskCount > 0 ? "amber" : "emerald"} />
                    <span className="text-xs font-black text-slate-600">
                      {formatPercent(team.progress)}
                    </span>
                  </div>
                </button>
              ))}

              {dashboard.teamRows.length === 0 && <EmptyState text="هنوز تیمی با OKR یا KPI ثبت نشده است." />}
            </div>
          </div>

          <div className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-xl shadow-slate-200/60 backdrop-blur">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-black text-slate-900">
                  جزئیات {selectedTeam?.name || "تیم"}
                </h3>
                <p className="mt-1 text-sm text-slate-500">نمای جزئیات تیم برای مدیریت عملکرد</p>
              </div>
              {selectedTeam && (
                <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusStyle[selectedTeam.status]}`}>
                  {statusLabel[selectedTeam.status]}
                </span>
              )}
            </div>

            {selectedTeam ? (
              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-4">
                  {[
                    ["پیشرفت", formatPercent(selectedTeam.progress), "blue" as Tone],
                    ["OKR", formatNumber(selectedTeam.objectiveCount), "purple" as Tone],
                    ["KR", formatNumber(selectedTeam.keyResultCount), "emerald" as Tone],
                    ["ریسک", formatNumber(selectedTeam.riskCount), selectedTeam.riskCount > 0 ? ("red" as Tone) : ("slate" as Tone)],
                  ].map(([label, value, tone]) => (
                    <div key={String(label)} className={`rounded-2xl border p-4 ${toneSurface[tone as Tone]}`}>
                      <p className="text-xs font-black text-slate-500">{label}</p>
                      <p className={`mt-2 text-2xl font-black ${toneText[tone as Tone]}`}>
                        {value}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="rounded-3xl border border-slate-200 p-5">
                  <h4 className="mb-4 font-black text-slate-900">OKRهای مرتبط</h4>
                  <div className="space-y-3">
                    {objectives
                      .filter((objective) => {
                        const project = getProject(objective.projectId);
                        return selectedTeam.id === "without-project"
                          ? !objective.projectId
                          : selectedTeam.name === project?.name;
                      })
                      .slice(0, 6)
                      .map((objective) => (
                        <button
                          key={objective.id}
                          onClick={() => {
                            setSelectedObjectiveDetailId(objective.id);
                            setActiveTab("objectives");
                          }}
                          className="w-full rounded-2xl border border-slate-100 bg-slate-50 p-4 text-right"
                        >
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <p className="font-black text-slate-800">{objective.title}</p>
                            <span className="text-xs font-black text-blue-700">
                              {formatPercent(getObjectiveProgress(objective))}
                            </span>
                          </div>
                          <ProgressBar value={getObjectiveProgress(objective)} tone="blue" />
                        </button>
                      ))}
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-200 p-5">
                  <h4 className="mb-4 font-black text-slate-900">اعضای درگیر</h4>
                  <div className="grid gap-3 md:grid-cols-2">
                    {dashboard.memberRows.slice(0, 4).map((member) => (
                      <div key={member.id} className="rounded-2xl bg-slate-50 p-4">
                        <div className="mb-2 flex items-center justify-between">
                          <p className="font-black text-slate-800">{member.name}</p>
                          <span className="text-xs font-black text-slate-500">
                            {formatPercent(member.progress)}
                          </span>
                        </div>
                        <ProgressBar value={member.progress} tone={member.riskCount > 0 ? "amber" : "emerald"} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState text="برای دیدن جزئیات، یک تیم را انتخاب کن." />
            )}
          </div>
        </div>
      )}

      {activeTab === "meetings" && (
        <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
          <div className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-xl shadow-slate-200/60 backdrop-blur">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black text-slate-900">جلسات</h3>
                <p className="mt-1 text-sm text-slate-500">جلسات پیشنهادی برای پیگیری OKRها</p>
              </div>
              <span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-black text-purple-700">
                Meeting List
              </span>
            </div>

            <div className="space-y-3">
              {meetingPlans.map((meeting) => (
                <button
                  key={meeting.id}
                  onClick={() => setSelectedMeetingId(meeting.id)}
                  className={`w-full rounded-3xl border p-4 text-right transition ${
                    selectedMeeting.id === meeting.id
                      ? "border-purple-300 bg-purple-50"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="font-black text-slate-900">{meeting.title}</p>
                    <span className={`rounded-full px-3 py-1 text-xs font-black ${toneSurface[meeting.tone]} ${toneText[meeting.tone]}`}>
                      {meeting.status}
                    </span>
                  </div>
                  <p className="text-xs font-bold text-slate-400">
                    {meeting.team} · {meeting.time}
                  </p>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-xl shadow-slate-200/60 backdrop-blur">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-black text-slate-900">{selectedMeeting.title}</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {selectedMeeting.team} · {selectedMeeting.time}
                </p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-black ${toneSurface[selectedMeeting.tone]} ${toneText[selectedMeeting.tone]}`}>
                {selectedMeeting.status}
              </span>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-3xl border border-slate-200 p-5">
                <h4 className="mb-4 font-black text-slate-900">دستور جلسه</h4>
                <div className="space-y-3">
                  {selectedMeeting.agenda.map((item) => (
                    <p key={item} className="rounded-2xl bg-slate-50 p-3 text-sm font-bold leading-7 text-slate-600">
                      {item}
                    </p>
                  ))}
                </div>
              </div>
              <div className="rounded-3xl border border-slate-200 p-5">
                <h4 className="mb-4 font-black text-slate-900">تصمیم‌های پیشنهادی</h4>
                <div className="space-y-3">
                  {selectedMeeting.decisions.map((item) => (
                    <p key={item} className="rounded-2xl bg-blue-50 p-3 text-sm font-bold leading-7 text-blue-700">
                      {item}
                    </p>
                  ))}
                </div>
              </div>
              <div className="rounded-3xl border border-slate-200 p-5">
                <h4 className="mb-4 font-black text-slate-900">مالک‌ها</h4>
                <div className="space-y-3">
                  {selectedMeeting.owners.map((item) => (
                    <p key={item} className="rounded-2xl bg-emerald-50 p-3 text-sm font-black text-emerald-700">
                      {item}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "okrReports" && (
        <div className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-xl shadow-slate-200/60 backdrop-blur">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-xl font-black text-slate-900">گزارش‌های OKR و عملکرد</h3>
              <p className="mt-1 text-sm text-slate-500">خلاصه مدیریتی برای مرور هفتگی یا جلسه عملکرد</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
              Report Hub
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-5">
              <p className="text-sm font-black text-emerald-700">گزارش OKR</p>
              <p className="mt-3 text-3xl font-black text-emerald-800">
                {formatPercent(dashboard.progress)}
              </p>
              <p className="mt-2 text-sm leading-7 text-slate-600">
                {formatNumber(dashboard.onTrack)} هدف در مسیر، {formatNumber(dashboard.atRisk)} نیازمند توجه و {formatNumber(dashboard.behind)} عقب‌مانده.
              </p>
            </div>
            <div className="rounded-3xl border border-blue-100 bg-blue-50 p-5">
              <p className="text-sm font-black text-blue-700">گزارش KPI</p>
              <p className="mt-3 text-3xl font-black text-blue-800">
                {formatPercent(dashboard.kpiProgress)}
              </p>
              <p className="mt-2 text-sm leading-7 text-slate-600">
                {formatNumber(dashboard.totalKpis)} شاخص فعال برای سنجش عملکرد تیم و پروژه‌ها.
              </p>
            </div>
            <div className="rounded-3xl border border-purple-100 bg-purple-50 p-5">
              <p className="text-sm font-black text-purple-700">گزارش عملکرد افراد</p>
              <p className="mt-3 text-3xl font-black text-purple-800">
                {dashboard.averageReviewScore > 0 ? formatNumber(dashboard.averageReviewScore) : "—"}
              </p>
              <p className="mt-2 text-sm leading-7 text-slate-600">
                {formatNumber(dashboard.totalReviews)} ارزیابی ثبت شده؛ اعضای بدون ارزیابی باید تکمیل شوند.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 p-5">
              <h4 className="mb-4 font-black text-slate-900">ریسک‌های قابل گزارش</h4>
              <div className="space-y-3">
                {insights.map((item) => (
                  <div key={item.title} className={`rounded-2xl border p-4 ${toneSurface[item.tone]}`}>
                    <p className={`font-black ${toneText[item.tone]}`}>{item.title}</p>
                    <p className="mt-2 text-sm leading-7 text-slate-600">{item.body}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-slate-200 p-5">
              <h4 className="mb-4 font-black text-slate-900">خروجی آماده جلسه مدیریت</h4>
              <div className="space-y-3 text-sm font-bold leading-7 text-slate-600">
                <p className="rounded-2xl bg-slate-50 p-4">
                  پیشرفت کلی OKR برابر {formatPercent(dashboard.progress)} است و {formatNumber(dashboard.totalKeyResults)} نتیجه کلیدی در سیستم ثبت شده.
                </p>
                <p className="rounded-2xl bg-slate-50 p-4">
                  تیم‌های نیازمند پیگیری:{" "}
                  {dashboard.teamRows.filter((team) => team.riskCount > 0).map((team) => team.name).join("، ") || "موردی ثبت نشده است"}.
                </p>
                <p className="rounded-2xl bg-slate-50 p-4">
                  جلسه پیشنهادی بعدی: {meetingPlans[0].title} در {meetingPlans[0].time}.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "kpis" && (
        <div className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-xl shadow-slate-200/60 backdrop-blur">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-xl font-black text-slate-900">KPIها</h3>
              <p className="mt-1 text-sm text-slate-500">شاخص‌های کلیدی عملکرد تیم و پروژه‌ها</p>
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
                      <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusStyle[kpi.status]}`}>
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

                  <p className="text-xs font-bold leading-6 text-slate-400">
                    مسئول: {owner?.name || "نامشخص"} · پروژه: {project?.name || "بدون پروژه"}
                  </p>

                  <div className="mt-5">
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="font-black text-slate-700">
                        {formatNumber(kpi.currentValue)} / {formatNumber(kpi.targetValue)} {kpi.unit}
                      </span>
                      <span className="font-black text-blue-700">{formatPercent(progress)}</span>
                    </div>
                    <ProgressBar value={progress} tone="blue" />
                  </div>
                </div>
              );
            })}

            {kpis.length === 0 && <EmptyState text="هنوز KPI ثبت نشده است." />}
          </div>
        </div>
      )}

      {activeTab === "reviews" && (
        <div className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-xl shadow-slate-200/60 backdrop-blur">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-xl font-black text-slate-900">ارزیابی عملکرد</h3>
              <p className="mt-1 text-sm text-slate-500">ثبت و مرور ارزیابی عملکرد اعضای تیم در دوره‌های مختلف</p>
            </div>
            <button
              onClick={openNewReviewModal}
              className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white"
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
                        <span className={`rounded-full border px-3 py-1 text-xs font-black ${reviewStatusStyle[review.status]}`}>
                          {reviewStatusLabel[review.status]}
                        </span>
                        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
                          {review.period}
                        </span>
                      </div>

                      <h4 className="text-lg font-black text-slate-900">
                        {user?.name || "کاربر نامشخص"}
                      </h4>
                      <p className="mt-1 text-xs font-bold text-slate-400">
                        مدیر ارزیاب: {manager?.name || "نامشخص"}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="rounded-3xl bg-slate-900 px-5 py-4 text-center text-white">
                        <p className="text-xs text-slate-300">امتیاز</p>
                        <p className="text-2xl font-black">{formatNumber(review.score)}</p>
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
                      <p className="mb-2 text-sm font-black text-emerald-700">نقاط قوت</p>
                      <p className="text-sm leading-7 text-slate-600">
                        {review.strengths || "ثبت نشده"}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-amber-50 p-4">
                      <p className="mb-2 text-sm font-black text-amber-700">قابل بهبود</p>
                      <p className="text-sm leading-7 text-slate-600">
                        {review.improvements || "ثبت نشده"}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-blue-50 p-4">
                      <p className="mb-2 text-sm font-black text-blue-700">یادداشت مدیر</p>
                      <p className="text-sm leading-7 text-slate-600">
                        {review.note || "ثبت نشده"}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}

            {reviews.length === 0 && <EmptyState text="هنوز ارزیابی عملکرد ثبت نشده است." />}
          </div>
        </div>
      )}

      {isAiOkrModalOpen && (
        <div
          onMouseDown={() => setIsAiOkrModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
        >
          <div
            onMouseDown={(event) => event.stopPropagation()}
            className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-3xl bg-white p-6 text-right shadow-2xl"
          >
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
              <div>
                <span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-black text-purple-700">
                  راهنمای هوشمند OKR
                </span>
                <h3 className="mt-3 text-2xl font-black text-slate-900">
                  ساخت OKR با پیشنهاد AI
                </h3>
                <p className="mt-2 text-sm leading-7 text-slate-500">
                  هدف خام یا مسئله مدیریتی را بنویس؛ AI یک هدف دقیق‌تر و KRهای قابل سنجش پیشنهاد می‌دهد.
                </p>
              </div>
              <button
                onClick={() => setIsAiOkrModalOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-xl font-black text-slate-500"
              >
                ×
              </button>
            </div>

            <div className="mb-6 grid gap-3 md:grid-cols-2">
              {[
                ["۱", "هدف", aiOkrStep >= 1],
                ["۲", "نتایج کلیدی", aiOkrStep >= 2],
              ].map(([number, label, active]) => (
                <div
                  key={String(label)}
                  className={`rounded-2xl border p-4 ${
                    active
                      ? "border-purple-200 bg-purple-50 text-purple-700"
                      : "border-slate-200 bg-slate-50 text-slate-400"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm font-black">
                      {number}
                    </span>
                    <span className="font-black">{label}</span>
                  </div>
                </div>
              ))}
            </div>

            {aiOkrStep === 1 && (
              <div className="grid gap-5 xl:grid-cols-[1fr_0.75fr]">
                <div className="space-y-4">
                  <input
                    value={aiOkrTitle}
                    onChange={(event) => setAiOkrTitle(event.target.value)}
                    placeholder="هدف یا مسئله؛ مثلا افزایش رشد کاربران فعال ماهانه"
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-purple-500"
                  />
                  <textarea
                    value={aiOkrContext}
                    onChange={(event) => setAiOkrContext(event.target.value)}
                    placeholder="زمینه، مشکل، شاخص فعلی، محدودیت‌ها یا چیزی که مدیریت باید بداند..."
                    className="min-h-32 w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold leading-7 outline-none focus:border-purple-500"
                  />

                  <div className="grid gap-3 md:grid-cols-2">
                    <select
                      value={aiOkrLevel}
                      onChange={(event) => setAiOkrLevel(event.target.value as OKRLevel)}
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none"
                    >
                      <option value="company">شرکتی</option>
                      <option value="team">تیمی</option>
                      <option value="personal">فردی</option>
                    </select>
                    <input
                      value={aiOkrPeriod}
                      onChange={(event) => setAiOkrPeriod(event.target.value)}
                      placeholder="دوره؛ مثلا Q2 2026"
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none"
                    />
                    <select
                      value={aiOkrProjectId || ""}
                      onChange={(event) =>
                        setAiOkrProjectId(event.target.value ? Number(event.target.value) : null)
                      }
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none"
                    >
                      <option value="">بدون پروژه</option>
                      {projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={aiOkrOwnerId || ""}
                      onChange={(event) =>
                        setAiOkrOwnerId(event.target.value ? Number(event.target.value) : null)
                      }
                      className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none"
                    >
                      <option value="">انتخاب مسئول</option>
                      {users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {aiOkrError && (
                    <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-bold leading-7 text-red-700">
                      {aiOkrError}
                    </div>
                  )}

                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      onClick={() => setIsAiOkrModalOpen(false)}
                      className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-black text-slate-600"
                    >
                      انصراف
                    </button>
                    <button
                      onClick={requestAiOkrSuggestion}
                      disabled={aiOkrLoading}
                      className="rounded-2xl bg-purple-600 px-6 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {aiOkrLoading ? "در حال ساخت پیشنهاد..." : "دریافت پیشنهاد AI"}
                    </button>
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <h4 className="text-lg font-black text-slate-900">راهنمای نوشتن هدف خوب</h4>
                  <div className="mt-4 space-y-3 text-sm font-bold leading-7 text-slate-600">
                    <p className="rounded-2xl bg-white p-3">هدف باید واضح و نتیجه‌محور باشد.</p>
                    <p className="rounded-2xl bg-white p-3">KRها باید عدد شروع، عدد هدف و واحد داشته باشند.</p>
                    <p className="rounded-2xl bg-white p-3">اگر زمینه دقیق‌تر بنویسی، پیشنهاد AI قابل استفاده‌تر می‌شود.</p>
                  </div>
                  <div className="mt-5 rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm font-bold leading-7 text-amber-700">
                    این دکمه فقط وقتی کلیک شود درخواست AI می‌زند. اگر کلید OpenAI تنظیم نشده باشد، پیشنهاد داخلی سیستم نمایش داده می‌شود.
                  </div>
                </div>
              </div>
            )}

            {aiOkrStep === 2 && aiOkrSuggestion && (
              <div className="grid gap-5 xl:grid-cols-[1fr_0.75fr]">
                <div className="space-y-4">
                  <div className="rounded-3xl border border-purple-100 bg-purple-50 p-5">
                    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-purple-700">
                          {aiOkrSource === "openai" ? "پیشنهاد OpenAI" : "پیشنهاد داخلی"}
                        </span>
                        <h4 className="mt-3 text-xl font-black text-slate-900">
                          {aiOkrSuggestion.title}
                        </h4>
                      </div>
                      <span className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-purple-700">
                        اطمینان {formatPercent(aiOkrSuggestion.confidence)}
                      </span>
                    </div>
                    <p className="text-sm font-bold leading-7 text-slate-600">
                      {aiOkrSuggestion.description}
                    </p>
                    <p className="mt-4 rounded-2xl bg-white p-4 text-sm font-bold leading-7 text-slate-600">
                      {aiOkrSuggestion.rationale}
                    </p>
                  </div>

                  <div className="rounded-3xl border border-slate-200 p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <h4 className="text-lg font-black text-slate-900">نتایج کلیدی پیشنهادی</h4>
                      <span className="text-xs font-black text-slate-400">
                        {formatNumber(aiOkrSelectedKr.length)} مورد انتخاب شده
                      </span>
                    </div>
                    <div className="space-y-3">
                      {aiOkrSuggestion.keyResults.map((keyResult, index) => {
                        const checked = aiOkrSelectedKr.includes(index);

                        return (
                          <label
                            key={`${keyResult.title}-${index}`}
                            className={`block cursor-pointer rounded-2xl border p-4 ${
                              checked
                                ? "border-purple-200 bg-purple-50"
                                : "border-slate-200 bg-white"
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <input
                                checked={checked}
                                onChange={() =>
                                  setAiOkrSelectedKr((current) =>
                                    current.includes(index)
                                      ? current.filter((item) => item !== index)
                                      : [...current, index]
                                  )
                                }
                                type="checkbox"
                                className="mt-1 h-4 w-4 accent-purple-600"
                              />
                              <div className="min-w-0 flex-1">
                                <p className="font-black text-slate-900">{keyResult.title}</p>
                                <p className="mt-2 text-xs font-bold text-slate-500">
                                  شروع {formatNumber(keyResult.startValue)} · هدف{" "}
                                  {formatNumber(keyResult.targetValue)} {keyResult.unit} · وزن{" "}
                                  {formatNumber(keyResult.weight)} · اطمینان{" "}
                                  {formatPercent(keyResult.confidence)}
                                </p>
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      onClick={() => setAiOkrStep(1)}
                      className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-black text-slate-600"
                    >
                      بازگشت
                    </button>
                    <button
                      onClick={createOkrFromAiSuggestion}
                      disabled={aiOkrSelectedKr.length === 0}
                      className="rounded-2xl bg-purple-600 px-6 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      ثبت OKR و KRها
                    </button>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-5">
                    <h4 className="font-black text-emerald-800">چک‌پوینت‌های خوب</h4>
                    <div className="mt-4 space-y-3">
                      {aiOkrSuggestion.checkpoints.map((item) => (
                        <p key={item} className="rounded-2xl bg-white p-3 text-sm font-bold leading-7 text-slate-600">
                          {item}
                        </p>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-red-100 bg-red-50 p-5">
                    <h4 className="font-black text-red-800">ریسک‌های احتمالی</h4>
                    <div className="mt-4 space-y-3">
                      {aiOkrSuggestion.risks.map((item) => (
                        <p key={item} className="rounded-2xl bg-white p-3 text-sm font-bold leading-7 text-slate-600">
                          {item}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {isObjectiveModalOpen && (
        <div
          onMouseDown={() => setIsObjectiveModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
        >
          <div
            onMouseDown={(event) => event.stopPropagation()}
            className="w-full max-w-2xl rounded-3xl bg-white p-6 text-right shadow-2xl"
          >
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h3 className="text-2xl font-black text-slate-900">
                  {editingObjectiveId ? "ویرایش هدف" : "ساخت OKR جدید"}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  هدف را تعریف کن و بعد برایش نتیجه کلیدی بساز.
                </p>
              </div>
              <button
                onClick={() => setIsObjectiveModalOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-xl font-black text-slate-500"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <input
                value={objectiveTitle}
                onChange={(event) => setObjectiveTitle(event.target.value)}
                placeholder="عنوان هدف؛ مثلا افزایش رضایت کاربران داخلی"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-blue-500"
              />

              <textarea
                value={objectiveDescription}
                onChange={(event) => setObjectiveDescription(event.target.value)}
                placeholder="توضیح هدف..."
                className="min-h-28 w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold leading-7 outline-none focus:border-blue-500"
              />

              <div className="grid gap-3 md:grid-cols-2">
                <select
                  value={objectiveLevel}
                  onChange={(event) => setObjectiveLevel(event.target.value as OKRLevel)}
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none"
                >
                  <option value="company">شرکتی</option>
                  <option value="team">تیمی</option>
                  <option value="personal">فردی</option>
                </select>

                <select
                  value={objectiveStatus}
                  onChange={(event) => setObjectiveStatus(event.target.value as OKRStatus)}
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none"
                >
                  <option value="on_track">در مسیر</option>
                  <option value="at_risk">نیازمند توجه</option>
                  <option value="behind">عقب‌مانده</option>
                  <option value="closed">بسته‌شده</option>
                </select>

                <select
                  value={objectiveOwnerId || ""}
                  onChange={(event) =>
                    setObjectiveOwnerId(event.target.value ? Number(event.target.value) : null)
                  }
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none"
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
                  onChange={(event) =>
                    setObjectiveProjectId(event.target.value ? Number(event.target.value) : null)
                  }
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none"
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
                  onChange={(event) => setObjectivePeriod(event.target.value)}
                  placeholder="دوره؛ مثلا Q1 2026"
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-blue-500 md:col-span-2"
                />
              </div>

              <div className="flex justify-end">
                <button
                  onClick={saveObjective}
                  className="rounded-2xl bg-blue-600 px-8 py-4 text-sm font-black text-white shadow-lg shadow-blue-100"
                >
                  ذخیره هدف
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isKeyResultModalOpen && (
        <div
          onMouseDown={() => setIsKeyResultModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
        >
          <div
            onMouseDown={(event) => event.stopPropagation()}
            className="w-full max-w-xl rounded-3xl bg-white p-6 text-right shadow-2xl"
          >
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h3 className="text-2xl font-black text-slate-900">افزودن نتیجه کلیدی</h3>
                <p className="mt-1 text-sm text-slate-500">
                  نتیجه کلیدی باید قابل اندازه‌گیری باشد.
                </p>
              </div>
              <button
                onClick={() => setIsKeyResultModalOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-xl font-black text-slate-500"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <input
                value={keyResultTitle}
                onChange={(event) => setKeyResultTitle(event.target.value)}
                placeholder="مثلا کاهش زمان رفع باگ از ۴۸ ساعت به ۲۴ ساعت"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-blue-500"
              />

              <div className="grid gap-3 md:grid-cols-2">
                <input
                  value={keyResultStartValue}
                  onChange={(event) => setKeyResultStartValue(Number(event.target.value || 0))}
                  type="number"
                  placeholder="مقدار شروع"
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none"
                />
                <input
                  value={keyResultCurrentValue}
                  onChange={(event) => setKeyResultCurrentValue(Number(event.target.value || 0))}
                  type="number"
                  placeholder="مقدار فعلی"
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none"
                />
                <input
                  value={keyResultTargetValue}
                  onChange={(event) => setKeyResultTargetValue(Number(event.target.value || 0))}
                  type="number"
                  placeholder="مقدار هدف"
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none"
                />
                <input
                  value={keyResultUnit}
                  onChange={(event) => setKeyResultUnit(event.target.value)}
                  placeholder="واحد؛ ٪، ساعت، عدد، نفر"
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none"
                />
                <input
                  value={keyResultWeight}
                  onChange={(event) => setKeyResultWeight(Number(event.target.value || 1))}
                  type="number"
                  min={1}
                  placeholder="وزن"
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none md:col-span-2"
                />
              </div>

              <div className="rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-500">
                پیشرفت محاسبه‌شده:{" "}
                <span className="font-black text-blue-700">
                  {formatPercent(
                    calculateProgress(
                      keyResultStartValue,
                      keyResultCurrentValue,
                      keyResultTargetValue
                    )
                  )}
                </span>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={saveKeyResult}
                  className="rounded-2xl bg-blue-600 px-8 py-4 text-sm font-black text-white"
                >
                  ذخیره KR
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isKpiModalOpen && (
        <div
          onMouseDown={() => setIsKpiModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
        >
          <div
            onMouseDown={(event) => event.stopPropagation()}
            className="w-full max-w-xl rounded-3xl bg-white p-6 text-right shadow-2xl"
          >
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h3 className="text-2xl font-black text-slate-900">ساخت KPI</h3>
                <p className="mt-1 text-sm text-slate-500">
                  شاخص کلیدی عملکرد را برای تیم یا پروژه ثبت کن.
                </p>
              </div>
              <button
                onClick={() => setIsKpiModalOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-xl font-black text-slate-500"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <input
                value={kpiTitle}
                onChange={(event) => setKpiTitle(event.target.value)}
                placeholder="عنوان KPI"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-blue-500"
              />

              <div className="grid gap-3 md:grid-cols-2">
                <select
                  value={kpiOwnerId || ""}
                  onChange={(event) =>
                    setKpiOwnerId(event.target.value ? Number(event.target.value) : null)
                  }
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none"
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
                  onChange={(event) =>
                    setKpiProjectId(event.target.value ? Number(event.target.value) : null)
                  }
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none"
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
                  onChange={(event) => setKpiCurrentValue(Number(event.target.value || 0))}
                  type="number"
                  placeholder="مقدار فعلی"
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none"
                />
                <input
                  value={kpiTargetValue}
                  onChange={(event) => setKpiTargetValue(Number(event.target.value || 0))}
                  type="number"
                  placeholder="مقدار هدف"
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none"
                />
                <input
                  value={kpiUnit}
                  onChange={(event) => setKpiUnit(event.target.value)}
                  placeholder="واحد"
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none"
                />
                <select
                  value={kpiStatus}
                  onChange={(event) => setKpiStatus(event.target.value as OKRStatus)}
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none"
                >
                  <option value="on_track">در مسیر</option>
                  <option value="at_risk">نیازمند توجه</option>
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
        <div
          onMouseDown={() => setIsReviewModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
        >
          <div
            onMouseDown={(event) => event.stopPropagation()}
            className="w-full max-w-2xl rounded-3xl bg-white p-6 text-right shadow-2xl"
          >
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h3 className="text-2xl font-black text-slate-900">
                  ثبت ارزیابی عملکرد
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  ارزیابی دوره‌ای کاربر را ثبت کن.
                </p>
              </div>
              <button
                onClick={() => setIsReviewModalOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-xl font-black text-slate-500"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <select
                  value={reviewUserId || ""}
                  onChange={(event) =>
                    setReviewUserId(event.target.value ? Number(event.target.value) : null)
                  }
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none"
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
                  onChange={(event) =>
                    setReviewManagerId(event.target.value ? Number(event.target.value) : null)
                  }
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none"
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
                  onChange={(event) => setReviewPeriod(event.target.value)}
                  placeholder="دوره؛ مثلا Q1 2026"
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none"
                />
                <input
                  value={reviewScore}
                  onChange={(event) => setReviewScore(Number(event.target.value || 0))}
                  type="number"
                  min={0}
                  max={100}
                  placeholder="امتیاز"
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none"
                />
                <select
                  value={reviewStatus}
                  onChange={(event) => setReviewStatus(event.target.value as ReviewStatus)}
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none md:col-span-2"
                >
                  <option value="draft">پیش‌نویس</option>
                  <option value="submitted">ارسال‌شده</option>
                  <option value="approved">تأییدشده</option>
                </select>
              </div>

              <textarea
                value={reviewStrengths}
                onChange={(event) => setReviewStrengths(event.target.value)}
                placeholder="نقاط قوت..."
                className="min-h-24 w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold leading-7 outline-none"
              />
              <textarea
                value={reviewImprovements}
                onChange={(event) => setReviewImprovements(event.target.value)}
                placeholder="موارد قابل بهبود..."
                className="min-h-24 w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold leading-7 outline-none"
              />
              <textarea
                value={reviewNote}
                onChange={(event) => setReviewNote(event.target.value)}
                placeholder="توضیحات تکمیلی..."
                className="min-h-24 w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold leading-7 outline-none"
              />

              <div className="flex justify-end">
                <button
                  onClick={saveReview}
                  className="rounded-2xl bg-blue-600 px-8 py-4 text-sm font-black text-white"
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
