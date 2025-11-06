"use client";

import { FormEvent, KeyboardEvent, useMemo, useRef, useState } from "react";
import {
  WORKFLOWS,
  Workflow,
  formatWorkflowHeadline,
  describeWorkflowSteps,
  getWorkflowByQuery,
} from "@/lib/workflows";

type Message = {
  id: string;
  role: "assistant" | "user";
  content: string;
};

type ActiveRun = {
  workflow: Workflow;
  currentStepIndex: number;
  completedStepIds: string[];
  startedAt: string;
  notes: string[];
};

type RunRecord = {
  workflow: Workflow;
  startedAt: string;
  completedAt: string;
  completedStepIds: string[];
  notes: string[];
  status: "completed" | "cancelled" | "in-progress";
};

type AssistantResult = {
  replies: Message[];
  nextRun: ActiveRun | null;
  completedRun?: RunRecord;
};

const createId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
};

const createMessage = (role: Message["role"], content: string): Message => ({
  id: createId(),
  role,
  content,
});

const formatWorkflowList = () =>
  WORKFLOWS.map(
    (wf) => `• ${wf.name} — ${wf.summary}
  Success metrics: ${wf.metrics.join("; ")}`
  ).join("\n\n");

const findWorkflowFromText = (text: string): Workflow | undefined => {
  const lower = text.toLowerCase();
  const direct = WORKFLOWS.find((wf) => lower.includes(wf.name.toLowerCase()));
  if (direct) return direct;
  return getWorkflowByQuery(text);
};

