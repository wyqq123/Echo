# Commit Memory (Milestones)

Use this file for high-level milestones, not raw transcripts.

## Template

- Date:
- Milestone:
- Why it matters:
- Delivered artifacts:
- Follow-up:

---

## Milestones

- Date: 2026-04-09
- Milestone: Initialized Git-like memory mechanism baseline
- Why it matters: Establishes persistent context and traceability for agent work
- Delivered artifacts:
  - `MEMORY.md`
  - `memory/main.md`
  - `memory/branch/README.md`
  - `memory/branch/active-default.md`
  - `memory/commit.md`
  - `memory/log.md`
  - `memory/metadata/project-profile.md`
  - `memory/metadata/memory-policy.md`
- Follow-up:
  - Integrate memory update triggers into routine task execution

- Date: 2026-04-11
- Milestone: Task detail split — `memory/tasks/` + slim active branch pointer
- Why it matters: Separates iteration planning docs from agent execution workbooks; enables progressive disclosure
- Delivered artifacts:
  - `memory/tasks/README.md`
  - `memory/tasks/_template.md`
  - `memory/tasks/2026-04-11-memory-mechanism-bootstrap.md`
  - Updated `memory/branch/active-default.md`, `MEMORY.md`, `memory/main.md`, `memory/metadata/memory-policy.md`, `AGENT.md`
  - Clarified boundary in `doc/iterations/current/README.md`
- Follow-up:
  - Point `active-default.md` at new `memory/tasks/*.md` when switching tasks

- Date: 2026-04-11
- Milestone: `memory/main.md` — core conventions, key links; deduped memory routing vs `MEMORY.md`
- Why it matters: Non-overridable team/agent rules and repo/deploy pointers live in main; avoids duplicating recall/storage text
- Delivered artifacts:
  - Updated `memory/main.md` (核心约定, 关键链接, single pointer to `MEMORY.md`)
- Follow-up:
  - Fill **Deployment** URL in `memory/main.md` when environments exist

- Date: 2026-04-11
- Milestone: FocusFunnel RAG — Milvus hybrid templates + Onboarding context
- Why it matters: Reduces reliance on full LLM chain for common work scenarios; retrieval uses dense + sparse vectors and scalar filters aligned with user profile
- Delivered artifacts:
  - `store/vector_store.py`, `store/rag_api.py`, `store/requirements-milvus.txt`
  - `docker-compose.yml` — Milvus (etcd, minio, standalone) alongside Postgres
  - `server.js` — `POST /api/rag/search` proxy to Python sidecar
  - `services/geminiService.ts` — RAG-first `processTaskWithSkills`, `resolvePersonaFromProfile`, `renderTemplateAsWorkflowNote`
  - `types.ts` — `UserProfile.subRoles`; `EchoOnboarding.tsx` — persist `dynamicDomains` as `subRoles`
  - `scripts/seed_templates_base.py` (seed JSONL generation; env / parallel patterns as evolved in session)
- Follow-up:
  - Product decision on long-term use of `subRoles` (see `memory/main.md` Pending Decisions)
  - Optional: tune `RAG_CONFIDENCE_THRESHOLD` and persona keyword maps after production traffic

- Date: 2026-04-11
- Milestone: Forgetting strategy — `memory/archive/`, log distillation, task retention 30d
- Why it matters: Bounded working set; forgotten material lands under `archive/` with explicit rules
- Delivered artifacts:
  - `memory/archive/README.md`, `memory/archive/log/`, `memory/archive/task_branch/`
  - `MEMORY.md` § Forgetting & archive; `memory/metadata/memory-policy.md` updated; `memory/log.md` **Historical Log Summary** section; `memory/tasks/README.md` + `_template.md` **Completed** field
- Follow-up:
  - Run distillation when `## Entries` > 50; snapshot `log.md` to `archive/log/log-YYYY-Qn.md` on major releases; archive completed tasks after 30d

- Date: 2026-04-11
- Milestone: Forget policy split — `memory/metadata/forget-policy.md` + slim `MEMORY.md` / `archive/README.md`
- Why it matters: Full procedures load only when triggers fire; archive layout is separate from policy text
- Delivered artifacts:
  - `memory/metadata/forget-policy.md`; updated `MEMORY.md`, `memory/archive/README.md`, `memory/metadata/memory-policy.md`, `AGENT.md`, `memory/log.md`, `memory/tasks/README.md`, `memory/metadata/project-profile.md`
- Follow-up:
  - None

- Date: 2026-04-11
- Milestone: Error registry — `error-codes.md` columns + T4 archive to `memory/archive/errors-resolved.md`
- Why it matters: Traceability for incidents; cold storage without losing facts
- Delivered artifacts:
  - Updated `doc/reference/error-codes.md`, `memory/metadata/forget-policy.md` § C, `MEMORY.md` T4/post-write, `memory/archive/README.md`, `memory/archive/errors-resolved.md`, `doc/reference/README.md`, `memory/metadata/memory-policy.md`
- Follow-up:
  - Set real **First discovered** / **Last seen** when incidents are confirmed

