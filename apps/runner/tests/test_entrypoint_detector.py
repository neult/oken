"""Tests for entrypoint_detector.py - AST-based code analysis."""

from pathlib import Path

import pytest

from oken_runner.entrypoint_detector import EntrypointDetector
from oken_runner.exceptions import ConfigError
from oken_runner.models import EntrypointType

# Agent code samples for testing
HANDLER_SIMPLE = """
def handler(input: dict) -> dict:
    name = input.get("name", "World")
    return {"greeting": f"Hello, {name}!"}
"""

HANDLER_ASYNC = """
import asyncio

async def handler(input: dict) -> dict:
    await asyncio.sleep(0.1)
    return {"result": input.get("value", 0) * 2}
"""

HANDLER_MAIN = """
def main(input: dict) -> dict:
    return {"processed": True, "data": input}
"""

HANDLER_INVOKE = """
def invoke(input: dict) -> dict:
    return {"invoked": True}
"""

HANDLER_RUN = """
def run(input: dict) -> dict:
    return {"ran": True}
"""

AGENT_CLASS_SIMPLE = """
class Agent:
    def __init__(self):
        self.counter = 0

    def run(self, input: dict) -> dict:
        self.counter += 1
        return {"count": self.counter, "input": input}
"""

AGENT_CLASS_WITH_SETUP = """
class MyAgent:
    def setup(self):
        self.model = "initialized"

    def run(self, input: dict) -> dict:
        return {"model": self.model, "query": input.get("query")}
"""

AGENT_CLASS_ASYNC = """
class AsyncAgent:
    async def run(self, input: dict) -> dict:
        import asyncio
        await asyncio.sleep(0.01)
        return {"async": True}
"""

AGENT_CLASS_INVOKE = """
class TaskAgent:
    def invoke(self, input: dict) -> dict:
        return {"invoked": True}
"""

AGENT_CLASS_CALL = """
class CallableAgent:
    def __call__(self, input: dict) -> dict:
        return {"called": True}
"""

HTTP_FASTAPI = """
from fastapi import FastAPI

app = FastAPI()

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.post("/invoke")
async def invoke(request: dict):
    return {"output": request.get("input", {})}
"""

HTTP_FLASK = """
from flask import Flask, jsonify, request

app = Flask(__name__)

@app.route("/health")
def health():
    return jsonify({"status": "ok"})

@app.route("/invoke", methods=["POST"])
def invoke():
    data = request.get_json()
    return jsonify({"output": data.get("input", {})})
"""

HTTP_STARLETTE = """
from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.routing import Route

async def health(request):
    return JSONResponse({"status": "ok"})

app = Starlette(routes=[Route("/health", health)])
"""

HTTP_UVICORN_RUN = """
import uvicorn
from fastapi import FastAPI

app = FastAPI()

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8080)
"""

LANGCHAIN_AGENT = """
from langchain.agents import AgentExecutor, create_react_agent
from langchain_openai import ChatOpenAI

class LangChainAgent:
    def __init__(self):
        self.llm = ChatOpenAI()

    def run(self, input: dict) -> dict:
        query = input.get("query", "")
        return {"response": f"Processed: {query}"}
"""

CREWAI_CREW = """
from crewai import Agent, Crew, Task

class CrewAIAgent:
    def setup(self):
        self.researcher = Agent(
            role="Researcher",
            goal="Research topics",
            backstory="Expert researcher"
        )
        self.crew = Crew(agents=[self.researcher], tasks=[])

    def run(self, input: dict) -> dict:
        task = Task(description=input.get("task", ""))
        result = self.crew.kickoff()
        return {"result": str(result)}
"""

INVALID_SYNTAX = """
def handler(input: dict) -> dict:
    return {"broken"  # Missing closing brace
"""

NO_HANDLER = """
def helper_function():
    return "helper"

class NotAnAgent:
    def process(self):
        pass
"""

MIXED_HANDLER_AND_AGENT = """
def handler(input: dict) -> dict:
    return {"from": "handler"}

class Agent:
    def run(self, input: dict) -> dict:
        return {"from": "agent"}
"""

MIXED_HTTP_AND_HANDLER = """
from fastapi import FastAPI

app = FastAPI()

def handler(input: dict) -> dict:
    return {"from": "handler"}

@app.post("/invoke")
async def invoke(request: dict):
    return {"from": "http"}
"""