const formatActiveStep = (run: ActiveRun) => {
  const step = run.workflow.steps[run.currentStepIndex];
  return [
    `Step ${run.currentStepIndex + 1}/${run.workflow.steps.length}: ${
      step.title
    }`,
    step.description,
    `Owner: ${step.owner}`,
    step.duration ? `Timing: ${step.duration}` : "",
    step.outputs?.length
      ? `Expected outputs: ${step.outputs.join(", ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
};

const buildStatusMessage = (run: ActiveRun) => {
  const total = run.workflow.steps.length;
  const completed = run.completedStepIds.length;
  const progress = Math.round((completed / total) * 100);
  const nextStep =
    run.workflow.steps[Math.min(run.currentStepIndex, total - 1)];

  return [
    `${run.workflow.name} is ${progress}% complete (${completed}/${total} steps).`,
    `Current focus: ${nextStep.title} (${nextStep.owner})`,
    nextStep.description,
    run.notes.length
      ? `Notes captured: ${run.notes.slice(-3).join(" • ")}`
      : "Notes captured: none yet.",
  ].join("\n");
};

const formatRunSummary = (record: RunRecord) => {
  const total = record.workflow.steps.length;
  const completedCount = record.completedStepIds.length;
  const completedTitles = record.completedStepIds
    .map((stepId) =>
      record.workflow.steps.find((step) => step.id === stepId)
    )
    .filter(Boolean)
    .map((step) => step!.title)
    .join(" → ");
  const header =
    record.status === "completed"
      ? `Workflow "${record.workflow.name}" finished successfully.`
      : record.status === "cancelled"
      ? `Workflow "${record.workflow.name}" was cancelled.`
      : `Workflow "${record.workflow.name}" is still in progress.`;

  return [
    header,
    `Started: ${new Date(record.startedAt).toLocaleString()}`,
    `${
      record.status === "in-progress" ? "Snapshot" : "Closed"
    }: ${new Date(record.completedAt).toLocaleString()}`,
    `Progress: ${completedCount}/${total} steps (${Math.round(
      (completedCount / total) * 100
    )}%)`,
    `Steps completed: ${
      completedTitles ? completedTitles : "none"
    }`,
    record.notes.length
      ? `Captured notes:\n• ${record.notes.join("\n• ")}`
      : "No notes were captured during this run.",
  ]
    .filter(Boolean)
    .join("\n");
};

const deriveQuickActions = (run: ActiveRun | null): string[] => {
  if (!run) {
    return [
      "List workflows",
      "Start Employee Onboarding",
      "Start Incident Response",
      "Show details for Feature Launch",
    ];
  }

  const currentStep = run.workflow.steps[run.currentStepIndex];
  return [
    `Complete ${currentStep.title}`,
    "Show status",
    "Add note: Blocker identified with current step",
    "Export summary",
  ];
};

const computeAssistant = (
  input: string,
  activeRun: ActiveRun | null
): AssistantResult => {
  const replies: Message[] = [];
  const trimmed = input.trim();
  const lower = trimmed.toLowerCase();
  let nextRun = activeRun
    ? {
        ...activeRun,
        completedStepIds: [...activeRun.completedStepIds],
        notes: [...activeRun.notes],
      }
    : null;
  let completedRun: RunRecord | undefined;

  const reply = (content: string) =>
    replies.push(createMessage("assistant", content));

  const ensureActive = (): boolean => {
    if (!nextRun) {
      reply(
        "There isn't an active workflow run yet. Start one with commands like \"Start Employee Onboarding\" or ask for \"List workflows\" to explore."
      );
      return false;
    }
    return true;
  };

  if (!trimmed) {
    reply("I'll wait here—type a workflow command whenever you're ready.");
    return { replies, nextRun, completedRun };
  }

  if (
    lower === "hi" ||
    lower === "hello" ||
    lower === "hey" ||
    lower.includes("help")
  ) {
    reply(
      "I'm your workflow copilot. Ask me to list workflows, start a run, complete steps, capture notes, or export a summary. You can say things like \"Start Incident Response\" or \"Complete the current step\"."
    );
    return { replies, nextRun, completedRun };
  }

  if (
    lower.includes("list workflows") ||
    lower === "list" ||
    lower.includes("show workflows") ||
    lower.includes("catalog")
  ) {
    reply(`Here are the available playbooks:\n\n${formatWorkflowList()}`);
    return { replies, nextRun, completedRun };
  }

  if (lower.includes("details") || lower.includes("show") || lower.includes("tell me about")) {
    const target = findWorkflowFromText(trimmed);
    if (target) {
      reply(
        `${formatWorkflowHeadline(target)}\n\nSummary: ${
          target.summary
        }\n\nSteps:\n${describeWorkflowSteps(target)}\n\nReadiness checklist:\n• ${target.checklist.join(
          "\n• "
        )}\n\nResources:\n• ${target.resources.join("\n• ")}`
      );
    } else if (lower.includes("workflow")) {
      reply(
        "I couldn't match that workflow. Try \"Show details for Incident Response\" or ask me to \"List workflows\"."
      );
    }
    if (target) {
      return { replies, nextRun, completedRun };
    }
  }

  if (
    lower.includes("start ") ||
    lower.startsWith("run ") ||
    lower.startsWith("kick") ||
    lower.includes("launch")
  ) {
    const target = findWorkflowFromText(trimmed);
    if (!target) {
      reply(
        "I couldn't find that workflow. Ask for \"List workflows\" to see the available playbooks."
      );
      return { replies, nextRun, completedRun };
    }

    if (nextRun && nextRun.workflow.id !== target.id) {
      completedRun = {
        workflow: nextRun.workflow,
        startedAt: nextRun.startedAt,
        completedAt: new Date().toISOString(),
        completedStepIds: [...nextRun.completedStepIds],
        notes: [...nextRun.notes, "Automatically closed when a new workflow started."],
        status: "cancelled",
      };
    }

    nextRun = {
      workflow: target,
      currentStepIndex: 0,
      completedStepIds: [],
      startedAt: new Date().toISOString(),
      notes: [],
    };

    reply(
      `Starting "${target.name}". Here's the first checkpoint:\n\n${formatActiveStep(
        nextRun
      )}\n\nNeed context on later steps? Ask for "Show status" at any time.`
    );
    return { replies, nextRun, completedRun };
  }

  if (
    lower.includes("complete") ||
    lower.startsWith("next") ||
    lower.includes("advance") ||
    lower.includes("done")
  ) {
    if (!ensureActive()) {
      return { replies, nextRun, completedRun };
    }
    if (!nextRun) {
      return { replies, nextRun, completedRun };
    }

    const totalSteps = nextRun.workflow.steps.length;
    const currentStep = nextRun.workflow.steps[nextRun.currentStepIndex];

    if (nextRun.completedStepIds.includes(currentStep.id)) {
      reply(
        `Step "${currentStep.title}" is already marked complete. Ask for "Show status" to review what's next.`
      );
      return { replies, nextRun, completedRun };
    }

    nextRun.completedStepIds = [
      ...nextRun.completedStepIds,
      currentStep.id,
    ];

    if (nextRun.currentStepIndex >= totalSteps - 1) {
      completedRun = {
        workflow: nextRun.workflow,
        startedAt: nextRun.startedAt,
        completedAt: new Date().toISOString(),
        completedStepIds: [...nextRun.completedStepIds],
        notes: [...nextRun.notes],
        status: "completed",
      };
      reply(
        `Nice work! "${nextRun.workflow.name}" is fully complete.\n\n${formatRunSummary(
          completedRun
        )}`
      );
      nextRun = null;
      return { replies, nextRun, completedRun };
    }

    nextRun = {
      ...nextRun,
      currentStepIndex: nextRun.currentStepIndex + 1,
    };

    reply(
      `Marked "${currentStep.title}" complete. Up next:\n\n${formatActiveStep(
        nextRun
      )}`
    );
    return { replies, nextRun, completedRun };
  }

  if (
    lower.includes("status") ||
    lower.includes("progress") ||
    lower.includes("where are we") ||
    lower.includes("how far")
  ) {
    if (!ensureActive()) {
      return { replies, nextRun, completedRun };
    }
    if (nextRun) {
      reply(buildStatusMessage(nextRun));
    }
    return { replies, nextRun, completedRun };
  }

  if (lower.includes("note")) {
    if (!ensureActive()) {
      return { replies, nextRun, completedRun };
    }
    if (nextRun) {
      const match =
        trimmed.match(/note[:\-]?\s*(.+)$/i) ??
        trimmed.match(/add\s+note\s+(.*)$/i);
      const note = match?.[1]?.trim();
      if (note) {
        nextRun.notes = [...nextRun.notes, note];
        reply(
          `Captured note on "${nextRun.workflow.name}": ${note}\nAsk for "Show status" to view the latest context.`
        );
      } else {
        reply(
          "To add a note, try \"Add note: waiting on security review\"."
        );
      }
    }
    return { replies, nextRun, completedRun };
  }

  if (
    lower.includes("cancel") ||
    lower.includes("stop run") ||
    lower.includes("abort")
  ) {
    if (!ensureActive()) {
      return { replies, nextRun, completedRun };
    }
    if (nextRun) {
      completedRun = {
        workflow: nextRun.workflow,
        startedAt: nextRun.startedAt,
        completedAt: new Date().toISOString(),
        completedStepIds: [...nextRun.completedStepIds],
        notes: [...nextRun.notes, "Run cancelled before completion."],
        status: "cancelled",
      };
      reply(`Stopped "${nextRun.workflow.name}".\n\n${formatRunSummary(completedRun)}`);
      nextRun = null;
    }
    return { replies, nextRun, completedRun };
  }

  if (lower.includes("export") || lower.includes("summary")) {
    if (!ensureActive()) {
      return { replies, nextRun, completedRun };
    }
    if (nextRun) {
      const record: RunRecord = {
        workflow: nextRun.workflow,
        startedAt: nextRun.startedAt,
        completedAt: new Date().toISOString(),
        completedStepIds: [...nextRun.completedStepIds],
        notes: [...nextRun.notes],
        status:
          nextRun.completedStepIds.length ===
          nextRun.workflow.steps.length
            ? "completed"
            : "in-progress",
      };
      reply(formatRunSummary(record));
    }
    return { replies, nextRun, completedRun };
  }

  if (lower.includes("previous step") || lower.includes("go back")) {
    if (!ensureActive()) {
      return { replies, nextRun, completedRun };
    }
    if (nextRun) {
      if (nextRun.currentStepIndex === 0) {
        reply("You're already at the first step of this workflow.");
      } else {
        nextRun = {
          ...nextRun,
          currentStepIndex: nextRun.currentStepIndex - 1,
        };
        reply(`Revisiting:\n\n${formatActiveStep(nextRun)}`);
      }
    }
    return { replies, nextRun, completedRun };
  }

  reply(
    `I'm not sure how to help with "${trimmed}". Try commands like "List workflows", "Start Incident Response", "Complete current step", or "Add note: waiting on finance".`
  );
  return { replies, nextRun, completedRun };
};

