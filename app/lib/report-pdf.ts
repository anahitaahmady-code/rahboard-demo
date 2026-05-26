import { readFile } from "node:fs/promises";
import path from "node:path";

import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

import type { SprintReport } from "./reporting";

type PdfReport = {
  buffer: Buffer;
  fileName: string;
  subject: string;
};

const clamp = (value: number, min = 0, max = 100) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0));

const faNumber = (value: number) => new Intl.NumberFormat("fa-IR").format(value);

const faHours = (value: number) =>
  `${faNumber(Math.round(value * 10) / 10)} ساعت`;

const faMinutesToHours = (minutes: number) => faHours(minutes / 60);

const cleanName = (value?: string | null) => {
  const text = String(value || "").trim();
  return text && text !== "undefined" ? text : "نامشخص";
};

const escapeHtml = (value: string | number) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatDate = (value?: string | null) => {
  if (!value || value === "-") return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("fa-IR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
};

const statusLabel = (status: string) => {
  const normalized = status.toLowerCase();
  if (normalized.includes("progress")) return "در حال انجام";

  const labels: Record<string, string> = {
    todo: "باز",
    open: "باز",
    planned: "برنامه‌ریزی",
    review: "بازبینی",
    qa: "تست",
    done: "انجام‌شده",
    closed: "بسته‌شده",
    resolved: "حل‌شده",
  };

  return labels[normalized] || status || "-";
};

const reviewFlagLabel = (flag: string) => {
  if (flag.includes("No timer-backed")) return "ثبت ساعت بدون تایمر انجام شده است.";
  if (flag.includes("No daily activity")) return "برای این زمان، شاهد فعالیت روزانه ثبت نشده است.";
  if (flag.includes("low evidence")) return "اعتبار شواهد پایین است و نیاز به بررسی دارد.";
  if (flag.includes("Manual logs are high")) return "سهم ثبت دستی نسبت به تایمر بالا است.";
  return flag;
};

const loadFontFace = async () => {
  try {
    const fontPath = path.join(
      process.cwd(),
      "public",
      "fonts",
      "IRANYEKANXFANUM-BOLD.woff2"
    );
    const font = await readFile(fontPath);
    const dataUrl = `data:font/woff2;base64,${font.toString("base64")}`;

    return `
      @font-face {
        font-family: RahBoard;
        src: url("${dataUrl}") format("woff2");
        font-weight: 700;
        font-style: normal;
        font-display: swap;
      }
    `;
  } catch {
    return "";
  }
};

const metricCard = (label: string, value: string, helper: string, tone: string) => `
  <section class="metric metric-${tone}">
    <span>${escapeHtml(label)}</span>
    <strong>${escapeHtml(value)}</strong>
    <small>${escapeHtml(helper)}</small>
  </section>
`;

const bar = (value: number, max: number, color: string) => {
  const width = max > 0 ? clamp((value / max) * 100) : 0;
  return `<div class="bar"><i style="width:${width}%;background:${color}"></i></div>`;
};

const buildSummary = (report: SprintReport) => {
  const totalRisk = report.totals.openOverdue + report.totals.lateCompleted;
  const deadlineText =
    report.totals.deadlineChanges > 0
      ? `${faNumber(report.totals.deadlineChanges)} تغییر ددلاین ثبت شده است`
      : "تغییر ددلاین در این اسپرینت ثبت نشده است";

  return [
    `در اسپرینت ${report.sprint?.name || "فعلی"}، ${faNumber(report.totals.done)} از ${faNumber(report.totals.tasks)} تسک تکمیل شده و پیشرفت کلی ${faNumber(report.totals.progress)}٪ است.`,
    totalRisk > 0
      ? `${faNumber(totalRisk)} تسک از نظر ددلاین نیازمند توجه مدیریت است.`
      : "در حال حاضر تسک عقب‌افتاده‌ای در گزارش دیده نمی‌شود.",
    `${deadlineText} و مجموع زمان ثبت‌شده ${faHours(report.totals.loggedHours)} است.`,
  ].join(" ");
};

const buildDeveloperRows = (report: SprintReport) => {
  const maxLogged = Math.max(
    1,
    ...report.developerWork.map((item) => item.loggedMinutes)
  );

  if (!report.developerWork.length) {
    return `<tr><td colspan="6">برای اعضای تیم، ساعت کاری در این اسپرینت ثبت نشده است.</td></tr>`;
  }

  return report.developerWork
    .map((item) => {
      const flags = item.reviewFlags.length
        ? item.reviewFlags.map(reviewFlagLabel).join(" ")
        : "عادی";

      return `
        <tr>
          <td>${escapeHtml(cleanName(item.userName))}</td>
          <td>${faNumber(item.doneCount)} از ${faNumber(item.taskCount)}</td>
          <td>${faMinutesToHours(item.loggedMinutes)}</td>
          <td>${bar(item.loggedMinutes, maxLogged, "#2563eb")}</td>
          <td>${item.averageConfidence ? `${faNumber(item.averageConfidence)}٪` : "نامشخص"}</td>
          <td class="${item.reviewFlags.length ? "risk-text" : ""}">${escapeHtml(flags)}</td>
        </tr>
      `;
    })
    .join("");
};

const buildOverdueRows = (report: SprintReport) => {
  if (!report.overdueTasks.length) {
    return `<tr><td colspan="5">تسک عقب‌افتاده‌ای ثبت نشده است.</td></tr>`;
  }

  return report.overdueTasks
    .map(
      (task) => `
        <tr>
          <td>${escapeHtml(task.code)}</td>
          <td>${escapeHtml(task.title)}</td>
          <td>${escapeHtml(cleanName(task.assignee))}</td>
          <td>${escapeHtml(formatDate(task.deadline))}</td>
          <td>${escapeHtml(statusLabel(task.status))}</td>
        </tr>
      `
    )
    .join("");
};

const buildDeadlineRows = (report: SprintReport) => {
  if (!report.changedDeadlines.length) {
    return `<tr><td colspan="5">در این اسپرینت تغییر ددلاین ثبت نشده است.</td></tr>`;
  }

  return report.changedDeadlines
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.code)}</td>
          <td>${escapeHtml(item.title)}</td>
          <td>${escapeHtml(formatDate(item.previousDeadline))}</td>
          <td>${escapeHtml(formatDate(item.nextDeadline))}</td>
          <td>${escapeHtml(cleanName(item.changedBy))}</td>
        </tr>
      `
    )
    .join("");
};

const buildTaskRows = (report: SprintReport) => {
  if (!report.taskRows.length) {
    return `<tr><td colspan="7">تسکی برای این اسپرینت ثبت نشده است.</td></tr>`;
  }

  return report.taskRows
    .map(
      (task) => `
        <tr>
          <td>${escapeHtml(task.code)}</td>
          <td>${escapeHtml(task.title)}</td>
          <td>${escapeHtml(cleanName(task.assignee))}</td>
          <td>${escapeHtml(statusLabel(task.status))}</td>
          <td>${escapeHtml(formatDate(task.deadline))}</td>
          <td>${faHours(task.estimatedHours)}</td>
          <td>${faHours(task.loggedHours)}</td>
        </tr>
      `
    )
    .join("");
};

const buildReportHtml = async (report: SprintReport) => {
  const fontFace = await loadFontFace();
  const progress = clamp(report.totals.progress);
  const progressDegrees = progress * 3.6;
  const totalRisk = report.totals.openOverdue + report.totals.lateCompleted;
  const subject = `گزارش اسپرینت ${report.sprint?.name || "RahBoard"}`;

  return `<!doctype html>
  <html lang="fa" dir="rtl">
    <head>
      <meta charset="utf-8" />
      <style>
        ${fontFace}
        * { box-sizing: border-box; }
        body {
          margin: 0;
          background: #f6f8fb;
          color: #172033;
          direction: rtl;
          font-family: RahBoard, Tahoma, Arial, sans-serif;
          font-size: 13px;
          line-height: 1.85;
        }
        .page {
          width: 100%;
          min-height: 100vh;
          padding: 26px;
        }
        .hero {
          overflow: hidden;
          border-radius: 24px;
          background: linear-gradient(135deg, #0f172a, #164e63 55%, #047857);
          color: white;
          padding: 30px;
          position: relative;
        }
        .hero::after {
          content: "";
          position: absolute;
          left: -90px;
          top: -90px;
          width: 250px;
          height: 250px;
          border-radius: 999px;
          background: rgba(255,255,255,0.12);
        }
        .hero h1 {
          margin: 0 0 10px;
          font-size: 30px;
          letter-spacing: 0;
        }
        .hero p { margin: 0; color: #d8f3ee; max-width: 680px; }
        .meta {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
          margin-top: 22px;
        }
        .meta div {
          border: 1px solid rgba(255,255,255,0.18);
          border-radius: 16px;
          padding: 10px 14px;
          background: rgba(255,255,255,0.1);
        }
        .meta span { display: block; color: #a7f3d0; font-size: 11px; }
        .meta strong { display: block; margin-top: 2px; color: white; }
        .metrics {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          margin: 18px 0;
        }
        .metric {
          border-radius: 20px;
          border: 1px solid #e5eaf1;
          background: white;
          padding: 16px;
          min-height: 112px;
        }
        .metric span { display: block; color: #64748b; font-size: 11px; }
        .metric strong { display: block; margin-top: 8px; font-size: 25px; color: #0f172a; }
        .metric small { display: block; margin-top: 6px; color: #64748b; }
        .metric-green strong { color: #047857; }
        .metric-blue strong { color: #2563eb; }
        .metric-red strong { color: #dc2626; }
        .metric-amber strong { color: #b45309; }
        .grid {
          display: grid;
          grid-template-columns: 0.8fr 1.2fr;
          gap: 14px;
          margin-bottom: 16px;
        }
        .card {
          border: 1px solid #e5eaf1;
          border-radius: 22px;
          background: white;
          padding: 18px;
          break-inside: avoid;
        }
        .card h2 {
          margin: 0 0 12px;
          font-size: 17px;
          color: #0f172a;
        }
        .summary {
          color: #334155;
          font-size: 14px;
        }
        .donut-wrap {
          display: flex;
          align-items: center;
          gap: 18px;
        }
        .donut {
          width: 150px;
          height: 150px;
          border-radius: 50%;
          background: conic-gradient(#10b981 ${progressDegrees}deg, #e2e8f0 0deg);
          display: grid;
          place-items: center;
          flex: 0 0 auto;
        }
        .donut::before {
          content: "${faNumber(progress)}٪";
          width: 106px;
          height: 106px;
          border-radius: 50%;
          background: white;
          display: grid;
          place-items: center;
          color: #047857;
          font-size: 24px;
        }
        .legend {
          display: grid;
          gap: 8px;
          color: #475569;
        }
        .legend b { color: #0f172a; }
        table {
          width: 100%;
          border-collapse: collapse;
          overflow: hidden;
          border-radius: 16px;
          font-size: 11px;
        }
        th {
          background: #f1f5f9;
          color: #475569;
          padding: 9px;
          text-align: right;
          white-space: nowrap;
        }
        td {
          border-top: 1px solid #edf2f7;
          padding: 9px;
          color: #1f2937;
          vertical-align: top;
        }
        .bar {
          width: 120px;
          height: 9px;
          border-radius: 999px;
          background: #e2e8f0;
          overflow: hidden;
        }
        .bar i {
          display: block;
          height: 100%;
          border-radius: 999px;
        }
        .risk-text { color: #b45309; }
        .section { margin-top: 16px; }
        .footer {
          margin-top: 20px;
          color: #64748b;
          font-size: 10px;
          text-align: center;
        }
      </style>
    </head>
    <body>
      <main class="page">
        <section class="hero">
          <h1>${escapeHtml(subject)}</h1>
          <p>${escapeHtml(buildSummary(report))}</p>
          <div class="meta">
            <div><span>پروژه</span><strong>${escapeHtml(report.project?.name || "نامشخص")}</strong></div>
            <div><span>تاریخ تولید گزارش</span><strong>${escapeHtml(formatDate(report.generatedAt))}</strong></div>
            <div><span>بازه اسپرینت</span><strong>${escapeHtml(formatDate(report.sprint?.startDate))} تا ${escapeHtml(formatDate(report.sprint?.endDate))}</strong></div>
          </div>
        </section>

        <section class="metrics">
          ${metricCard("پیشرفت", `${faNumber(progress)}٪`, `${faNumber(report.totals.done)} از ${faNumber(report.totals.tasks)} تسک`, "green")}
          ${metricCard("تسک‌های باز", faNumber(report.totals.open), "تسک هنوز کامل نشده", "blue")}
          ${metricCard("ریسک ددلاین", faNumber(totalRisk), "عقب‌افتاده یا دیر تکمیل‌شده", "red")}
          ${metricCard("ساعت ثبت‌شده", faHours(report.totals.loggedHours), `${faHours(report.totals.estimatedHours)} برآورد`, "amber")}
        </section>

        <section class="grid">
          <div class="card">
            <h2>نمودار پیشرفت</h2>
            <div class="donut-wrap">
              <div class="donut"></div>
              <div class="legend">
                <div><b>${faNumber(report.totals.done)}</b> تسک انجام‌شده</div>
                <div><b>${faNumber(report.totals.open)}</b> تسک باز</div>
                <div><b>${faNumber(report.totals.deadlineChanges)}</b> تغییر ددلاین</div>
              </div>
            </div>
          </div>
          <div class="card">
            <h2>خلاصه مدیریتی</h2>
            <p class="summary">${escapeHtml(buildSummary(report))}</p>
          </div>
        </section>

        <section class="card section">
          <h2>ساعت کار و اعتبارسنجی اعضا</h2>
          <table>
            <thead>
              <tr>
                <th>عضو تیم</th>
                <th>تسک‌ها</th>
                <th>ساعت ثبت‌شده</th>
                <th>نمودار ساعت</th>
                <th>اعتماد</th>
                <th>وضعیت بررسی</th>
              </tr>
            </thead>
            <tbody>${buildDeveloperRows(report)}</tbody>
          </table>
        </section>

        <section class="card section">
          <h2>تسک‌های عقب‌افتاده</h2>
          <table>
            <thead>
              <tr>
                <th>کد</th>
                <th>عنوان</th>
                <th>مسئول</th>
                <th>ددلاین</th>
                <th>وضعیت</th>
              </tr>
            </thead>
            <tbody>${buildOverdueRows(report)}</tbody>
          </table>
        </section>

        <section class="card section">
          <h2>تغییرات ددلاین</h2>
          <table>
            <thead>
              <tr>
                <th>کد</th>
                <th>عنوان</th>
                <th>ددلاین قبلی</th>
                <th>ددلاین جدید</th>
                <th>ثبت‌کننده</th>
              </tr>
            </thead>
            <tbody>${buildDeadlineRows(report)}</tbody>
          </table>
        </section>

        <section class="card section">
          <h2>جزئیات تسک‌ها</h2>
          <table>
            <thead>
              <tr>
                <th>کد</th>
                <th>عنوان</th>
                <th>مسئول</th>
                <th>وضعیت</th>
                <th>ددلاین</th>
                <th>برآورد</th>
                <th>ثبت‌شده</th>
              </tr>
            </thead>
            <tbody>${buildTaskRows(report)}</tbody>
          </table>
        </section>

        <p class="footer">RahBoard - گزارش خودکار مدیریت اسپرینت</p>
      </main>
    </body>
  </html>`;
};

const launchPdfBrowser = async () => {
  const executablePath =
    process.env.PUPPETEER_EXECUTABLE_PATH || (await chromium.executablePath());

  return puppeteer.launch({
    args: [...chromium.args, "--hide-scrollbars", "--disable-web-security"],
    defaultViewport: {
      width: 1280,
      height: 900,
    },
    executablePath,
    headless: true,
  });
};

export async function buildSprintReportPdf(report: SprintReport): Promise<PdfReport> {
  const subject = `گزارش اسپرینت ${report.sprint?.name || "RahBoard"}`;
  const safeName = (report.sprint?.name || "rahboard")
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  const html = await buildReportHtml(report);
  const browser = await launchPdfBrowser();

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await new Promise((resolve) => setTimeout(resolve, 250));
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "12mm",
        right: "10mm",
        bottom: "12mm",
        left: "10mm",
      },
    });
    await page.close();

    return {
      buffer: Buffer.from(pdf),
      fileName: `rahboard-sprint-report-${safeName || "report"}.pdf`,
      subject,
    };
  } finally {
    await browser.close();
  }
}