class TestHandlerDetection:
    """Tests for handler function detection."""

    def test_detect_handler_simple(
        self, entrypoint_detector: EntrypointDetector, code_workspace: Path
    ):
        """Detects simple handler() function."""
        (code_workspace / "main.py").write_text(HANDLER_SIMPLE)
        result = entrypoint_detector.detect(code_workspace, "main.py")
        assert result == EntrypointType.HANDLER

    def test_detect_handler_async(
        self, entrypoint_detector: EntrypointDetector, code_workspace: Path
    ):
        """Detects async handler() function."""
        (code_workspace / "main.py").write_text(HANDLER_ASYNC)
        result = entrypoint_detector.detect(code_workspace, "main.py")
        assert result == EntrypointType.HANDLER

    def test_detect_handler_main(
        self, entrypoint_detector: EntrypointDetector, code_workspace: Path
    ):
        """Detects main() function as handler."""
        (code_workspace / "main.py").write_text(HANDLER_MAIN)
        result = entrypoint_detector.detect(code_workspace, "main.py")
        assert result == EntrypointType.HANDLER

    def test_detect_handler_invoke(
        self, entrypoint_detector: EntrypointDetector, code_workspace: Path
    ):
        """Detects invoke() function as handler."""
        (code_workspace / "main.py").write_text(HANDLER_INVOKE)
        result = entrypoint_detector.detect(code_workspace, "main.py")
        assert result == EntrypointType.HANDLER

    def test_detect_handler_run(
        self, entrypoint_detector: EntrypointDetector, code_workspace: Path
    ):
        """Detects run() function as handler."""
        (code_workspace / "main.py").write_text(HANDLER_RUN)
        result = entrypoint_detector.detect(code_workspace, "main.py")
        assert result == EntrypointType.HANDLER


class TestAgentClassDetection:
    """Tests for Agent class detection."""

    def test_detect_agent_class_simple(
        self, entrypoint_detector: EntrypointDetector, code_workspace: Path
    ):
        """Detects simple Agent class with run() method."""
        (code_workspace / "main.py").write_text(AGENT_CLASS_SIMPLE)
        result = entrypoint_detector.detect(code_workspace, "main.py")
        assert result == EntrypointType.AGENT_CLASS

    def test_detect_agent_class_with_setup(
        self, entrypoint_detector: EntrypointDetector, code_workspace: Path
    ):
        """Detects Agent class with setup() method."""
        (code_workspace / "main.py").write_text(AGENT_CLASS_WITH_SETUP)
        result = entrypoint_detector.detect(code_workspace, "main.py")
        assert result == EntrypointType.AGENT_CLASS

    def test_detect_agent_class_async(
        self, entrypoint_detector: EntrypointDetector, code_workspace: Path
    ):
        """Detects Agent class with async run() method."""
        (code_workspace / "main.py").write_text(AGENT_CLASS_ASYNC)
        result = entrypoint_detector.detect(code_workspace, "main.py")
        assert result == EntrypointType.AGENT_CLASS

    def test_detect_agent_class_invoke(
        self, entrypoint_detector: EntrypointDetector, code_workspace: Path
    ):
        """Detects Agent class with invoke() method."""
        (code_workspace / "main.py").write_text(AGENT_CLASS_INVOKE)
        result = entrypoint_detector.detect(code_workspace, "main.py")
        assert result == EntrypointType.AGENT_CLASS

    def test_detect_agent_class_call(
        self, entrypoint_detector: EntrypointDetector, code_workspace: Path
    ):
        """Detects Agent class with __call__() method."""
        (code_workspace / "main.py").write_text(AGENT_CLASS_CALL)
        result = entrypoint_detector.detect(code_workspace, "main.py")
        assert result == EntrypointType.AGENT_CLASS

    def test_detect_langchain_agent(
        self, entrypoint_detector: EntrypointDetector, code_workspace: Path
    ):
        """Detects LangChain-style agent class."""
        (code_workspace / "main.py").write_text(LANGCHAIN_AGENT)
        result = entrypoint_detector.detect(code_workspace, "main.py")
        assert result == EntrypointType.AGENT_CLASS

    def test_detect_crewai_agent(
        self, entrypoint_detector: EntrypointDetector, code_workspace: Path
    ):
        """Detects CrewAI-style agent class."""
        (code_workspace / "main.py").write_text(CREWAI_CREW)
        result = entrypoint_detector.detect(code_workspace, "main.py")
        assert result == EntrypointType.AGENT_CLASS


