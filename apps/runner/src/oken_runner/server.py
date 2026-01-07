from fastapi import FastAPI

app = FastAPI(title="Oken Runner")


@app.get("/health")
async def health():
    return {"status": "ok"}
