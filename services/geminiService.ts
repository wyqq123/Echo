import { Task, TaskCategory, FunnelStep, TaskStatus, LeafNode, TaskIntent, FocusTheme, SynergyLink, UserProfile } from "../types";
import { generateId } from "../utils/helpers";
import { SKILL, fillTemplate } from "../utils/skillLoader";

const QWEN_CHAT_MODEL = "qwen-plus";

async function generateViaProxyOrDirect(params: {
  model: string;
  contents: string | string[];
  config?: any;
}): Promise<{ text?: string }> {
  const res = await fetch("/api/qwen/generate-content", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Proxy generate-content failed: ${res.status} ${errText}`);
  }
  return (await res.json()) as { text?: string };
}

async function embedViaProxyOrDirect(params: {
  model: string;
  contents: string[];
}): Promise<{ embeddings: { values: number[] }[] }> {
  const res = await fetch("/api/qwen/embed-content", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Proxy embed-content failed: ${res.status} ${errText}`);
  }
  return (await res.json()) as { embeddings: { values: number[] }[] };
}

const PRIMARY_EMBEDDING_MODEL = "text-embedding-v2";
const FALLBACK_EMBEDDING_MODEL = "text-embedding-v2";

async function embedWithFallback(contents: string[]): Promise<{ values: number[] }[]> {
  try {
    const r = await embedViaProxyOrDirect({ model: PRIMARY_EMBEDDING_MODEL, contents });
    return r.embeddings;
  } catch (e) {
    console.warn(`[embedding] primary model failed (${PRIMARY_EMBEDDING_MODEL}), falling back`, e);
    const r = await embedViaProxyOrDirect({ model: FALLBACK_EMBEDDING_MODEL, contents });
    return r.embeddings;
  }
}

export interface FunnelScript {
  q1: { suggestedId: string; question: string; isStale?: boolean };
  q2: { suggestedId: string; oldDefenderId?: string; question: string; isMerged?: boolean; mergedTaskId?: string };
  q3: { suggestedId?: string; question: string };
  q4: { question: string; isStale?: boolean };
}

function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type DecompositionType = "LINEAR" | "DIMENSIONAL";
export type FunnelScriptType = "First_Time_icebox" | "Subsequent_Time" | "First_Time" ;
export type TaskScope = "small" | "medium" | "large";
export type TaskUrgency = "today" | "this_week" | "open";

export interface TaskFeatures {
  has_deliverable: boolean;
  scope: TaskScope;
  domain: TaskIntent;           // maps directly to TaskIntent enum
  urgency: TaskUrgency;
  estimated_duration: number;   // minutes
  title: string;                // cleaned canonical title
}

export interface SkillsResult {
  title: string;
  intent: TaskIntent;
  duration: number;
  decomposition_type: DecompositionType;
  workflowNote: string;
}

// ─────────────────────────────────────────────
// Stage 1: Input Preprocessing: pure rules to clean, splitting decisions are delegated to segmentTasks
// ─────────────────────────────────────────────

const FILLER_WORDS = [
  "help me", "give me a hand", "I want to", "I need to", "need to do", "need to", "need to make a",
  "make a", "write a", "put together a", "create a", "can I", "can", "please",
  "trouble you to", "do me a favor to", "while you're at it"
];

const SYNONYM_MAP: Record<string, string> = {
  "Competitor Research": "Competitor Analysis",
  "Competitor Benchmarking": "Competitor Analysis",
  "Benchmarking Analysis": "Competitor Analysis",
  "Requirements Document": "PRD",
  "Product Requirements Document": "PRD",
  "Debrief Summary": "Debrief Report",
  "Weekly Summary": "Weekly Report",
  "Daily Summary": "Daily Report",
  "Sort Out": "Organize",
  "Go Through": "Sort Out",
  "Brainstorm Ideas": "Creative Planning",
  "Idea": "Plan",
  "Check Out": "Research",
};

// Multi-task split signals: "顺便", "，", "另外", "还有", "以及"
export function preprocessInput(rawText: string): string {
  // Step 1: Remove filler words
  let cleaned = rawText;
  for (const filler of FILLER_WORDS) {
    cleaned = cleaned.replace(new RegExp(`\\b${filler}\\b`, "gi"), "");
  }

  // Step 2: Apply synonym normalization
  for (const [src, tgt] of Object.entries(SYNONYM_MAP)) {
    cleaned = cleaned.replace(new RegExp(src, "g"), tgt);
  }

  // Collapse extra whitespace introduced by removed fillers
  return cleaned.replace(/\s{2,}/g, " ").trim();
}

