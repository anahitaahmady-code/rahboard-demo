"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

type TelegramTaskFormProps = {
  token: string;
};

type CreatedTask = {
  code: string;
  title: string;
};

type SubmitState = "idle" | "submitting" | "success" | "error";

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready?: () => void;
        expand?: () => void;
        close?: () => void;
        HapticFeedback?: {
          notificationOccurred?: (type: "success" | "error" | "warning") => void;
        };
      };
    };
  }
}

export default function TelegramTaskForm({ token }: TelegramTaskFormProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [state, setState] = useState<SubmitState>("idle");
  const [message, setMessage] = useState("");
  const [createdTask, setCreatedTask] = useState<CreatedTask | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const webApp = window.Telegram?.WebApp;

    webApp?.ready?.();
    webApp?.expand?.();
    titleInputRef.current?.focus();
  }, []);

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setMessage("");
    setCreatedTask(null);
    setState("idle");
    window.setTimeout(() => titleInputRef.current?.focus(), 0);
  };

  const submitTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!token) {
      setState("error");
      setMessage("این لینک معتبر نیست. از کانال دوباره روی ثبت تسک بزن.");
      return;
    }

    const trimmedTitle = title.trim();

    if (!trimmedTitle) {
      setState("error");
      setMessage("عنوان تسک را وارد کن.");
      titleInputRef.current?.focus();
      return;
    }

    setState("submitting");
    setMessage("");

    try {
      const endpoint = new URL("../api/telegram/tasks/", window.location.href);
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          title: trimmedTitle,
          description: description.trim(),
        }),
      });
      const result = (await response.json()) as {
        ok?: boolean;
        error?: string;
        task?: CreatedTask;
      };

      if (!response.ok || !result.ok || !result.task) {
        throw new Error(result.error || "ثبت تسک انجام نشد.");
      }

      setCreatedTask(result.task);
      setState("success");
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.("success");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "ثبت تسک انجام نشد.");
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.("error");
    }
  };

  const isSubmitting = state === "submitting";
  const canSubmit = Boolean(token && title.trim() && !isSubmitting);

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-[#f5f7fb] px-4 py-5 text-slate-950"
    >
      <div className="mx-auto flex min-h-[calc(100vh-40px)] w-full max-w-md flex-col justify-center">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-blue-700">Rahboard Telegram</p>
              <h1 className="mt-1 text-xl font-black">ثبت تسک</h1>
            </div>
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-slate-950 text-sm font-black text-white">
              RB
            </div>
          </div>

          {state === "success" && createdTask ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-black text-emerald-800">
                  تسک با موفقیت ساخته شد.
                </p>
                <p className="mt-2 text-sm leading-7 text-emerald-900">
                  {createdTask.code} - {createdTask.title}
                </p>
              </div>

              <button
                type="button"
                onClick={resetForm}
                className="h-12 w-full rounded-lg bg-slate-950 text-sm font-black text-white transition hover:bg-slate-800"
              >
                ثبت تسک جدید
              </button>
            </div>
          ) : (
            <form onSubmit={submitTask} className="space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-700">
                  عنوان
                </span>
                <input
                  ref={titleInputRef}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={160}
                  className="h-12 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-bold outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                  placeholder="مثلا: خطای پرداخت در صفحه سفارش"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-700">
                  توضیحات
                </span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={4000}
                  rows={7}
                  className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm leading-7 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                  placeholder="مشکل، لینک، اسکرین‌شات یا هر توضیحی که برای تیم لازم است..."
                />
                <span className="mt-1 block text-left text-xs text-slate-400">
                  {description.length}/4000
                </span>
              </label>

              {state === "error" && message && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold leading-7 text-red-700">
                  {message}
                </div>
              )}

              {!token && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-bold leading-7 text-amber-800">
                  لینک فرم نامعتبر است. از کانال دوباره روی دکمه ثبت تسک بزن.
                </div>
              )}

              <button
                type="submit"
                disabled={!canSubmit}
                className="h-12 w-full rounded-lg bg-blue-700 text-sm font-black text-white transition enabled:hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {isSubmitting ? "در حال ثبت..." : "ثبت تسک"}
              </button>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
