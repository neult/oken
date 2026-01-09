import ast
from pathlib import Path

from loguru import logger

from .models import EntrypointType


class EntrypointDetector:
    """Detects the entrypoint type from agent code."""

    def detect(self, code_path: Path, entrypoint: str) -> EntrypointType:
        """
        Detect entrypoint type from code analysis.

        Detection priority:
        1. HTTP server patterns (FastAPI, Flask, uvicorn)
        2. Agent class with run() method
        3. Handler function (handler or main)
        4. Default to handler
        """
        entrypoint_file = code_path / entrypoint
        if not entrypoint_file.exists():
            logger.warning(f"Entrypoint file not found: {entrypoint_file}")
            return EntrypointType.HANDLER

        try:
            source = entrypoint_file.read_text()
            tree = ast.parse(source)
        except SyntaxError as e:
            logger.warning(f"Failed to parse {entrypoint}: {e}")
            return EntrypointType.HANDLER

        # Check for HTTP server patterns
        if self._has_http_server(tree, source):
            logger.info(f"Detected HTTP server in {entrypoint}")
            return EntrypointType.HTTP_SERVER

        # Check for Agent class
        if self._has_agent_class(tree):
            logger.info(f"Detected Agent class in {entrypoint}")
            return EntrypointType.AGENT_CLASS

        # Check for handler function
        if self._has_handler_function(tree):
            logger.info(f"Detected handler function in {entrypoint}")
            return EntrypointType.HANDLER

        # Default to handler
        logger.info(f"Defaulting to handler for {entrypoint}")
        return EntrypointType.HANDLER

    def _has_http_server(self, tree: ast.AST, source: str) -> bool:
        """Check for FastAPI/Flask/Starlette patterns."""
        # Quick string check for common patterns
        server_patterns = [
            "FastAPI(",
            "Flask(",
            "Starlette(",
            "uvicorn.run(",
            "app = FastAPI",
            "app = Flask",
        ]
        if any(pattern in source for pattern in server_patterns):
            return True

        # AST check for app assignment with framework call
        for node in ast.walk(tree):
            if isinstance(node, ast.Assign):
                for target in node.targets:
                    if isinstance(target, ast.Name) and target.id == "app":
                        if isinstance(node.value, ast.Call):
                            func = node.value.func
                            if isinstance(func, ast.Name) and func.id in (
                                "FastAPI",
                                "Flask",
                                "Starlette",
                            ):
                                return True
        return False

    def _has_agent_class(self, tree: ast.AST) -> bool:
        """Check for Agent class with run() method."""
        for node in ast.walk(tree):
            if isinstance(node, ast.ClassDef):
                # Check if class name contains "Agent" or is exactly "Agent"
                if "Agent" in node.name:
                    # Check for run() or invoke() method
                    for item in node.body:
                        if isinstance(item, ast.FunctionDef):
                            if item.name in ("run", "invoke", "__call__"):
                                return True
        return False

    def _has_handler_function(self, tree: ast.AST) -> bool:
        """Check for handler or main function at module level."""
        handler_names = ("handler", "main", "invoke", "run")
        for node in ast.iter_child_nodes(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                if node.name in handler_names:
                    return True
        return False
