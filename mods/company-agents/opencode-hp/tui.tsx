// pixel-hq-opencode-hp v2
// OpenCode TUI plugin for Pixel HQ: keeps this terminal labelled with how full the context window is
// (agent.context, 0-100) and which model fills it (agent.model), so the office can draw the desk's HP bar.
// Same math as the sidebar's "Context · N tokens · P% used": the last assistant message after the last
// completed compaction, its tokens against the model's context window.
// One file, every generation: 2.x loads `setup` (its plugin API), 1.3.13+ loads `tui`, pre-1.3.13 calls
// the exported PixelHqHp function. Deleting the folder removes it.
import { execFile } from "node:child_process";

const ID = "pixel-hq-hp";
const terminal = process.env.HC_TERMINAL_ID;
const sum = (t) => (t?.input ?? 0) + (t?.output ?? 0) + (t?.reasoning ?? 0) + (t?.cache?.read ?? 0) + (t?.cache?.write ?? 0);
const clean = (s) => String(s ?? "").replace(/[^A-Za-z0-9._-]/g, "");
const clamp100 = (n) => Math.max(0, Math.min(100, Math.round(n)));
const label = (t, pct, model) => execFile("hc", ["label", t, `agent.context=${pct}`, `agent.model=${model}`], () => {});

const lastAssistantWithUsage = (messages, boundary) => {
  const boundaryIndex = boundary ? messages.findIndex((m) => m && m.id === boundary) : -1;
  if (boundary && boundaryIndex === -1) return undefined;
  const end = boundaryIndex === -1 ? messages.length : boundaryIndex;
  let compactionIndex = -1;
  for (let i = 0; i < end; i++) {
    const m = messages[i];
    if (m && m.type === "compaction" && m.status === "completed") compactionIndex = i;
  }
  for (let i = end - 1; i > compactionIndex; i--) {
    const m = messages[i];
    if (m && m.type === "assistant" && m.tokens) return m;
  }
  return undefined;
};

// OpenCode 2.x: the plugin context from the TUI's own plugin runtime.
let generation = 0;
let timer;

const setup = async (ctx) => {
  if (!terminal || !ctx?.data?.session) return;
  const gen = ++generation;
  if (timer) clearInterval(timer);
  const labeled = new Map();
  const report = (sessionID) => {
    if (gen !== generation) return;
    try {
      const session = ctx.data.session.get(sessionID);
      const messages = ctx.data.session.message.list(sessionID) ?? [];
      const last = lastAssistantWithUsage(messages, session?.revert?.messageID);
      const used = last ? sum(last.tokens) : 0;
      if (used <= 0) return;
      const models = ctx.data.location?.model?.list(ctx.location) ?? ctx.data.location?.model?.list() ?? [];
      const model = models.find((m) => m && m.providerID === last.model?.providerID && m.id === last.model?.id);
      const limit = Number(model?.limit?.context);
      if (!Number.isFinite(limit) || limit <= 0) return;
      const pct = clamp100((used * 100) / limit);
      const modelID = clean(last.model?.id) || "model";
      const line = `${pct}|${modelID}`;
      if (labeled.get(sessionID) === line) return;
      labeled.set(sessionID, line);
      if (labeled.size > 32) labeled.clear();
      label(terminal, pct, modelID);
    } catch {
      /* the store is mid-swap: try again on the next tick */
    }
  };
  const unlisten = ctx.data.on?.("session.usage.updated", (event) => {
    const sessionID = event?.data?.sessionID;
    if (sessionID) report(sessionID);
  });
  const localTimer = setInterval(() => {
    const route = ctx.ui?.router?.current?.();
    if (route?.type === "session" && route.sessionID) report(route.sessionID);
  }, 4000);
  timer = localTimer;
  const route = ctx.ui?.router?.current?.();
  if (route?.type === "session" && route.sessionID) report(route.sessionID);
  return () => {
    clearInterval(localTimer);
    if (timer === localTimer) timer = undefined;
    try { unlisten?.(); } catch {}
  };
};

// OpenCode 1.x: the TUI plugin API (@opencode-ai/plugin/tui). Status events carry the finished assistant
// message's tokens themselves, so the HP bar only follows messages, not the sidebar's reactive store.
const children = new Set();
let lastPct = "", lastAt = 0;
let limits;

const readProviderModels = (providers) => {
  const map = new Map();
  for (const p of providers ?? []) for (const [mid, m] of Object.entries(p?.models ?? {})) if (m?.limit?.context) map.set(`${p.id}/${mid}`, m.limit.context);
  return map;
};

const loadLimits = async (client) => {
  try {
    const res = await client.config.providers();
    const providers = res?.data?.providers ?? res?.providers ?? [];
    const map = readProviderModels(providers);
    if (map.size) limits = map;
  } catch {}
};

export const PixelHqHp = async (api) => {
  if (!terminal || !api?.event?.on) return;
  if (api?.client) void loadLimits(api.client);
  if (api?.state?.provider && !limits) {
    try {
      const map = readProviderModels(api.state.provider);
      if (map.size) limits = map;
    } catch {}
  }
  api.event.on("message.updated", (event) => {
    const p = event?.properties ?? event ?? {};
    if (p.info?.id && p.info.parentID) children.add(p.info.sessionID ?? p.info.id);
    if (!(p.info?.role === "assistant" && p.info?.tokens) || children.has(p.info.sessionID)) return;
    const t = p.info.tokens;
    const used = sum(t);
    const limit = limits?.get(`${p.info.providerID}/${p.info.modelID}`);
    const now = Date.now();
    if (!limit || used <= 0 || now - lastAt < 3000) return;
    lastAt = now;
    const pct = clamp100((used * 100) / limit);
    const modelID = clean(p.info.modelID) || "model";
    const line = `${pct}|${modelID}`;
    if (line === lastPct) return;
    lastPct = line;
    label(terminal, pct, modelID);
  });
};

export default { id: ID, tui: PixelHqHp, setup };
