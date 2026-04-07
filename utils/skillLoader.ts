/**
 * skillLoader.ts
 *
 * Skill markdown files may include a YAML frontmatter block (unified metadata).
 * The SKILL registry exposes prompt bodies only (frontmatter stripped) so LLMs
 * never see metadata. Use SKILL_META / listSkillMetadata() for tooling.
 */

// ─── Domain Skills ────────────────────────────────────────────────────────────
import careerBreakRaw from '../skills/domains/career-break.md?raw';
import bodyMindRaw from '../skills/domains/body-mind.md?raw';
import academicSprintRaw from '../skills/domains/academic-sprint.md?raw';
import deepConnectRaw from '../skills/domains/deep-connect.md?raw';
import wealthControlRaw from '../skills/domains/wealth-control.md?raw';
import innerWildRaw from '../skills/domains/inner-wild.md?raw';

// ─── Chain Skills ─────────────────────────────────────────────────────────────
import linearDecomposerRaw from '../skills/chains/linear-decomposer.md?raw';
import dimensionalDecomposerRaw from '../skills/chains/dimensional-decomposer.md?raw';

// ─── Funnel Skills ────────────────────────────────────────────────────────────
import funnelFirstTimeRaw from '../skills/funnel/first-time.md?raw';
import funnelFirstTimeIceboxRaw from '../skills/funnel/first-time-icebox.md?raw';
import funnelSubsequentRaw from '../skills/funnel/subsequent.md?raw';

// ─── Misc Skills ──────────────────────────────────────────────────────────────
import featureExtractionRaw from '../skills/feature-extraction.md?raw';
import taskSegmentationRaw from '../skills/task-segmentation.md?raw';
import leafMergeRaw from '../skills/leaf-merge.md?raw';
import quarterlyReviewRaw from '../skills/quarterly-review.md?raw';

// ─── Metadata types ───────────────────────────────────────────────────────────

export type SkillKind = 'domain' | 'chain' | 'funnel' | 'misc';

export type SkillOutput = 'markdown' | 'json-object' | 'json-array' | 'prompt-markdown';

export interface SkillMetadata {
  id: string;
  version: string;
  kind: SkillKind;
  title: string;
  description: string;
  output: SkillOutput;
  /** Placeholder names used in fillTemplate, without {{ }} */
  placeholders: string[];
  /** Optional pipeline hook name in app code (documentation) */
  stage?: string;
}

const SKILL_KINDS: ReadonlySet<string> = new Set(['domain', 'chain', 'funnel', 'misc']);
const SKILL_OUTPUTS: ReadonlySet<string> = new Set([
  'markdown',
  'json-object',
  'json-array',
  'prompt-markdown',
]);

/** Split leading YAML frontmatter from skill markdown; body is the LLM prompt. */
export function splitSkillSource(raw: string): { frontmatter: Record<string, string>; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    console.warn('[skillLoader] Missing YAML frontmatter; using full file as body');
    return { frontmatter: {}, body: raw };
  }
  const yamlBlock = match[1];
  const body = match[2];
  const frontmatter: Record<string, string> = {};
  for (const line of yamlBlock.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const colon = trimmed.indexOf(':');
    if (colon === -1) continue;
    const key = trimmed.slice(0, colon).trim();
    let val = trimmed.slice(colon + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    frontmatter[key] = val;
  }
  return { frontmatter, body };
}