// ─────────────────────────────────────────────
// Stage 1b: LLM-based Task Segmentation
// Decides task boundaries semantically:MERGE related sub-steps of the same goal; SPLIT truly independent items
// ─────────────────────────────────────────────
export async function segmentTasks(cleanedText: string): Promise<string[]> {
  if (cleanedText.length < 10) {
    return [cleanedText];
  }

  const intentValues = Object.values(TaskIntent).join(", ");
  const prompt = fillTemplate(SKILL.misc.taskSegmentation, {
    CLEANED_TEXT: cleanedText,
    INTENT_VALUES: intentValues,
  });

  try {
    const response = await generateViaProxyOrDirect({
      model: QWEN_CHAT_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "array",
          items: {
            type: "string",
          },
        },
      }
    });

    const raw = response.text?.trim() ?? "";
    const jsonStr  = raw.replace(/^```json\n/, "").replace(/\n```$/, "");
    const parsed: unknown = JSON.parse(jsonStr);
    if(
      Array.isArray(parsed) && 
      parsed.length > 0 &&
      parsed.every(item => typeof item === "string" && item.trim().length > 0)
    ) {
      return (parsed as string[]).map(item => item.trim());
    }
    console.warn("Task segmentation response is not an array of strings:", parsed);
    return [cleanedText];
  } catch (e) {
    console.error("Task segmentation failed:", e);
    return [cleanedText];
  }
}


// ─────────────────────────────────────────────
// Stage 2: Feature Extraction (single LLM call)
// ─────────────────────────────────────────────

export async function extractFeatures(taskText: string): Promise<TaskFeatures> {
  const intentValues = Object.values(TaskIntent).join(", ");

  const prompt = fillTemplate(SKILL.misc.featureExtraction, {
    TASK_TEXT: taskText,
    INTENT_VALUES: intentValues,
  });

  try {
    const response = await generateViaProxyOrDirect({
      model: QWEN_CHAT_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            has_deliverable: { type: "boolean" },
            scope: { type: "string", description: "small, medium, or large" },
            domain: { type: "string", description: `One of: ${Object.values(TaskIntent).join(', ')}` },
            urgency: { type: "string", description: "today, this_week, or open" },
            estimated_duration: { type: "integer" },
            title: { type: "string" },
          },
          required: ["has_deliverable", "scope", "domain", "urgency", "estimated_duration", "title"],
        },
      },
    });

    return JSON.parse(response.text || "{}") as TaskFeatures;
  } catch (e) {
    console.error("Feature extraction failed:", e);
    // Fallback defaults
    return {
      has_deliverable: true,
      scope: "medium",
      domain: TaskIntent.CAREER_BREAK,
      urgency: "this_week",
      estimated_duration: 60,
      title: taskText.substring(0, 15),
    };
  }
}

// ─────────────────────────────────────────────
// Stage 3: Skills Router (pure logic, zero latency)
// ─────────────────────────────────────────────

export interface SkillChainConfig {
  path: DecompositionType;
  domainPrompt: string;
  scopeInstruction: string;
}

const DOMAIN_SKILLS: Record<TaskIntent, string> = {
  [TaskIntent.CAREER_BREAK]: SKILL.domains.careerBreak,
  [TaskIntent.WEALTH_CONTROL]: SKILL.domains.wealthControl,
  [TaskIntent.BODY_MIND]: SKILL.domains.bodyMind,
  [TaskIntent.ACADEMIC_SPRINT]: SKILL.domains.academicSprint,
  [TaskIntent.DEEP_CONNECT]: SKILL.domains.deepConnect,
  [TaskIntent.INNER_WILD]: SKILL.domains.innerWild,
};

const SCOPE_INSTRUCTIONS: Record<TaskScope, string> = {
  small: "Small Task Scope (1-2 hours): Compress Pre-actions to a maximum of 1 item, strengthen the ultra-fast Starter (must be an action that can start within 30 seconds), and control the total steps to 3-4.",
  medium: "Medium Task Scope (half a day): Standard decomposition depth, consisting of Starter + 2-3 Pre-actions + 2-3 Core steps + 1-2 Post-actions.",
  large: "Large Task Scope (multiple days/rounds): Increase decomposition levels, generate a list of 2-3 sub-steps under each Core step, and mark the estimated time consumption and milestone nodes.",
};

export function skillsRouter(features: TaskFeatures): SkillChainConfig {
  const path: DecompositionType = features.has_deliverable ? "LINEAR" : "DIMENSIONAL";
  const domainPrompt = DOMAIN_SKILLS[features.domain] || DOMAIN_SKILLS[TaskIntent.CAREER_BREAK];
  const scopeInstruction = SCOPE_INSTRUCTIONS[features.scope];

  return { path, domainPrompt, scopeInstruction };
}

