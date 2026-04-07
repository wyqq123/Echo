"""
Generate FocusFunnel-style workflow decomposition templates (JSON) via qwen-plus.

Uses DashScope OpenAI-compatible API. Install: pip install -r scripts/requirements-seed.txt

Environment:
  DASHSCOPE_API_KEY   Required. https://help.aliyun.com/zh/dashscope/
  Echo_web/.env       Optional; same key as DASHSCOPE_API_KEY=... (loaded if not already in the process env).

Usage:
  python scripts/seed_templates_base.py
  python scripts/seed_templates_base.py --output data/seed_templates.jsonl --concurrency 4
  python scripts/seed_templates_base.py --domain \"Product Manager\"   # single persona only
"""


from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

_PROJECT_ROOT = Path(__file__).resolve().parent.parent


def load_dotenv_if_present() -> None:
    """
    Merge Echo_web/.env into os.environ for keys not already set.

    Python does not load .env files by default. If the key only exists in .env (e.g. for Vite),
    a plain `python scripts/...` run would not see it without this step.
    """
    path = _PROJECT_ROOT / ".env"
    if not path.is_file():
        return
    try:
        text = path.read_text(encoding="utf-8-sig")
    except OSError:
        return
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].strip()
        if "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip()
        if len(val) >= 2 and val[0] == val[-1] and val[0] in "\"'":
            val = val[1:-1]
        if key and key not in os.environ:
            os.environ[key] = val


# ---------------------------------------------------------------------------
# High-frequency scenarios per persona (one template per cell for RAG seeding)
# ---------------------------------------------------------------------------

DOMAIN_TASK_MATRIX: dict[str, list[str]] = {
    "Product Manager": [
        "Competitive analysis",
        "Requirement document writing",
        "User research",
        "PRD review preparation",
        "Product iteration review",
        "Feature prioritization",
        "User story decomposition",
        "Data tracking plan",
    ],
    "Operations": [
        "Event planning",
        "Weekly data report",
        "User growth plan",
        "Content calendar creation",
        "KOL collaboration coordination",
        "Community operation SOP",
        "A/B test design",
    ],
    "Software Engineer": [
        "Technical solution design",
        "Code review",
        "Bug fix scheduling",
        "API documentation",
        "Performance optimization",
        "Unit test writing",
        "Deployment checklist",
    ],
}


def build_user_prompt(persona: str, scenario_name: str) -> str:
    """Single-scenario prompt keeps each request small (avoids huge multi-scenario contexts)."""
    return f"""You are designing reusable workflow decomposition templates for a productivity product (FocusFunnel-style RAG).

Target persona: {persona}
Target scenario (high-frequency work type): {scenario_name}

Goal: produce ONE reusable template for retrieval-augmented matching, not a one-off execution plan for a specific company.

Choose decomposition_type from:
- "linear": sequential deliverable workflow (starter → pre_actions → core_execution → post_actions)
- "dimensional": parallel leverage dimensions (core_objective → success_criteria → dimensions with weekly subtasks)

Pick the type that best fits this scenario (linear for ship/review/checklist flows; dimensional for growth/strategy/multi-track work).

Return ONLY valid JSON (no markdown fences, no comments). Schema:

{{
  "scenario_name": string (same as given),
  "persona": string (same as given),
  "domain": string (short slug, e.g. product_management, operations, engineering),
  "decomposition_type": "linear" | "dimensional",
  "intent_signals": string[3-5] (synonyms / alternate phrasings users might type),
  "has_deliverable": boolean,
  "retrieval_metadata": {{
    "keywords": string[5-12] (English or bilingual ok; include verbs and nouns),
    "chain_equivalent": "chain.linear-decomposer" | "chain.dimensional-decomposer"
  }},
  "output_template": {{
    "linear": {{
      "starter": string (one immediate action, <=30 chars),
      "pre_actions": string[] (0-2 items, each <=20 chars),
      "core_execution": string[] (2-4 items, verb-led, each <=30 chars, may include \"→ Deliverable: ...\" inline),
      "post_actions": string[] (1-2 closure items, each <=20 chars)
    }} | null,
    "dimensional": {{
      "core_objective": string (one sentence),
      "success_criteria": string (3-month, concrete),
      "dimensions": [
        {{
          "name": string,
          "subtasks": string[] (2-3 items, verb-led, optional \"(Estimated: Xh)\" at end, each <=30 chars for task text)
        }}
      ]
    }} | null
  }}
}}

Rules:
- Set the unused branch of output_template to null (if linear, dimensional is null and vice versa).
- chain_equivalent must be chain.linear-decomposer when decomposition_type is linear, else chain.dimensional-decomposer.
- Steps must be reusable patterns, not names of fictional products.
- Total JSON length should stay compact (roughly under 2500 characters if possible).
"""


