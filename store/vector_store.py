"""
Milvus hybrid retrieval for `seed_templates` JSONL: scalar metadata filter + dense + sparse vectors.

- Dense + sparse: BGE-M3 via `pymilvus.model.hybrid.BGEM3EmbeddingFunction`
  (documents: `encode_documents`, queries: `encode_queries`).
- Metadata: Milvus boolean expression (`expr`) pre-filters rows before vector ANN + fusion.

依赖: pip install -r store/requirements-milvus.txt

Milvus 地址（无需每次在命令行填写）:
- 默认使用本文件中的常量 ``DEFAULT_MILVUS_URI``（本地单机 gRPC/HTTP 网关，一般为 19530 端口）。
- 若需覆盖：在 Echo_web/.env 中设置 ``MILVUS_URI=...``，或构造 ``EchoTemplateMilvusStore(milvus_uri="...")``；
  命令行 ``--uri`` 仅可选，不传则走上述默认 / 环境变量。

可选环境变量: HF_ENDPOINT（HuggingFace 镜像等）。
"""

from __future__ import annotations

import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

_PROJECT_ROOT = Path(__file__).resolve().parent.parent

# 默认 Milvus 连接 URI（单机 Docker / 本地安装常见为 19530）。部署到 Zilliz Cloud 等请改此处或改用 .env / 构造函数参数。
DEFAULT_MILVUS_URI = "http://localhost:19530"


def _load_dotenv_if_present() -> None:
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