// ─────────────────────────────────────────────
// RAG Layer: template-first workflow generation
// retrieve → render template OR fall back to chain
// ─────────────────────────────────────────────

/** Minimum hybrid score for a template hit to be used directly (skip chain). */
const RAG_CONFIDENCE_THRESHOLD = 0.005;

/** The three personas present in the seed_templates collection. */
const TEMPLATE_PERSONAS = ["Product Manager", "Operations", "Software Engineer"] as const;
type TemplatePerson = (typeof TEMPLATE_PERSONAS)[number];

interface LinearTemplateData {
  starter: string;
  pre_actions: string[];
  core_execution: string[];
  post_actions: string[];
}

interface DimensionalTemplateData {
  core_objective: string;
  success_criteria: string;
  dimensions: Array<{ name: string; subtasks: string[] }>;
}

export interface RagTemplate {
  template_id: string;
  scenario_name: string;
  persona: string;
  domain: string;
  decomposition_type: "linear" | "dimensional";
  intent_signals: string[];
  has_deliverable: boolean;
  retrieval_metadata: { keywords: string[]; chain_equivalent: string };
  output_template: {
    linear: LinearTemplateData | null;
    dimensional: DimensionalTemplateData | null;
  };
  _distance?: number;
  _score?: number;
}

interface PersonaResolution {
  /** One of the 3 template personas, or undefined if no confident match. */
  persona: TemplatePerson | undefined;
  /**
   * high  → direct match from userProfile.domain (user explicitly chose this sub-role)
   *         → use as Milvus hard pre-filter
   * low   → inferred from userProfile.subRoles / roleIds
   *         → enrich query only, skip hard filter
   */
  confidence: "high" | "low";
}

/**
 * Resolve a `UserProfile` to one of the 3 template personas.
 *
 * Priority: domain (explicit choice) > subRoles (LLM list) > roleIds (parent role).
 * Matching is case-insensitive keyword lookup.
 */
export function resolvePersonaFromProfile(profile?: UserProfile): PersonaResolution {
  const empty: PersonaResolution = { persona: undefined, confidence: "low" };
  if (!profile) return empty;

  const pmKw = ["product manager", "pm", "产品经理", "产品"];
  const sweKw = ["engineer", "developer", "r&d", "software", "dev", "programmer", "研发", "工程师", "开发"];
  const opsKw = ["operations", "ops", "growth", "marketing", "market", "运营", "增长", "市场"];

  const classify = (text: string): TemplatePerson | undefined => {
    const t = text.toLowerCase();
    if (pmKw.some((k) => t.includes(k))) return "Product Manager";
    if (sweKw.some((k) => t.includes(k))) return "Software Engineer";
    if (opsKw.some((k) => t.includes(k))) return "Operations";
    return undefined;
  };

  // 1. Try userProfile.domain (user's explicit sub-role choice — highest confidence)
  if (profile.domain?.trim()) {
    const p = classify(profile.domain);
    if (p) return { persona: p, confidence: "high" };
  }

  // 2. Try userProfile.subRoles (LLM-generated list shown during Onboarding)
  if (profile.subRoles && profile.subRoles.length > 0) {
    const counts: Partial<Record<TemplatePerson, number>> = {};
    for (const sr of profile.subRoles) {
      const p = classify(sr);
      if (p) counts[p] = (counts[p] ?? 0) + 1;
    }
    const best = (Object.entries(counts) as [TemplatePerson, number][]).sort((a, b) => b[1] - a[1])[0];
    if (best) return { persona: best[0], confidence: "low" };
  }

  // 3. Try parent roleIds as a coarse hint
  for (const rid of profile.roleIds ?? []) {
    const p = classify(rid);
    if (p) return { persona: p, confidence: "low" };
  }

  return empty;
}

interface RagSearchOptions {
  decomposition_type?: string;
  has_deliverable?: boolean;
  /** Exact persona name to pass as Milvus pre-filter (only when confidence is "high"). */
  persona?: string;
  top_k?: number;
}