function parsePlaceholders(raw: string | undefined): string[] {
  if (!raw || raw === 'none') return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseSkillMetadata(
  frontmatter: Record<string, string>,
  fallbackId: string,
): SkillMetadata {
  const kind = SKILL_KINDS.has(frontmatter.kind || '')
    ? (frontmatter.kind as SkillKind)
    : 'misc';
  const output = SKILL_OUTPUTS.has(frontmatter.output || '')
    ? (frontmatter.output as SkillOutput)
    : 'markdown';

  return {
    id: frontmatter.id || fallbackId,
    version: frontmatter.version || '0.0.0',
    kind,
    title: frontmatter.title || fallbackId,
    description: frontmatter.description || '',
    output,
    placeholders: parsePlaceholders(frontmatter.placeholders),
    stage: frontmatter.stage || undefined,
  };
}

function loadSkill(raw: string, fallbackId: string): { body: string; meta: SkillMetadata } {
  const { frontmatter, body } = splitSkillSource(raw);
  const meta = parseSkillMetadata(frontmatter, fallbackId);
  return { body, meta };
}

// ─── Load all skills (body-only for LLM) ─────────────────────────────────────

const _careerBreak = loadSkill(careerBreakRaw, 'domain.career-break');
const _bodyMind = loadSkill(bodyMindRaw, 'domain.body-mind');
const _academicSprint = loadSkill(academicSprintRaw, 'domain.academic-sprint');
const _deepConnect = loadSkill(deepConnectRaw, 'domain.deep-connect');
const _wealthControl = loadSkill(wealthControlRaw, 'domain.wealth-control');
const _innerWild = loadSkill(innerWildRaw, 'domain.inner-wild');

const _linear = loadSkill(linearDecomposerRaw, 'chain.linear-decomposer');
const _dimensional = loadSkill(dimensionalDecomposerRaw, 'chain.dimensional-decomposer');

const _funnelFirst = loadSkill(funnelFirstTimeRaw, 'funnel.first-time');
const _funnelIcebox = loadSkill(funnelFirstTimeIceboxRaw, 'funnel.first-time-icebox');
const _funnelSubsequent = loadSkill(funnelSubsequentRaw, 'funnel.subsequent');

const _feature = loadSkill(featureExtractionRaw, 'misc.feature-extraction');
const _segment = loadSkill(taskSegmentationRaw, 'misc.task-segmentation');
const _leaf = loadSkill(leafMergeRaw, 'misc.leaf-merge');
const _quarterly = loadSkill(quarterlyReviewRaw, 'misc.quarterly-review');

/** Prompt bodies only (frontmatter removed). Safe to pass to fillTemplate / LLM. */
export const SKILL = {
  domains: {
    careerBreak: _careerBreak.body,
    bodyMind: _bodyMind.body,
    academicSprint: _academicSprint.body,
    deepConnect: _deepConnect.body,
    wealthControl: _wealthControl.body,
    innerWild: _innerWild.body,
  },
  chains: {
    linearDecomposer: _linear.body,
    dimensionalDecomposer: _dimensional.body,
  },
  funnel: {
    firstTime: _funnelFirst.body,
    firstTimeIcebox: _funnelIcebox.body,
    subsequent: _funnelSubsequent.body,
  },
  misc: {
    featureExtraction: _feature.body,
    taskSegmentation: _segment.body,
    leafMerge: _leaf.body,
    quarterlyReview: _quarterly.body,
  },
} as const;

/** All skill metadata keyed by `meta.id` from frontmatter. */
export const SKILL_META: Record<string, SkillMetadata> = {
  [_careerBreak.meta.id]: _careerBreak.meta,
  [_bodyMind.meta.id]: _bodyMind.meta,
  [_academicSprint.meta.id]: _academicSprint.meta,
  [_deepConnect.meta.id]: _deepConnect.meta,
  [_wealthControl.meta.id]: _wealthControl.meta,
  [_innerWild.meta.id]: _innerWild.meta,
  [_linear.meta.id]: _linear.meta,
  [_dimensional.meta.id]: _dimensional.meta,
  [_funnelFirst.meta.id]: _funnelFirst.meta,
  [_funnelIcebox.meta.id]: _funnelIcebox.meta,
  [_funnelSubsequent.meta.id]: _funnelSubsequent.meta,
  [_feature.meta.id]: _feature.meta,
  [_segment.meta.id]: _segment.meta,
  [_leaf.meta.id]: _leaf.meta,
  [_quarterly.meta.id]: _quarterly.meta,
};

export function listSkillMetadata(): SkillMetadata[] {
  return Object.values(SKILL_META);
}

export function getSkillMetadata(id: string): SkillMetadata | undefined {
  return SKILL_META[id];
}

// ─── Template engine ──────────────────────────────────────────────────────────

/**
 * Replace all {{VARIABLE}} placeholders in a skill template.
 * Pass strings from SKILL.* (already body-only).
 */
export function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    if (Object.prototype.hasOwnProperty.call(vars, key)) {
      return vars[key];
    }
    console.warn(`[skillLoader] Unfilled placeholder: {{${key}}}`);
    return match;
  });
}
