"""MCP Tool Gateway Python Client

A Python client library for interacting with the MCP Tool Gateway service,
which provides provider-agnostic access to MCP (Model Context Protocol) servers
with support for Gemini, OpenAI, xAI, and other AI providers.

Example usage with Gemini:
    >>> from mcp_tool_gateway import GatewayClient
    >>> import google.generativeai as genai
    >>>
    >>> # Initialize gateway client
    >>> gateway = GatewayClient("http://localhost:8787")
    >>>
    >>> # Get tools in Gemini format
    >>> tools = gateway.get_tools("gemini", server="default")
    >>>
    >>> # Create Gemini model with tools
    >>> model = genai.GenerativeModel('gemini-1.5-pro',
    ...                                tools=tools['function_declarations'])
    >>> chat = model.start_chat()
    >>>
    >>> # Send message and handle function calls
    >>> response = chat.send_message("What tasks do I have?")
    >>> if response.candidates[0].content.parts[0].function_call:
    ...     fc = response.candidates[0].content.parts[0].function_call
    ...     result = gateway.execute("gemini", {
    ...         "name": fc.name,
    ...         "args": dict(fc.args)
    ...     }, server="default")

Example usage with OpenAI:
    >>> from mcp_tool_gateway import GatewayClient
    >>> import openai
    >>>
    >>> gateway = GatewayClient("http://localhost:8787")
    >>> tools = gateway.get_tools("openai", server="default")
    >>>
    >>> client = openai.OpenAI()
    >>> response = client.chat.completions.create(
    ...     model="gpt-4o-mini",
    ...     messages=[{"role": "user", "content": "What is 15 plus 27?"}],
    ...     tools=tools["tools"]
    ... )
    >>>
    >>> # Execute tool calls
    >>> message = response.choices[0].message
    >>> if message.tool_calls:
    ...     for tool_call in message.tool_calls:
    ...         result = gateway.execute("openai", {
    ...             "name": tool_call.function.name,
    ...             "arguments": tool_call.function.arguments
    ...         }, server="default")
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass
from typing import Any, Literal, Mapping, Optional
import urllib.request
import urllib.error

# Type aliases for better documentation
Provider = Literal["gemini", "openai", "xai"]
ToolSchema = dict[str, Any]
ExecutionResult = Any


@dataclass
class GatewayClient:
    """Client for interacting with the MCP Tool Gateway HTTP API.

    This client provides methods for discovering tools from MCP servers in
    provider-specific formats and executing tool calls with automatic retries
    and error handling.

    Attributes:
        base_url: The base URL of the gateway service (e.g., "http://localhost:8787")
        timeout: Request timeout in seconds (default: 60.0)
        max_retries: Maximum number of retry attempts for failed requests (default: 3)
        retry_delay: Initial delay between retries in seconds (default: 1.0)
        retry_backoff: Exponential backoff multiplier for retries (default: 2.0)

    Example:
        >>> client = GatewayClient("http://localhost:8787", timeout=30.0, max_retries=5)
        >>> tools = client.get_tools("gemini")
        >>> result = client.execute("gemini", {"name": "add", "args": {"a": 1, "b": 2}})
    """

    base_url: str
    timeout: float = 60.0
    max_retries: int = 3
    retry_delay: float = 1.0
    retry_backoff: float = 2.0

    def _make_request(
        self,
        url: str,
        data: Optional[bytes] = None,
        method: str = "GET"
    ) -> dict[str, Any]:
        """Make an HTTP request with retry logic and error handling.

        Args:
            url: The full URL to request
            data: Optional request body (JSON-encoded bytes)
            method: HTTP method (GET or POST)

        Returns:
            The JSON response as a dictionary

        Raises:
            RuntimeError: If the request fails after all retries or returns an error
        """
        headers = {"Content-Type": "application/json"} if data else {}
        delay = self.retry_delay
        last_error: Exception | None = None

        for attempt in range(self.max_retries + 1):
            try:
                req = urllib.request.Request(url, data=data, headers=headers, method=method)
                with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                    return json.loads(resp.read().decode('utf-8'))

            except urllib.error.HTTPError as e:
                # Extract error details from response body
                body = ""
                try:
                    body = e.read().decode('utf-8')
                except Exception:
                    pass

                if body:
                    try:
                        detail = json.loads(body)
                        msg = detail.get("error") or body
                    except Exception:
                        msg = body
                else:
                    msg = e.reason

                # Don't retry 4xx errors (client errors)
                if 400 <= e.code < 500:
                    raise RuntimeError(f"Gateway HTTP {e.code}: {msg}") from e

                last_error = RuntimeError(f"Gateway HTTP {e.code}: {msg}")

            except (urllib.error.URLError, OSError, TimeoutError) as e:
                # Network errors - retry these
                last_error = RuntimeError(f"Network error: {e}")

            # If this wasn't the last attempt, wait before retrying
            if attempt < self.max_retries:
                time.sleep(delay)
                delay *= self.retry_backoff

        # All retries exhausted
        raise RuntimeError(
            f"Request failed after {self.max_retries + 1} attempts"
        ) from last_error

    def get_tools(
        self,
        provider: Provider,
        server: Optional[str] = None
    ) -> ToolSchema:
        """Get tools from an MCP server in provider-specific format.

        Retrieves the list of available tools from the specified MCP server,
        translated into the format expected by the given AI provider.

        Args:
            provider: The AI provider format ("gemini", "openai", or "xai")
            server: Optional server name (defaults to "default" on gateway)

        Returns:
            A dictionary containing the tools in provider-specific format:
            - Gemini: {"function_declarations": [...]}
            - OpenAI: {"tools": [{"type": "function", "function": {...}}, ...]}
            - xAI: {"tools": [{"type": "function", "function": {...}}, ...]}

        Raises:
            RuntimeError: If the request fails or the server returns an error

        Example:
            >>> client = GatewayClient("http://localhost:8787")
            >>>
            >>> # Get tools for Gemini
            >>> gemini_tools = client.get_tools("gemini", server="default")
            >>> print(gemini_tools["function_declarations"][0]["name"])

            >>> # Get tools for OpenAI
            >>> openai_tools = client.get_tools("openai")
            >>> print(openai_tools["tools"][0]["function"]["name"])
        """
        url = f"{self.base_url}/tools/{provider}"
        if server:
            url += f"?server={server}"

        return self._make_request(url)

    def execute(
        self,
        provider: Provider,
        call: Mapping[str, Any],
        server: Optional[str] = None
    ) -> ExecutionResult:
        """Execute a tool call via the gateway using provider-specific format.

        Translates a provider-specific tool call to MCP format, executes it
        on the MCP server, and returns the result.

        Args:
            provider: The AI provider format ("gemini", "openai", or "xai")
            call: The tool call in provider-specific format:
                - Gemini: {"name": "tool_name", "args": {...}}
                - OpenAI: {"name": "tool_name", "arguments": "{...}"}  (JSON string)
                - xAI: {"name": "tool_name", "arguments": "{...}"}  (JSON string)
            server: Optional server name (defaults to "default" on gateway)

        Returns:
            The execution result from the MCP server (format varies by tool)

        Raises:
            RuntimeError: If the request fails or the tool execution fails

        Example with Gemini:
            >>> client = GatewayClient("http://localhost:8787")
            >>> result = client.execute("gemini", {
            ...     "name": "add",
            ...     "args": {"a": 15, "b": 27}
            ... }, server="default")
            >>> print(result)
            42

        Example with OpenAI:
            >>> result = client.execute("openai", {
            ...     "name": "add",
            ...     "arguments": '{"a": 15, "b": 27}'  # Note: JSON string
            ... }, server="default")
            >>> print(result)
            42
        """
        url = f"{self.base_url}/execute"
        payload = {
            "provider": provider,
            "call": call,
        }
        if server:
            payload["server"] = server

        data = json.dumps(payload).encode('utf-8')
        response = self._make_request(url, data=data, method="POST")

        # Check for errors in response
        if 'error' in response:
            raise RuntimeError(response['error'])

        return response.get('result')

    def call_tool(
        self,
        server: str,
        tool: str,
        arguments: Mapping[str, Any]
    ) -> Any:
        """Execute a tool using the legacy generic format.

        This method uses the generic `/call_tool` endpoint which doesn't require
        provider-specific formatting. Useful for direct MCP tool invocation.

        Args:
            server: The MCP server name
            tool: The tool name to execute
            arguments: The tool arguments as a dictionary

        Returns:
            The execution result from the MCP server

        Raises:
            RuntimeError: If the request fails or the tool execution fails

        Example:
            >>> client = GatewayClient("http://localhost:8787")
            >>> result = client.call_tool(
            ...     server="default",
            ...     tool="add",
            ...     arguments={"a": 10, "b": 20}
            ... )
            >>> print(result)
            30

        Note:
            For provider-specific workflows, prefer using `execute()` with the
            appropriate provider format instead of this method.
        """
        url = f"{self.base_url}/call_tool"
        payload = {"server": server, "tool": tool, "arguments": arguments}
        data = json.dumps(payload).encode('utf-8')

        response = self._make_request(url, data=data, method="POST")

        if 'error' in response:
            raise RuntimeError(response['error'])

        return response.get('result')

    def tools(self, server: Optional[str] = None) -> dict[str, Any]:
        """Get raw MCP tool schemas (not provider-specific).

        Returns the tools in their original MCP format without any provider-specific
        translation. Useful for debugging or when you need the raw schema.

        Args:
            server: Optional server name (defaults to "default" on gateway)

        Returns:
            Dictionary containing raw MCP tool schemas

        Raises:
            RuntimeError: If the request fails

        Example:
            >>> client = GatewayClient("http://localhost:8787")
            >>> mcp_tools = client.tools(server="default")
            >>> print(mcp_tools)

        Note:
            For provider-specific formats, use `get_tools(provider)` instead.
        """
        url = f"{self.base_url}/tools"
        if server:
            url += f"?server={server}"

        return self._make_request(url)

    def logs(
        self,
        server: str,
        since: Optional[str] = None,
        limit: int = 100
    ) -> list[dict[str, Any]]:
        """Retrieve execution logs from the gateway.

        Returns recent tool execution logs from the specified MCP server,
        useful for debugging and monitoring.

        Args:
            server: The MCP server name
            since: Optional ISO 8601 timestamp to filter logs after this time
            limit: Maximum number of log entries to return (default: 100)

        Returns:
            List of log entries, each containing:
            - timestamp: ISO 8601 timestamp
            - tool: Tool name that was executed
            - input: Tool input arguments
            - result: Tool execution result (if successful)
            - error: Error message (if failed)

        Raises:
            RuntimeError: If the request fails

        Example:
            >>> client = GatewayClient("http://localhost:8787")
            >>> logs = client.logs(server="default", limit=10)
            >>> for entry in logs:
            ...     print(f"{entry['timestamp']}: {entry['tool']} - {entry['result']}")
        """
        from urllib.parse import urlencode

        qs = {"server": server, "limit": limit}
        if since:
            qs["since"] = since

        url = f"{self.base_url}/logs?{urlencode(qs)}"
        return self._make_request(url)

    def health(self) -> dict[str, Any]:
        """Check the health status of the gateway service.

        Returns:
            Dictionary containing health information:
            - ok: Boolean indicating if service is healthy
            - servers: List of configured servers and their status

        Raises:
            RuntimeError: If the request fails

        Example:
            >>> client = GatewayClient("http://localhost:8787")
            >>> status = client.health()
            >>> if status["ok"]:
            ...     print("Gateway is healthy")
            >>> print(f"Servers: {status.get('servers', [])}")
        """
        url = f"{self.base_url}/health"
        return self._make_request(url)


__all__ = ["GatewayClient", "Provider", "ToolSchema", "ExecutionResult"]