async function ragSearch(query: string, options: RagSearchOptions = {}): Promise<RagTemplate[]> {
  try {
    const body: Record<string, unknown> = {
      query,
      top_k: options.top_k ?? 3,
    };
    if (options.decomposition_type) body.decomposition_type = options.decomposition_type.toLowerCase();
    if (options.has_deliverable !== undefined) body.has_deliverable = options.has_deliverable;
    if (options.persona) body.persona = options.persona;

    const res = await fetch("/api/rag/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: RagTemplate[] };
    return data.results ?? [];
  } catch {
    return [];
  }
}

/**
 * Render a seed_template's output_template into the same Markdown format that
 * executeLinearChain / executeDimensionalChain produce, so downstream rendering
 * is identical regardless of whether the result came from RAG or the LLM chain.
 */
export function renderTemplateAsWorkflowNote(template: RagTemplate, taskTitle: string): string {
  const { decomposition_type: dt, output_template: ot } = template;

  if (dt === "linear" && ot.linear) {
    const t = ot.linear;
    const preBlock =
      t.pre_actions.length > 0 ? t.pre_actions.map((a) => `- ${a}`).join("\n") : "- (None)";
    const coreBlock = t.core_execution.map((s) => `- ${s}`).join("\n");
    const postBlock = t.post_actions.map((s) => `- ${s}`).join("\n");
    return [
      `**${taskTitle}** · LINEAR`,
      "",
      `**Starter (Immediate Action):**`,
      `→ ${t.starter}`,
      "",
      `**Pre-actions (Preparations):**`,
      preBlock,
      "",
      `**Core execution (Core Implementation):**`,
      coreBlock,
      "",
      `**Post-actions (Delivery & Closure):**`,
      postBlock,
    ].join("\n");
  }

  if (dt === "dimensional" && ot.dimensional) {
    const t = ot.dimensional;
    const dimBlocks = t.dimensions
      .map(
        (dim, i) =>
          `**Dimension ${i + 1}: ${dim.name}**\n` + dim.subtasks.map((s) => `- ${s}`).join("\n")
      )
      .join("\n\n");
    return [
      `**${taskTitle}** · DIMENSIONAL`,
      "",
      `**Core Objective:** ${t.core_objective}`,
      `**Success Criteria (3 months):** ${t.success_criteria}`,
      "",
      dimBlocks,
    ].join("\n");
  }

  return "";
}

// ─────────────────────────────────────────────
// Stage 4a: LINEAR Skill Chain Execution
// Chain: DeliverableExtractor → BlockerIdentifier → LinearDecomposer
// ─────────────────────────────────────────────

async function executeLinearChain(
  taskText: string,
  features: TaskFeatures,
  config: SkillChainConfig
): Promise<string> {
  const urgencyNote =
    features.urgency === "today"
      ? "Urgent Note: Must be completed today. The Starter must be the smallest physical action that can be immediately initiated within 2 minutes, with extremely low friction."
      : features.urgency === "this_week"
      ? "To be completed within this week. Arrange the pace reasonably."
      : "Flexible timeline, allowing for in-depth planning.";

  const prompt = fillTemplate(SKILL.chains.linearDecomposer, {
    DOMAIN_SKILL: config.domainPrompt,
    URGENCY_NOTE: urgencyNote,
    SCOPE_INSTRUCTION: config.scopeInstruction,
    TASK_TEXT: taskText,
    TASK_TITLE: features.title,
  });

  const response = await generateViaProxyOrDirect({
    model: QWEN_CHAT_MODEL,
    contents: prompt,
  });

  return response.text?.trim() || "Workflow generation failed, please try again.";
}

// ─────────────────────────────────────────────
// Stage 4b: DIMENSIONAL Skill Chain Execution
// Chain: ObjectiveExtractor → DimensionMapper → DimensionalDecomposer
// ─────────────────────────────────────────────

async function executeDimensionalChain(
  taskText: string,
  features: TaskFeatures,
  config: SkillChainConfig
): Promise<string> {
  const urgencyNote =
    features.urgency === "today"
      ? "Although initiated today, this is a long-term goal. The focus is to design the entry point for the first step this week."
      : features.urgency === "this_week"
      ? "Substantial progress must be made within this week, and the subtasks under each dimension must be executable this week."
      : "Adequate time is available for comprehensive planning and in-depth expansion of each dimension.";

  const prompt = fillTemplate(SKILL.chains.dimensionalDecomposer, {
    DOMAIN_SKILL: config.domainPrompt,
    SCOPE_INSTRUCTION: config.scopeInstruction,
    URGENCY_NOTE: urgencyNote,
    TASK_TEXT: taskText,
    TASK_TITLE: features.title,
  });

  const response = await generateViaProxyOrDirect({
    model: QWEN_CHAT_MODEL,
    contents: prompt,
  });

  return response.text?.trim() || "Dimensional decomposition generation failed, please try again.";
}

// ─────────────────────────────────────────────
// Main Entry: processTaskWithSkills
// Runs the complete pipeline for a single task text
// ─────────────────────────────────────────────

export async function processTaskWithSkills(
  taskText: string,
  focusThemes: FocusTheme[] = [],
  userProfile?: UserProfile
): Promise<SkillsResult> {
  // Stage 2: Feature extraction (single LLM call)
  const features = await extractFeatures(taskText);

  // Override domain with focus themes if alignment is strong
  if (focusThemes.length > 0) {
    try {
      const targetStrings = focusThemes.map(theme => 
        `[${theme.intent}] The core foucs dimensions：${(theme.tags || []).join(', ')}`
      );
      const taskString = `task：${features.title}。`;
      const allStrings = [...targetStrings, taskString];
      
      const embedResult = await embedViaProxyOrDirect({
        model: PRIMARY_EMBEDDING_MODEL,
        contents: allStrings,
      });
      
      const embeddings = embedResult.embeddings;
      if (embeddings && embeddings.length === allStrings.length) {
        const targetEmbeddings = embeddings.slice(0, targetStrings.length).map(e => e.values);
        const taskVec = embeddings[embeddings.length - 1].values;
        
        let bestScore = -1;
        let bestThemeIdx = -1;

        targetEmbeddings.forEach((targetVec, tIdx) => {
          if (taskVec && targetVec) {
            const score = cosineSimilarity(taskVec, targetVec);
            if (score > bestScore) {
              bestScore = score;
              bestThemeIdx = tIdx;
            }
          }
        });

        if (bestScore >= 0.45 && bestThemeIdx !== -1) {
          features.domain = focusThemes[bestThemeIdx].intent;
        }
      }
    } catch (e) {
      console.error("Embedding alignment failed", e);
    }
  }

  // Stage 3: Route (zero latency)
  const config = skillsRouter(features);

  // Stage 4: RAG-first — try to retrieve a matching seed template before calling the LLM chain.
  let workflowNote: string;
  let ragHit: RagTemplate | null = null;
  try {
    // Resolve persona from Onboarding profile context
    const { persona: resolvedPersona, confidence: personaConfidence } =
      resolvePersonaFromProfile(userProfile);

    // Query enrichment: prepend persona context so BGE-M3 embeds a richer signal.
    // E.g. "[Product Manager] write a PRD for new feature" matches PM templates better.
    const enrichedQuery = resolvedPersona
      ? `[${resolvedPersona}] ${taskText}`
      : taskText;

    const ragOptions: RagSearchOptions = {
      decomposition_type: config.path,          // LINEAR / DIMENSIONAL pre-filter (reliable)
      has_deliverable: features.has_deliverable, // symmetric with decomposition_type
      top_k: 3,
    };
    // Hard persona pre-filter only when confidence is high (user explicitly chose this sub-role)
    if (resolvedPersona && personaConfidence === "high") {
      ragOptions.persona = resolvedPersona;
    }

    const hits = await ragSearch(enrichedQuery, ragOptions);
    const top = hits[0];
    if (top && (top._distance ?? 0) >= RAG_CONFIDENCE_THRESHOLD) {
      const rendered = renderTemplateAsWorkflowNote(top, features.title);
      if (rendered) {
        ragHit = top;
        workflowNote = rendered;
        console.log(
          `[RAG] hit template_id=${top.template_id} persona=${top.persona}` +
          ` score=${top._distance?.toFixed(4)} resolvedPersona=${resolvedPersona ?? "none"}` +
          ` confidence=${personaConfidence} for "${features.title}"`
        );
      }
    }
  } catch (ragErr) {
    console.warn("[RAG] search failed, falling back to chain:", ragErr);
  }

  // Stage 4 fallback: run LLM skill chain if RAG didn't produce a result
  if (!ragHit) {
    if (config.path === "LINEAR") {
      workflowNote = await executeLinearChain(taskText, features, config);
    } else {
      workflowNote = await executeDimensionalChain(taskText, features, config);
    }
  }

  return {
    title: features.title,
    intent: features.domain,
    duration: features.estimated_duration,
    decomposition_type: config.path,
    workflowNote: workflowNote!,
  };
}

// ─────────────────────────────────────────────
// parseBrainDump
// Full pipeline: clean → LLM-segment → parallel skills
// ─────────────────────────────────────────────
export const parseBrainDump = async (text: string, focusThemes: FocusTheme[] = [], iceboxTasks: Task[] = [], userProfile?: UserProfile): Promise<Partial<Task>[]> => {
  try {
    // Stage 1: Rule-based filler cleaning + synonym normalisation
    const cleanedText = preprocessInput(text);

    // Stage 1b: LLM decides task boundaries
    const taskTexts = await segmentTasks(cleanedText);
 
    console.log(`[parseBrainDump] Segmented into ${taskTexts.length} task(s):`, taskTexts);
 
    // Stage 2-4: Feature extraction + workflow — parallel across tasks
    const skillsResults = await Promise.all(
      taskTexts.map(taskText => processTaskWithSkills(taskText, focusThemes, userProfile))
    );

    // Map to Partial<Task>
    return skillsResults.map(result => {
      // Basic deduplication against icebox (can be enhanced later)
      let isRevived = false;
      let id = generateId();
      
      const similarIceboxTask = iceboxTasks.find(t => 
        t.title.toLowerCase().includes(result.title.toLowerCase()) || 
        result.title.toLowerCase().includes(t.title.toLowerCase())
      );
      
      if (similarIceboxTask) {
        id = similarIceboxTask.id;
        isRevived = true;
      }

      return {
        id,
        title: result.title,
        intent: result.intent,
        category: mapIntentToCategory(result.intent),
        workflowNote: result.workflowNote,
        duration: result.duration,
        decomposition_type: result.decomposition_type,
        status: TaskStatus.CANDIDATE,
        isAnchor: false,
        isFrozen: false,
        isRevived,
        completed: false
      };
    });

  } catch (error) {
    console.error("Gemini API Error:", error);
    return mockParse(text);
  }
};

// ... mapIntentToCategory ...

const mapIntentToCategory = (intent: TaskIntent): TaskCategory => {
  switch (intent) {
    case TaskIntent.CAREER_BREAK:
    case TaskIntent.WEALTH_CONTROL:
      return TaskCategory.WORK;
    case TaskIntent.ACADEMIC_SPRINT:
      return TaskCategory.STUDY;
    case TaskIntent.INNER_WILD:
      return TaskCategory.GROWTH;
    case TaskIntent.BODY_MIND:
    case TaskIntent.DEEP_CONNECT:
    default:
      return TaskCategory.LIFE;
  }
};


export const generateFunnelScript = async (
  isSubsequent: boolean,
  candidateTasks: Task[],
  existingAnchors: Task[],
  focusThemes: FocusTheme[],
  currentTime: string,
  iceboxTasks: Task[] = []
): Promise<FunnelScript> => {
  const parseJsonObject = (raw: string): Record<string, any> => {
    const trimmed = (raw || "").trim();
    if (!trimmed) return {};
    const jsonStr = trimmed
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
    return JSON.parse(jsonStr);
  };

  try {
    const themeContext =
      focusThemes.length > 0
        ? `Quarterly focus themes: ${focusThemes.map(t => `【${t.intent}: ${(t.tags || []).join(", ")}】`).join("; ")}`
        : "No quarterly themes are set. Fallback to generic prioritization by impact + effort.";
    const fallbackInstruction =
      focusThemes.length > 0
        ? "Use theme relevance as the first ranking factor."
        : "Since no themes are available, infer relevance by impact, urgency, and completion momentum.";

    const template = isSubsequent
      ? SKILL.funnel.subsequent
      : iceboxTasks.length > 0
      ? SKILL.funnel.firstTimeIcebox
      : SKILL.funnel.firstTime;

    const promptVars: Record<string, string> = {
      THEME_CONTEXT: themeContext,
      FALLBACK_INSTRUCTION: fallbackInstruction,
      CURRENT_TIME: currentTime,
      CANDIDATE_JSON: JSON.stringify(candidateTasks),
      ANCHOR_JSON: JSON.stringify(existingAnchors),
      ICEBOX_JSON: JSON.stringify(iceboxTasks),
    };

    const prompt = fillTemplate(template, promptVars);
    const response = await generateViaProxyOrDirect({
      model: QWEN_CHAT_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });
    const parsed = parseJsonObject(response.text || "");

    // Map different funnel template schemas into one UI contract.
    const q1Node = parsed.q1_subtraction || parsed.q1_trivial || parsed.q1 || {};
    const q2Node = parsed.q2_pk || parsed.q2_leverage || parsed.q2 || {};
    const q3Node = parsed.q3_energy || parsed.q3_icebreaker || parsed.q3 || {};
    const q4Node = parsed.q4_confirmation || parsed.q4_final || parsed.q4 || {};

    const normalized: FunnelScript = {
      q1: {
        suggestedId: q1Node.suggestedId || candidateTasks[0]?.id,
        question: q1Node.question || "Move one low-priority task to drawer?",
        isStale: q1Node.isStale,
      },
      q2: {
        suggestedId: q2Node.suggestedId || q2Node.newChallengerId || candidateTasks[0]?.id,
        oldDefenderId: q2Node.oldDefenderId,
        question: q2Node.question || "Choose the highest-leverage task.",
        isMerged: q2Node.isMerged,
        mergedTaskId: q2Node.mergedTaskId,
      },
      q3: {
        suggestedId: q3Node.suggestedId,
        question: q3Node.question || "Pick an easy starter as your Icebreaker.",
      },
      q4: {
        question: q4Node.question || "Confirm your final lineup.",
        isStale: q4Node.isStale,
      },
    };
    return normalized;
  } catch (e) {
    console.error("Funnel skill generation failed:", e);
    return mockFunnelScript(isSubsequent, candidateTasks, existingAnchors);
  }
};

const mockFunnelScript = (isSubsequent: boolean, candidates: Task[], anchors: Task[]): FunnelScript => {
  if (!isSubsequent) {
    return {
      q1: { suggestedId: candidates[0]?.id, question: "Skip trivial task?" },
      q2: { suggestedId: candidates[1]?.id || candidates[0]?.id, question: "Is this the keystone?" },
      q3: { suggestedId: candidates[2]?.id || candidates[0]?.id, question: "Icebreaker?" },
      q4: { question: "Final pick?" }
    };
  } else {
    return {
      q1: { suggestedId: candidates[0]?.id, question: "Skip new trivial?" },
      q2: { suggestedId: candidates[0]?.id, oldDefenderId: anchors[0]?.id, question: "Swap?" },
      q3: { question: "Energy check?" },
      q4: { question: "This is the final formation after adjustments. If these few tasks are completed tonight, will you still be able to get that sense of 'security'?" }
    };
  }
};

/**
 * Semantic Normalization for Task Forest
 * Checks if a new task belongs to an existing leaf or needs a new one.
 */
export const semanticLeafMerge = async (
  completedTaskTitle: string,
  currentIntent: TaskIntent | undefined,
  existingLeaves: LeafNode[],
  focusThemes: FocusTheme[],
  quarterId?: string
): Promise<{ action: 'MERGE' | 'CREATE'; targetLeafId?: string; canonicalTitle?: string }> => {
  try {
    const existingLeafData = existingLeaves
      .filter(l => l.intent === currentIntent && (!quarterId || l.quarterId === quarterId))
      .map(l => ({ id: l.id, title: l.canonicalTitle }));
      
    const existingLeafJson = JSON.stringify(existingLeafData);
    const themesString = focusThemes.map(t => `${t.intent}: ${(t.tags || []).join(', ')}`).join('; ');

    const prompt = fillTemplate(SKILL.misc.leafMerge, {
      EXISTING_LEAVES: existingLeafJson,
      TASK_TITLE: completedTaskTitle,
      INTENT: currentIntent || 'Uncategorized',
      THEMES_CONTEXT: themesString,
    });

    const response = await generateViaProxyOrDirect({
      model: QWEN_CHAT_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["MERGE", "CREATE"] },
            targetLeafId: { type: "string" },
            canonicalTitle: { type: "string" }
          },
          required: ["action"]
        }
      }
    });

    const result = JSON.parse(response.text || "{}");
    return {
      action: result.action || 'CREATE',
      targetLeafId: result.targetLeafId,
      canonicalTitle: result.canonicalTitle || completedTaskTitle.substring(0, 4)
    };

  } catch (error) {
    console.error("AI Semantic Merge Error:", error);
    return { action: 'CREATE', canonicalTitle: completedTaskTitle.substring(0, 4) };
  }
};