def load_templates_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def _escape_expr_str(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def _build_filter_expr(filters: TemplateSearchFilters | None) -> str | None:
    if filters is None:
        return None
    parts: list[str] = []
    if filters.persona is not None:
        parts.append(f'persona == "{_escape_expr_str(filters.persona)}"')
    if filters.domain is not None:
        parts.append(f'domain == "{_escape_expr_str(filters.domain)}"')
    if filters.decomposition_type is not None:
        parts.append(f'decomposition_type == "{_escape_expr_str(filters.decomposition_type)}"')
    if filters.has_deliverable is not None:
        parts.append("has_deliverable == true" if filters.has_deliverable else "has_deliverable == false")
    if filters.chain_equivalent is not None:
        parts.append(f'chain_equivalent == "{_escape_expr_str(filters.chain_equivalent)}"')
    if not parts:
        return None
    return " and ".join(parts)


def _sparse_row_to_dict(sparse_batch: Any, row_idx: int) -> dict[int, float]:
    """One row of BGE-M3 sparse output -> Milvus SPARSE_FLOAT_VECTOR dict."""
    if hasattr(sparse_batch, "getrow"):
        row = sparse_batch.getrow(row_idx)
        return {int(c): float(v) for c, v in zip(row.indices, row.data)}
    row = sparse_batch[row_idx]
    if hasattr(row, "indices") and hasattr(row, "data"):
        return {int(c): float(v) for c, v in zip(row.indices, row.data)}
    if isinstance(row, dict):
        return {int(k): float(v) for k, v in row.items()}
    raise TypeError(f"Unsupported sparse row type: {type(row)}")


def _dense_row_to_list(dense_batch: Any, row_idx: int) -> list[float]:
    row = dense_batch[row_idx]
    if hasattr(row, "tolist"):
        return [float(x) for x in row.tolist()]
    return [float(x) for x in row]


@dataclass
class TemplateSearchFilters:
    """Scalar pre-filters combined with AND. None skips that field."""

    persona: str | None = None
    domain: str | None = None
    decomposition_type: str | None = None
    has_deliverable: bool | None = None
    chain_equivalent: str | None = None


class EchoTemplateMilvusStore:
    """Collection lifecycle, JSONL ingest, hybrid search (dense + sparse + metadata)."""

    def __init__(
        self,
        milvus_uri: str | None = None,
        collection_name: str = "echo_task_templates",
        device: str = "cpu",
        model_name: str = "BAAI/bge-m3",
    ) -> None:
        _load_dotenv_if_present()
        self.milvus_uri = milvus_uri or os.environ.get("MILVUS_URI") or DEFAULT_MILVUS_URI
        self.collection_name = collection_name
        self.device = device
        self.model_name = model_name
        self._ef = None
        self._dense_dim: int | None = None

    def _embedding_fn(self):
        if self._ef is None:
            try:
                from pymilvus.model.hybrid import BGEM3EmbeddingFunction
            except ImportError as e:
                raise ImportError(
                    "Install Milvus model extras: pip install -r store/requirements-milvus.txt"
                ) from e
            self._ef = BGEM3EmbeddingFunction(
                model_name=self.model_name,
                device=self.device,
                use_fp16=False,
                return_dense=True,
                return_sparse=True,
                normalize_embeddings=True,
            )
        return self._ef

    def dense_dimension(self) -> int:
        if self._dense_dim is not None:
            return self._dense_dim
        ef = self._embedding_fn()
        probe = ef.encode_documents(["probe"])
        self._dense_dim = int(probe["dense"].shape[1])
        return self._dense_dim

    def _connect(self) -> None:
        from pymilvus import connections

        connections.connect(alias="default", uri=self.milvus_uri)

    def _schema(self, dim: int):
        from pymilvus import CollectionSchema, DataType, FieldSchema

        fields = [
            FieldSchema(
                name="template_id", # 主键
                dtype=DataType.VARCHAR,
                is_primary=True,
                max_length=128,
                auto_id=False,
            ),
            FieldSchema(name="persona", dtype=DataType.VARCHAR, max_length=256),
            FieldSchema(name="domain", dtype=DataType.VARCHAR, max_length=128),
            FieldSchema(name="decomposition_type", dtype=DataType.VARCHAR, max_length=32),
            FieldSchema(name="has_deliverable", dtype=DataType.BOOL),
            FieldSchema(name="chain_equivalent", dtype=DataType.VARCHAR, max_length=256),
            FieldSchema(name="scenario_name", dtype=DataType.VARCHAR, max_length=1024),
            FieldSchema(name="embedding_text", dtype=DataType.VARCHAR, max_length=16384),
            FieldSchema(name="payload_json", dtype=DataType.VARCHAR, max_length=65535),
            FieldSchema(name="dense_vector", dtype=DataType.FLOAT_VECTOR, dim=dim),
            FieldSchema(name="sparse_vector", dtype=DataType.SPARSE_FLOAT_VECTOR),
        ]
        return CollectionSchema(fields=fields, description="Echo task templates (hybrid)")

    def _build_indexes(self, col) -> None:
        """Create ANN indexes if missing."""
        from pymilvus import Collection

        if not isinstance(col, Collection):
            return
        existing = {i.field_name for i in col.indexes}
        if "dense_vector" not in existing:
            col.create_index(
                field_name="dense_vector",
                index_params={
                    "index_type": "HNSW",
                    "metric_type": "COSINE",
                    "params": {"M": 16, "efConstruction": 200},
                },
            )
        if "sparse_vector" not in existing:
            col.create_index(
                field_name="sparse_vector",
                index_params={"index_type": "SPARSE_INVERTED_INDEX", "metric_type": "IP"},
            )

    def ingest_jsonl(
        self,
        jsonl_path: Path | str,
        *,
        drop_existing: bool = False,
        batch_size: int = 16,
    ) -> int:
        """
        Create collection (optional drop), embed with BGE-M3, insert, index, load.
        Returns inserted row count.
        """
        from pymilvus import Collection, utility

        path = Path(jsonl_path)
        templates = load_templates_jsonl(path)
        if not templates:
            return 0

        self._connect()
        ef = self._embedding_fn()
        dim = self.dense_dimension()

        if drop_existing and utility.has_collection(self.collection_name):
            utility.drop_collection(self.collection_name)

        if utility.has_collection(self.collection_name):
            probe = Collection(self.collection_name)
            probe.flush()
            if probe.num_entities > 0 and not drop_existing:
                raise ValueError(
                    f"Collection {self.collection_name!r} already has {probe.num_entities} rows. "
                    "Pass drop_existing=True to rebuild, or use a different collection_name."
                )

        if not utility.has_collection(self.collection_name):
            Collection(name=self.collection_name, schema=self._schema(dim))

        col = Collection(self.collection_name)

        template_ids: list[str] = []
        personas: list[str] = []
        domains: list[str] = []
        decomp: list[str] = []
        has_del: list[bool] = []
        chains: list[str] = []
        scenarios: list[str] = []
        embed_texts: list[str] = []
        payloads: list[str] = []
        texts_for_emb: list[str] = []

        for t in templates:
            tid = str(t.get("template_id") or "")
            if not tid:
                raise ValueError("Each JSONL row must include template_id")
            meta = t.get("retrieval_metadata") or {}
            chain_eq = str(meta.get("chain_equivalent") or "")
            emb_t = str(t.get("embedding_text") or "")
            payload = json.dumps(t, ensure_ascii=False)
            if len(payload.encode("utf-8")) > 65535:
                raise ValueError(f"payload_json too large for template_id={tid}")

            template_ids.append(tid)
            personas.append(str(t.get("persona") or ""))
            domains.append(str(t.get("domain") or ""))
            decomp.append(str(t.get("decomposition_type") or ""))
            has_del.append(bool(t.get("has_deliverable", False)))
            chains.append(chain_eq)
            scenarios.append(str(t.get("scenario_name") or ""))
            embed_texts.append(emb_t[:16384])
            payloads.append(payload)
            texts_for_emb.append(emb_t)

        dense_vecs: list[list[float]] = []
        sparse_vecs: list[dict[int, float]] = []
        for i in range(0, len(texts_for_emb), batch_size):
            batch = texts_for_emb[i : i + batch_size]
            emb = ef.encode_documents(batch)
            dmat, smat = emb["dense"], emb["sparse"]
            for j in range(len(batch)):
                dense_vecs.append(_dense_row_to_list(dmat, j))
                sparse_vecs.append(_sparse_row_to_dict(smat, j))

        col.insert(
            [
                template_ids,
                personas,
                domains,
                decomp,
                has_del,
                chains,
                scenarios,
                embed_texts,
                payloads,
                dense_vecs,
                sparse_vecs,
            ]
        )
        col.flush()
        self._build_indexes(col)
        col.load()
        return len(template_ids)

    def search_hybrid(
        self,
        query_text: str,
        *,
        filters: TemplateSearchFilters | None = None,
        top_k: int = 5,
        prefetch: int | None = None,
        ranker: Literal["rrf", "weighted"] = "rrf",
        dense_weight: float = 0.6,
        sparse_weight: float = 0.4,
    ) -> list[dict[str, Any]]:
        """
        Encode query with BGE-M3 (`encode_queries`), run dense + sparse ANN, fuse, return template dicts.

        `expr` from filters is applied inside each AnnSearchRequest path (pre-filter).
        """
        from pymilvus import AnnSearchRequest, Collection, RRFRanker, WeightedRanker

        self._connect()
        ef = self._embedding_fn()
        q = ef.encode_queries([query_text])
        q_dense = _dense_row_to_list(q["dense"], 0)
        q_sparse = _sparse_row_to_dict(q["sparse"], 0)

        col = Collection(self.collection_name)
        col.load()

        n_pref = prefetch if prefetch is not None else max(top_k * 8, 32)
        expr = _build_filter_expr(filters)

        dense_req = AnnSearchRequest(
            data=[q_dense],
            anns_field="dense_vector",
            param={"metric_type": "COSINE", "params": {"ef": 64}},
            limit=n_pref,
            expr=expr,
        )
        sparse_req = AnnSearchRequest(
            data=[q_sparse],
            anns_field="sparse_vector",
            param={"metric_type": "IP", "params": {}},
            limit=n_pref,
            expr=expr,
        )

        if ranker == "weighted":
            rerank = WeightedRanker(dense_weight, sparse_weight)
        else:
            rerank = RRFRanker()

        raw = col.hybrid_search(
            reqs=[dense_req, sparse_req],
            rerank=rerank,
            limit=top_k,
            output_fields=[
                "template_id",
                "persona",
                "domain",
                "decomposition_type",
                "scenario_name",
                "payload_json",
            ],
        )

        hits: list[dict[str, Any]] = []
        for hit_group in raw:
            for hit in hit_group:
                # pymilvus Hit is dict-like; `.entity` may alias the hit itself — read output_fields on `hit`.
                entity = hit.entity if hasattr(hit, "entity") else hit
                payload = entity.get("payload_json")
                if payload:
                    try:
                        tpl = json.loads(payload)
                    except json.JSONDecodeError:
                        tpl = {"raw_payload_json": payload}
                else:
                    tpl = {}
                tpl["_distance"] = getattr(hit, "distance", None)
                tpl["_score"] = getattr(hit, "score", None)
                hits.append(tpl)
        return hits


def _cli() -> int:
    import argparse

    _load_dotenv_if_present()
    p = argparse.ArgumentParser(description="Milvus hybrid index / search for seed_templates JSONL")
    sub = p.add_subparsers(dest="cmd", required=True)

    pi = sub.add_parser("ingest", help="Create/load collection and insert JSONL")
    pi.add_argument("jsonl", type=Path, help="Path to seed_templates.jsonl")
    pi.add_argument("--drop", action="store_true", help="Drop collection if it exists")
    pi.add_argument("--collection", default="echo_task_templates")
    pi.add_argument(
        "--uri",
        default=None,
        help=f"Override Milvus URI (default: env MILVUS_URI or code constant DEFAULT_MILVUS_URI={DEFAULT_MILVUS_URI!r})",
    )
    pi.add_argument("--device", default="cpu")

    ps = sub.add_parser("search", help="Run one hybrid search (collection must exist)")
    ps.add_argument("query", type=str, help="User task description")
    ps.add_argument("--collection", default="echo_task_templates")
    ps.add_argument(
        "--uri",
        default=None,
        help=f"Override Milvus URI (default: env MILVUS_URI or DEFAULT_MILVUS_URI={DEFAULT_MILVUS_URI!r})",
    )
    ps.add_argument("--top-k", type=int, default=5)
    ps.add_argument("--persona", default=None)
    ps.add_argument("--domain", default=None)
    ps.add_argument("--decomposition-type", default=None)
    ps.add_argument("--chain", default=None, dest="chain_equivalent")
    ps.add_argument(
        "--has-deliverable",
        choices=("true", "false"),
        default=None,
        help="Filter on has_deliverable",
    )
    ps.add_argument("--ranker", choices=("rrf", "weighted"), default="rrf")
    ps.add_argument("--device", default="cpu")

    args = p.parse_args()
    store = EchoTemplateMilvusStore(milvus_uri=args.uri, collection_name=args.collection, device=args.device)

    if args.cmd == "ingest":
        n = store.ingest_jsonl(args.jsonl, drop_existing=args.drop)
        print(f"Inserted {n} templates into {args.collection}", file=sys.stderr)
        return 0

    hd: bool | None = None
    if args.has_deliverable is not None:
        hd = args.has_deliverable == "true"
    flt = TemplateSearchFilters(
        persona=args.persona,
        domain=args.domain,
        decomposition_type=args.decomposition_type,
        chain_equivalent=args.chain_equivalent,
        has_deliverable=hd,
    )
    if not any(
        [
            flt.persona,
            flt.domain,
            flt.decomposition_type,
            flt.chain_equivalent,
            flt.has_deliverable is not None,
        ]
    ):
        flt = None

    results = store.search_hybrid(args.query, filters=flt, top_k=args.top_k, ranker=args.ranker)
    json.dump(results, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(_cli())
