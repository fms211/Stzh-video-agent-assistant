"""
RAG 检索服务 — FastAPI 入口
启动: python main.py
端口: localhost:5000
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from retriever import retrieve, get_collection

app = FastAPI(title="腾昇智和 RAG 服务", version="1.0.0")

# CORS — 允许 Next.js 前端调用
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class RetrieveRequest(BaseModel):
    query: str
    top_k: int = 5
    score_threshold: float = 0.3


class RetrieveResult(BaseModel):
    id: str
    content: str
    metadata: dict
    score: float


class RetrieveResponse(BaseModel):
    results: list[RetrieveResult]
    query: str
    total: int


@app.get("/rag/health")
async def health():
    """健康检查"""
    collection = get_collection()
    return {
        "status": "ok",
        "entries": collection.count(),
    }


@app.post("/rag/retrieve", response_model=RetrieveResponse)
async def retrieve_endpoint(req: RetrieveRequest):
    """
    检索最相关的知识片段

    请求示例:
    {
        "query": "镜头往前推，贴近人物情绪",
        "top_k": 5,
        "score_threshold": 0.3
    }
    """
    results = retrieve(
        query=req.query,
        top_k=req.top_k,
        score_threshold=req.score_threshold,
    )

    return RetrieveResponse(
        results=[RetrieveResult(**r) for r in results],
        query=req.query,
        total=len(results),
    )


if __name__ == "__main__":
    import uvicorn
    print("=" * 60)
    print("  腾昇智和 RAG 服务启动")
    print("  http://localhost:5000")
    print("  文档: http://localhost:5000/docs")
    print("=" * 60)
    uvicorn.run(app, host="0.0.0.0", port=5000)