export const generateQuarterlyReview = async (
  forest: LeafNode[],
  synergyLinks: SynergyLink[],
  focusThemes: FocusTheme[]
): Promise<string> => {
  try {
    const forestContext = forest.map(l => `${l.canonicalTitle} (${l.intent}): ${l.count} times`).join(', ');
    const linksContext = synergyLinks.map(l => {
      const source = forest.find(f => f.id === l.sourceLeafId);
      return source ? `${source.canonicalTitle} -> ${l.targetIntent}` : '';
    }).filter(Boolean).join(', ');
    const themesContext = focusThemes.map(t => t.intent).join(', ');

    const prompt = fillTemplate(SKILL.misc.quarterlyReview, {
      THEMES_CONTEXT: themesContext,
      FOREST_CONTEXT: forestContext,
      LINKS_CONTEXT: linksContext,
    });

    const response = await generateViaProxyOrDirect({
      model: QWEN_CHAT_MODEL,
      contents: prompt,
    });

    return response.text?.trim() || "No report available";
  } catch (error) {
    console.error("AI Quarterly Review Error:", error);
    return "AI quarterly report generation failed, please try again later.";
  }
};

export const generateDomainsForRole = async (roleLabel: string): Promise<string[]> => {
  try {
    const prompt = `
      You are an expert career advisor.
      The user has selected the role: "${roleLabel}".
      Please generate a list of 6-8 popular, specific job titles or domains associated with this role.
      Output ONLY a JSON array of strings. Do not include markdown formatting or any other text.
      Example: ["Growth PM", "Operations", "Marketing", "Data Analyst"]
    `;

    const response = await generateViaProxyOrDirect({
      model: QWEN_CHAT_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "array",
          items: {
            type: "string"
          }
        }
      }
    });

    const domains = JSON.parse(response.text || "[]");
    return domains.length > 0 ? domains : ['Product Manager', 'Software Engineer', 'Designer', 'Data Analyst', 'Marketing'];
  } catch (error) {
    console.error("Gemini API Error (generateDomainsForRole):", error);
    return ['Product Manager', 'Software Engineer', 'Designer', 'Data Analyst', 'Marketing'];
  }
};

