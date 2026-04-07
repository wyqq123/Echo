"""
FastAPI sidecar: exposes POST /search so FocusFunnel (via server.js proxy) can query Milvus.

Start once (before starting the Node server):
  cd Echo_web
  uvicorn store.rag_api:app --host 0.0.0.0 --port 8001

Environment: same as vector_store.py (reads Echo_web/.env automatically).
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from store.vector_store import (
    DEFAULT_MILVUS_URI,
    EchoTemplateMilvusStore,
    TemplateSearchFilters,
    _load_dotenv_if_present,
)

_load_dotenv_if_present()

app = FastAPI(title="Echo RAG API", version="1.0.0", description="Hybrid Milvus retrieval for FocusFunnel task templates")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Shared store instance (lazy: embedding model loads on first search, not at import time)
_store: EchoTemplateMilvusStore | None = None


def _get_store() -> EchoTemplateMilvusStore:
    global _store
    if _store is None:
        _store = EchoTemplateMilvusStore()
    return _store


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------


class SearchRequest(BaseModel):
    query: str = Field(..., description="User task text to query against templates")
    persona: str | None = Field(None, description="e.g. 'Product Manager', 'Operations', 'Software Engineer'")
    domain: str | None = Field(None, description="e.g. 'product_management', 'operations', 'engineering'")
    decomposition_type: str | None = Field(
        None, description="'linear' or 'dimensional'; pre-filter before vector search"
    )
    has_deliverable: bool | None = Field(None, description="Pre-filter on has_deliverable boolean")
    chain_equivalent: str | None = Field(None, description="e.g. 'chain.linear-decomposer'")
    top_k: int = Field(default=3, ge=1, le=20, description="Number of results to return")
    ranker: str = Field(default="rrf", description="'rrf' or 'weighted'")


class SearchResponse(BaseModel):
    results: list[dict[str, Any]]
    status: str = "ok"
    query: str = ""


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "milvus_uri": DEFAULT_MILVUS_URI,
    }


@app.post("/search", response_model=SearchResponse)
def search(req: SearchRequest) -> SearchResponse:
    """
    Hybrid-search (dense + sparse + scalar pre-filter) for the closest task template.

    Caller (server.js) should pass at minimum `query`; optionally narrow with
    `decomposition_type` derived from FocusFunnel's `skillsRouter` output.
    """
    try:
        dt = req.decomposition_type.lower() if req.decomposition_type else None
        filters = TemplateSearchFilters(
            persona=req.persona,
            domain=req.domain,
            decomposition_type=dt,
            has_deliverable=req.has_deliverable,
            chain_equivalent=req.chain_equivalent,
        )
        if not any(
            [
                filters.persona,
                filters.domain,
                filters.decomposition_type,
                filters.has_deliverable is not None,
                filters.chain_equivalent,
            ]
        ):
            filters = None

        store = _get_store()
        results = store.search_hybrid(
            req.query,
            filters=filters,
            top_k=req.top_k,
            ranker=req.ranker,
        )
        return SearchResponse(results=results, query=req.query)

    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