def extract_json_object(text: str) -> dict[str, Any]:
    """Parse model output; tolerate optional ```json fences."""
    s = text.strip()
    fence = re.match(r"^```(?:json)?\s*([\s\S]*?)\s*```$", s, re.IGNORECASE)
    if fence:
        s = fence.group(1).strip()
    return json.loads(s)


def validate_template(obj: dict[str, Any]) -> None:
    required = [
        "scenario_name",
        "persona",
        "domain",
        "decomposition_type",
        "intent_signals",
        "has_deliverable",
        "retrieval_metadata",
        "output_template",
    ]
    for k in required:
        if k not in obj:
            raise ValueError(f"missing key: {k}")
    dt = obj["decomposition_type"]
    if dt not in ("linear", "dimensional"):
        raise ValueError("decomposition_type must be linear or dimensional")
    ot = obj["output_template"]
    if dt == "linear":
        if not isinstance(ot.get("linear"), dict):
            raise ValueError("output_template.linear required for linear type")
    else:
        if not isinstance(ot.get("dimensional"), dict):
            raise ValueError("output_template.dimensional required for dimensional type")


def build_embedding_text(template: dict[str, Any]) -> str:
    """Flatten for embedding / lexical retrieval (adjust to your pipeline)."""
    parts = [
        template.get("persona", ""),
        template.get("scenario_name", ""),
        template.get("domain", ""),
        template.get("decomposition_type", ""),
        " ".join(template.get("intent_signals") or []),
        " ".join((template.get("retrieval_metadata") or {}).get("keywords") or []),
        json.dumps(template.get("output_template"), ensure_ascii=False),
    ]
    return "\n".join(p for p in parts if p).strip()


async def call_qwen_plus(
    user_prompt: str,
    *,
    api_key: str,
    model: str,
    temperature: float,
    timeout_s: float,
) -> str:
    try:
        from openai import AsyncOpenAI
    except ImportError as e:
        raise SystemExit(
            "Missing dependency: pip install -r scripts/requirements-seed.txt"
        ) from e

    client = AsyncOpenAI(
        api_key=os.environ.get("DASHSCOPE_API_KEY"),
        base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
        timeout=timeout_s,
    )
    resp = await client.chat.completions.create(
        model=model,
        temperature=temperature,
        messages=[
            {
                "role": "system",
                "content": "You output only compact valid JSON objects. No prose, no markdown.",
            },
            {"role": "user", "content": user_prompt},
        ],
    )
    choice = resp.choices[0].message.content
    if not choice:
        raise RuntimeError("empty completion")
    return choice


async def generate_one_template(
    persona: str,
    scenario_name: str,
    *,
    api_key: str,
    model: str,
    temperature: float,
    timeout_s: float,
    sem: asyncio.Semaphore,
) -> dict[str, Any]:
    prompt = build_user_prompt(persona, scenario_name)
    async with sem:
        raw = await call_qwen_plus(
            prompt,
            api_key=api_key,
            model=model,
            temperature=temperature,
            timeout_s=timeout_s,
        )
    data = extract_json_object(raw)
    validate_template(data)
    data["template_id"] = f"tpl_{uuid4().hex[:12]}"
    data["generated_at"] = datetime.now(timezone.utc).isoformat()
    data["embedding_text"] = build_embedding_text(data)
    return data