class TestHTTPServerDetection:
    """Tests for HTTP server detection."""

    def test_detect_fastapi(
        self, entrypoint_detector: EntrypointDetector, code_workspace: Path
    ):
        """Detects FastAPI application."""
        (code_workspace / "main.py").write_text(HTTP_FASTAPI)
        result = entrypoint_detector.detect(code_workspace, "main.py")
        assert result == EntrypointType.HTTP_SERVER

    def test_detect_flask(
        self, entrypoint_detector: EntrypointDetector, code_workspace: Path
    ):
        """Detects Flask application."""
        (code_workspace / "main.py").write_text(HTTP_FLASK)
        result = entrypoint_detector.detect(code_workspace, "main.py")
        assert result == EntrypointType.HTTP_SERVER

    def test_detect_starlette(
        self, entrypoint_detector: EntrypointDetector, code_workspace: Path
    ):
        """Detects Starlette application."""
        (code_workspace / "main.py").write_text(HTTP_STARLETTE)
        result = entrypoint_detector.detect(code_workspace, "main.py")
        assert result == EntrypointType.HTTP_SERVER

    def test_detect_uvicorn_run(
        self, entrypoint_detector: EntrypointDetector, code_workspace: Path
    ):
        """Detects uvicorn.run() pattern."""
        (code_workspace / "main.py").write_text(HTTP_UVICORN_RUN)
        result = entrypoint_detector.detect(code_workspace, "main.py")
        assert result == EntrypointType.HTTP_SERVER


class TestDetectionPriority:
    """Tests for detection priority (HTTP > Agent > Handler)."""

    def test_http_takes_priority_over_handler(
        self, entrypoint_detector: EntrypointDetector, code_workspace: Path
    ):
        """HTTP server detection takes priority over handler."""
        (code_workspace / "main.py").write_text(MIXED_HTTP_AND_HANDLER)
        result = entrypoint_detector.detect(code_workspace, "main.py")
        assert result == EntrypointType.HTTP_SERVER

    def test_agent_takes_priority_over_handler(
        self, entrypoint_detector: EntrypointDetector, code_workspace: Path
    ):
        """Agent class detection takes priority over handler function."""
        (code_workspace / "main.py").write_text(MIXED_HANDLER_AND_AGENT)
        result = entrypoint_detector.detect(code_workspace, "main.py")
        assert result == EntrypointType.AGENT_CLASS


class TestEdgeCases:
    """Tests for edge cases and error handling."""

    def test_syntax_error_defaults_to_handler(
        self, entrypoint_detector: EntrypointDetector, code_workspace: Path
    ):
        """Syntax errors default to handler type."""
        (code_workspace / "main.py").write_text(INVALID_SYNTAX)
        result = entrypoint_detector.detect(code_workspace, "main.py")
        assert result == EntrypointType.HANDLER

    def test_no_handler_defaults_to_handler(
        self, entrypoint_detector: EntrypointDetector, code_workspace: Path
    ):
        """No recognized pattern defaults to handler type."""
        (code_workspace / "main.py").write_text(NO_HANDLER)
        result = entrypoint_detector.detect(code_workspace, "main.py")
        assert result == EntrypointType.HANDLER

    def test_missing_file_raises_error(
        self, entrypoint_detector: EntrypointDetector, code_workspace: Path
    ):
        """Missing entrypoint file raises ConfigError."""
        with pytest.raises(ConfigError, match="Entrypoint file not found"):
            entrypoint_detector.detect(code_workspace, "nonexistent.py")

    def test_empty_file_defaults_to_handler(
        self, entrypoint_detector: EntrypointDetector, code_workspace: Path
    ):
        """Empty file defaults to handler type."""
        (code_workspace / "main.py").write_text("")
        result = entrypoint_detector.detect(code_workspace, "main.py")
        assert result == EntrypointType.HANDLER

    def test_only_comments_defaults_to_handler(
        self, entrypoint_detector: EntrypointDetector, code_workspace: Path
    ):
        """File with only comments defaults to handler type."""
        (code_workspace / "main.py").write_text("# Just a comment\n# Another comment")
        result = entrypoint_detector.detect(code_workspace, "main.py")
        assert result == EntrypointType.HANDLER