export const generateFocusTags = async (intent: TaskIntent, recentTasks: Task[]): Promise<string[]> => {
  try {
    const taskContext = recentTasks.length > 0 
      ? `Recent User Tasks: ${recentTasks.map(t => t.title).join(', ')}` 
      : "No recent tasks available.";

    const prompt = `
      You are an AI assistant helping a user define their quarterly focus themes.
      The user has selected the broad category: "${intent}".
      ${taskContext}

      Based on the user's recent tasks (if any) and the chosen category, generate exactly 3 specific, actionable, and concise focus directions (tags) for this quarter.
      Each tag should be 2-5 words long.
      Return the result as a JSON array of 3 strings.
    `;

    const response = await generateViaProxyOrDirect({
      model: QWEN_CHAT_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "array",
          items: { type: "string" }
        }
      }
    });

    const tags = JSON.parse(response.text || "[]");
    return Array.isArray(tags) && tags.length === 3 ? tags : [];
  } catch (error) {
    console.error("Gemini API Error:", error);
    return [];
  }
};

export const generateMergedTaskDetails = async (
  title: string,
  mergedFrom: Task[],
  focusThemes: FocusTheme[],
  intent?: TaskIntent,
  category?: TaskCategory
): Promise<{ workflowNote: string; duration: number }> => {
  try {
    const prompt = `
You are an expert task-planning assistant.
The user merged multiple tasks into one new task.

Requirements:
- Keep output concise and actionable.
- Return JSON only with shape: {"workflowNote": string, "duration": number}
- "duration" must be minutes (integer, 15 to 480).
- "workflowNote" should be a short step list the user can execute.

Merged title: "${title}"
Chosen intent: "${intent ?? 'N/A'}"
Chosen category: "${category ?? 'N/A'}"
Source tasks JSON: ${JSON.stringify(mergedFrom)}
Focus themes context (do NOT modify, context only): ${JSON.stringify(focusThemes)}
`;

    const response = await generateViaProxyOrDirect({
      model: QWEN_CHAT_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    const parsed = JSON.parse((response.text || "{}").trim());
    const durationRaw = Number(parsed.duration);
    const duration = Number.isFinite(durationRaw)
      ? Math.max(15, Math.min(480, Math.round(durationRaw)))
      : Math.max(15, Math.min(480, Math.round(mergedFrom.reduce((s, t) => s + (t.duration || 0), 0) || 60)));

    return {
      workflowNote: typeof parsed.workflowNote === "string" && parsed.workflowNote.trim()
        ? parsed.workflowNote.trim()
        : "1. Define the merged deliverable\n2. Execute highest-impact sub-step\n3. Review and close",
      duration,
    };
  } catch (error) {
    console.error("Merged task generation failed:", error);
    const fallbackDuration = Math.max(15, Math.min(480, Math.round(mergedFrom.reduce((s, t) => s + (t.duration || 0), 0) || 60)));
    return {
      workflowNote: "1. Clarify scope for this merged task\n2. Execute key sub-steps in order\n3. Wrap up with a quick review",
      duration: fallbackDuration,
    };
  }
};

const mockParse = (text: string): Partial<Task>[] => {
  const parts = text.split(/,|\n/).filter(s => s.trim().length > 0);
  return parts.map((part, index) => ({
    id: `mock-${Date.now()}-${index}`,
    title: part.trim(),
    category: index % 2 === 0 ? TaskCategory.WORK : TaskCategory.LIFE,
    intent: index % 2 === 0 ? TaskIntent.CAREER_BREAK : TaskIntent.BODY_MIND,
    workflowNote: "1. Step one\n2. Step two",
    duration: 30,
    status: TaskStatus.CANDIDATE,
    isAnchor: false,
    isFrozen: false,
    completed: false
  }));
};