async def generate_for_persona(
    persona: str,
    scenarios: list[str],
    *,
    api_key: str,
    model: str,
    temperature: float,
    timeout_s: float,
    sem: asyncio.Semaphore,
) -> list[dict[str, Any]]:
    """All scenarios for one persona; caller composes multiple personas in parallel."""
    tasks = [
        generate_one_template(
            persona,
            name,
            api_key=api_key,
            model=model,
            temperature=temperature,
            timeout_s=timeout_s,
            sem=sem,
        )
        for name in scenarios
    ]
    return await asyncio.gather(*tasks)


async def generate_seed_templates(
    *,
    matrix: dict[str, list[str]] | None = None,
    filter_persona: str | None = None,
    concurrency: int = 5,
    api_key: str | None = None,
    model: str = "qwen-plus",
    temperature: float = 0.3,
    timeout_s: float = 120.0,
) -> list[dict[str, Any]]:
    """
    Generate templates in parallel by persona (3 concurrent persona pipelines).
    A shared semaphore caps total in-flight requests so payload stays per-scenario, not one mega-prompt.
    """
    m = matrix or DOMAIN_TASK_MATRIX
    if filter_persona:
        if filter_persona not in m:
            raise ValueError(f"unknown persona: {filter_persona}")
        m = {filter_persona: m[filter_persona]}

    load_dotenv_if_present()
    key = (api_key or os.environ.get("DASHSCOPE_API_KEY") or "").strip()
    if not key:
        raise RuntimeError(
            "Missing DASHSCOPE_API_KEY. Export it in the shell before running, or set "
            f"DASHSCOPE_API_KEY in {_PROJECT_ROOT / '.env'} (this script loads that file if present)."
        )

    sem = asyncio.Semaphore(max(1, concurrency))
    personas = list(m.keys())
    per_persona_tasks = [
        generate_for_persona(
            p,
            m[p],
            api_key=key,
            model=model,
            temperature=temperature,
            timeout_s=timeout_s,
            sem=sem,
        )
        for p in personas
    ]
    nested = await asyncio.gather(*per_persona_tasks)
    out: list[dict[str, Any]] = []
    for chunk in nested:
        out.extend(chunk)
    return out


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Seed workflow templates via qwen-plus (DashScope).")
    p.add_argument(
        "--output",
        "-o",
        default="seed_templates.jsonl",
        help="JSONL output path (default: seed_templates.jsonl in cwd)",
    )
    p.add_argument(
        "--split-by-domain",
        action="store_true",
        help="Also write one JSONL per persona next to --output (e.g. *_Product_Manager.jsonl).",
    )
    p.add_argument("--domain", "-d", default=None, help="Only run this persona (exact matrix key).")
    p.add_argument("--concurrency", "-c", type=int, default=5, help="Max concurrent API calls.")
    p.add_argument("--model", default="qwen-plus", help="DashScope chat model id.")
    p.add_argument("--temperature", type=float, default=0.3)
    p.add_argument("--timeout", type=float, default=120.0, help="Per-request timeout seconds.")
    return p.parse_args(argv)


async def _async_main(args: argparse.Namespace) -> int:
    templates = await generate_seed_templates(
        filter_persona=args.domain,
        concurrency=args.concurrency,
        model=args.model,
        temperature=args.temperature,
        timeout_s=args.timeout,
    )
    out_path = args.output
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        for row in templates:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    print(f"Wrote {len(templates)} templates to {out_path}", file=sys.stderr)

    if args.split_by_domain:
        base, ext = os.path.splitext(out_path)
        if not ext:
            ext = ".jsonl"
        by_persona: dict[str, list[dict[str, Any]]] = {}
        for row in templates:
            by_persona.setdefault(row["persona"], []).append(row)
        for persona, rows in by_persona.items():
            safe = re.sub(r"[^\w\-]+", "_", persona).strip("_")
            path = f"{base}_{safe}{ext}"
            with open(path, "w", encoding="utf-8") as f:
                for row in rows:
                    f.write(json.dumps(row, ensure_ascii=False) + "\n")
            print(f"Wrote {len(rows)} templates to {path}", file=sys.stderr)
    return 0


def main() -> None:
    args = parse_args()
    try:
        raise SystemExit(asyncio.run(_async_main(args)))
    except KeyboardInterrupt:
        raise SystemExit(130)


if __name__ == "__main__":
    main()
    