const initialMessages: Message[] = [
  createMessage(
    "assistant",
    'Welcome! I’m your workflow copilot. Ask me to "List workflows" or start one directly—e.g. "Start Incident Response".'
  ),
];

export default function Home() {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [activeRun, setActiveRun] = useState<ActiveRun | null>(null);
  const [runHistory, setRunHistory] = useState<RunRecord[]>([]);
  const [quickActions, setQuickActions] = useState<string[]>(
    deriveQuickActions(null)
  );
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const activeProgress = useMemo(() => {
    if (!activeRun) return 0;
    const total = activeRun.workflow.steps.length;
    if (total === 0) return 0;
    return Math.round(
      (activeRun.completedStepIds.length / total) * 100
    );
  }, [activeRun]);

  const sendMessage = (value: string) => {
    const text = value.trim();
    if (!text) return;
    const userMessage = createMessage("user", text);
    const result = computeAssistant(text, activeRun);
    setMessages((prev) => [...prev, userMessage, ...result.replies]);
    setActiveRun(result.nextRun);
    setQuickActions(deriveQuickActions(result.nextRun));
    if (result.completedRun) {
      setRunHistory((prev) => [
        result.completedRun!,
        ...prev,
      ].slice(0, 5));
    }
    setDraft("");
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      });
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    sendMessage(draft);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage(draft);
    }
  };

  const handleQuickAction = (action: string) => {
    sendMessage(action);
  };

  return (
    <div className="min-h-screen bg-slate-950 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black py-10 text-slate-100">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 lg:flex-row">
        <section className="flex flex-1 flex-col rounded-3xl border border-white/10 bg-slate-900/70 shadow-2xl shadow-black/30 backdrop-blur">
          <header className="border-b border-white/10 px-8 pt-8 pb-6">
            <div className="flex flex-col gap-2">
              <span className="text-sm uppercase tracking-[0.35em] text-slate-400">
                Workflow Copilot
              </span>
              <h1 className="text-3xl font-semibold text-white">
                Chat through your operational playbooks
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-slate-300">
                Drive consistent execution by letting the assistant orchestrate each workflow. Start runs, complete steps, capture notes, and export summaries without leaving the conversation.
              </p>
            </div>
          </header>

          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 space-y-6 overflow-y-auto px-8 py-8">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${
                    message.role === "assistant"
                      ? "justify-start"
                      : "justify-end"
                  }`}
                >
                  <div
                    className={`max-w-[80%] rounded-3xl px-5 py-4 text-sm leading-6 shadow-lg shadow-black/20 ${
                      message.role === "assistant"
                        ? "bg-slate-800/80 text-slate-100 ring-1 ring-white/5"
                        : "bg-sky-500 text-white"
                    }`}
                    style={{ whiteSpace: "pre-wrap" }}
                  >
                    {message.content}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="border-t border-white/10 px-8 py-6">
              <div className="mb-4 flex flex-wrap gap-2">
                {quickActions.map((action) => (
                  <button
                    key={action}
                    type="button"
                    onClick={() => handleQuickAction(action)}
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-slate-200 transition hover:border-sky-500/40 hover:bg-sky-500/10 hover:text-white"
                  >
                    <span role="img" aria-hidden className="text-sky-300">
                      ❖
                    </span>
                    {action}
                  </button>
                ))}
              </div>
              <form
                onSubmit={handleSubmit}
                className="flex items-end gap-3 rounded-2xl border border-white/10 bg-slate-900/80 px-5 py-4 shadow-inner shadow-black/40"
              >
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  placeholder='Try "Start Incident Response" or "Add note: waiting on design"'
                  className="h-12 w-full resize-none bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500"
                />
                <button
                  type="submit"
                  className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-700"
                  disabled={!draft.trim()}
                >
                  Send
                </button>
              </form>
            </div>
          </div>
        </section>

        <aside className="flex w-full flex-col gap-4 lg:w-[320px]">
          <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-6 shadow-2xl shadow-black/40 backdrop-blur">
            <h2 className="text-lg font-semibold text-white">Active Run</h2>
            {activeRun ? (
              <div className="mt-4 space-y-4 text-sm text-slate-200">
                <div>
                  <p className="text-base font-medium text-slate-100">
                    {activeRun.workflow.name}
                  </p>
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-400">
                    {new Date(activeRun.startedAt).toLocaleString()}
                  </p>
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
                    <span>Progress</span>
                    <span>{activeProgress}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-sky-500"
                      style={{ width: `${Math.max(activeProgress, 4)}%` }}
                    />
                  </div>
                </div>
                <div className="rounded-2xl bg-slate-800/70 p-4 ring-1 ring-white/5">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                    Current Step
                  </p>
                  <p className="mt-2 text-sm font-semibold text-white">
                    {activeRun.workflow.steps[activeRun.currentStepIndex].title}
                  </p>
                  <p className="mt-1 text-xs text-slate-300">
                    {
                      activeRun.workflow.steps[activeRun.currentStepIndex]
                        .description
                    }
                  </p>
                  <p className="mt-2 text-xs text-slate-400">
                    Owner: {activeRun.workflow.steps[activeRun.currentStepIndex].owner}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                    Notes
                  </p>
                  {activeRun.notes.length ? (
                    <ul className="mt-2 space-y-2 text-xs">
                      {activeRun.notes.slice(-3).map((note, index) => (
                        <li
                          key={`${note}-${index}`}
                          className="rounded-lg bg-slate-800/50 px-3 py-2 text-slate-200 ring-1 ring-white/5"
                        >
                          {note}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-slate-500">
                      No notes captured yet.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm leading-6 text-slate-300">
                Kick off any workflow to see live progress, the current step owner, and captured notes here.
              </p>
            )}
          </div>

          <div className="rounded-3xl border border-white/10 bg-slate-900/40 p-6 shadow-2xl shadow-black/40 backdrop-blur">
            <h2 className="text-lg font-semibold text-white">
              Recent Runs
            </h2>
            {runHistory.length ? (
              <ul className="mt-4 space-y-3 text-xs text-slate-200">
                {runHistory.map((run) => (
                  <li
                    key={`${run.workflow.id}-${run.completedAt}`}
                    className="rounded-2xl bg-slate-800/60 p-4 ring-1 ring-white/5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-white">
                        {run.workflow.name}
                      </span>
                      <span
                        className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${
                          run.status === "completed"
                            ? "bg-emerald-500/20 text-emerald-300"
                            : "bg-amber-500/20 text-amber-300"
                        }`}
                      >
                        {run.status}
                      </span>
                    </div>
                    <p className="mt-2 text-[11px] uppercase tracking-[0.3em] text-slate-400">
                      {new Date(run.completedAt).toLocaleString()}
                    </p>
                    <p className="mt-2 text-xs text-slate-300">
                      Steps done: {run.completedStepIds.length}/
                      {run.workflow.steps.length}
                    </p>
                    {run.notes.length ? (
                      <p className="mt-2 text-xs text-slate-400">
                        Latest note: {run.notes.slice(-1)[0]}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm leading-6 text-slate-300">
                Summaries of completed or cancelled workflows will show up here for quick reference.
              </p>
            )}
          </div>

          <div className="hidden rounded-3xl border border-white/5 bg-slate-900/20 p-6 shadow-inner shadow-black/50 backdrop-blur lg:block">
            <h2 className="text-base font-semibold uppercase tracking-[0.4em] text-slate-400">
              Catalog
            </h2>
            <ul className="mt-4 space-y-4 text-sm text-slate-200">
              {WORKFLOWS.map((workflow) => (
                <li key={workflow.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-100">
                      {workflow.name}
                    </span>
                    <span className="text-[10px] uppercase tracking-[0.3em] text-slate-500">
                      {workflow.tags.join(" • ")}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">{workflow.summary}</p>
                  <button
                    type="button"
                    onClick={() =>
                      handleQuickAction(`Start ${workflow.name}`)
                    }
                    className="text-xs font-semibold text-sky-300 transition hover:text-sky-200"
                  >
                    Start run ↗
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </main>
    </div>
  );
}
