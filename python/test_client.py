"""Unit tests for the MCP Tool Gateway Python client.

These tests use mocked HTTP responses to validate the client behavior without
requiring a running gateway service.
"""

import json
import unittest
from unittest.mock import Mock, patch, MagicMock
from urllib.error import HTTPError, URLError
from io import BytesIO

from mcp_tool_gateway import GatewayClient


class TestGatewayClient(unittest.TestCase):
    """Test suite for the GatewayClient class."""

    def setUp(self):
        """Set up test fixtures."""
        self.client = GatewayClient("http://localhost:8787", max_retries=2, retry_delay=0.01)

    @patch('urllib.request.urlopen')
    def test_get_tools_gemini(self, mock_urlopen):
        """Test getting tools in Gemini format."""
        mock_response = Mock()
        mock_response.read.return_value = json.dumps({
            "function_declarations": [
                {
                    "name": "add",
                    "description": "Add two numbers",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "a": {"type": "number"},
                            "b": {"type": "number"}
                        }
                    }
                }
            ]
        }).encode('utf-8')
        mock_response.__enter__ = Mock(return_value=mock_response)
        mock_response.__exit__ = Mock(return_value=False)
        mock_urlopen.return_value = mock_response

        result = self.client.get_tools("gemini", server="default")

        self.assertIn("function_declarations", result)
        self.assertEqual(len(result["function_declarations"]), 1)
        self.assertEqual(result["function_declarations"][0]["name"], "add")
        mock_urlopen.assert_called_once()

    @patch('urllib.request.urlopen')
    def test_get_tools_openai(self, mock_urlopen):
        """Test getting tools in OpenAI format."""
        mock_response = Mock()
        mock_response.read.return_value = json.dumps({
            "tools": [
                {
                    "type": "function",
                    "function": {
                        "name": "multiply",
                        "description": "Multiply two numbers",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "a": {"type": "number"},
                                "b": {"type": "number"}
                            }
                        }
                    }
                }
            ]
        }).encode('utf-8')
        mock_response.__enter__ = Mock(return_value=mock_response)
        mock_response.__exit__ = Mock(return_value=False)
        mock_urlopen.return_value = mock_response

        result = self.client.get_tools("openai")

        self.assertIn("tools", result)
        self.assertEqual(len(result["tools"]), 1)
        self.assertEqual(result["tools"][0]["function"]["name"], "multiply")

    @patch('urllib.request.urlopen')
    def test_get_tools_xai(self, mock_urlopen):
        """Test getting tools in xAI format."""
        mock_response = Mock()
        mock_response.read.return_value = json.dumps({
            "tools": [
                {
                    "type": "function",
                    "function": {
                        "name": "subtract",
                        "description": "Subtract two numbers"
                    }
                }
            ]
        }).encode('utf-8')
        mock_response.__enter__ = Mock(return_value=mock_response)
        mock_response.__exit__ = Mock(return_value=False)
        mock_urlopen.return_value = mock_response

        result = self.client.get_tools("xai", server="test-server")

        self.assertIn("tools", result)
        self.assertEqual(result["tools"][0]["function"]["name"], "subtract")

    @patch('urllib.request.urlopen')
    def test_execute_gemini(self, mock_urlopen):
        """Test executing a tool with Gemini format."""
        mock_response = Mock()
        mock_response.read.return_value = json.dumps({
            "result": 42
        }).encode('utf-8')
        mock_response.__enter__ = Mock(return_value=mock_response)
        mock_response.__exit__ = Mock(return_value=False)
        mock_urlopen.return_value = mock_response

        result = self.client.execute("gemini", {
            "name": "add",
            "args": {"a": 15, "b": 27}
        }, server="default")

        self.assertEqual(result, 42)

    @patch('urllib.request.urlopen')
    def test_execute_openai(self, mock_urlopen):
        """Test executing a tool with OpenAI format."""
        mock_response = Mock()
        mock_response.read.return_value = json.dumps({
            "result": 100
        }).encode('utf-8')
        mock_response.__enter__ = Mock(return_value=mock_response)
        mock_response.__exit__ = Mock(return_value=False)
        mock_urlopen.return_value = mock_response

        result = self.client.execute("openai", {
            "name": "multiply",
            "arguments": '{"a": 10, "b": 10}'
        })

        self.assertEqual(result, 100)

    @patch('urllib.request.urlopen')
    def test_execute_with_error_response(self, mock_urlopen):
        """Test execute method when the gateway returns an error in the response."""
        mock_response = Mock()
        mock_response.read.return_value = json.dumps({
            "error": "Tool execution failed"
        }).encode('utf-8')
        mock_response.__enter__ = Mock(return_value=mock_response)
        mock_response.__exit__ = Mock(return_value=False)
        mock_urlopen.return_value = mock_response

        with self.assertRaises(RuntimeError) as context:
            self.client.execute("gemini", {"name": "bad_tool", "args": {}})

        self.assertIn("Tool execution failed", str(context.exception))

    @patch('urllib.request.urlopen')
    def test_call_tool_legacy(self, mock_urlopen):
        """Test the legacy call_tool method."""
        mock_response = Mock()
        mock_response.read.return_value = json.dumps({
            "result": {"status": "success"}
        }).encode('utf-8')
        mock_response.__enter__ = Mock(return_value=mock_response)
        mock_response.__exit__ = Mock(return_value=False)
        mock_urlopen.return_value = mock_response

        result = self.client.call_tool("default", "query_nodes", {"query": "test"})

        self.assertEqual(result, {"status": "success"})

    @patch('urllib.request.urlopen')
    def test_tools_raw_format(self, mock_urlopen):
        """Test getting tools in raw MCP format."""
        mock_response = Mock()
        mock_response.read.return_value = json.dumps({
            "tools": [{"name": "add", "inputSchema": {}}]
        }).encode('utf-8')
        mock_response.__enter__ = Mock(return_value=mock_response)
        mock_response.__exit__ = Mock(return_value=False)
        mock_urlopen.return_value = mock_response

        result = self.client.tools(server="default")

        self.assertIn("tools", result)

    @patch('urllib.request.urlopen')
    def test_logs(self, mock_urlopen):
        """Test retrieving execution logs."""
        mock_response = Mock()
        mock_response.read.return_value = json.dumps([
            {
                "timestamp": "2025-01-14T12:00:00Z",
                "tool": "add",
                "input": {"a": 1, "b": 2},
                "result": 3
            }
        ]).encode('utf-8')
        mock_response.__enter__ = Mock(return_value=mock_response)
        mock_response.__exit__ = Mock(return_value=False)
        mock_urlopen.return_value = mock_response

        result = self.client.logs("default", limit=10)

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["tool"], "add")
        self.assertEqual(result[0]["result"], 3)

    @patch('urllib.request.urlopen')
    def test_logs_with_since(self, mock_urlopen):
        """Test retrieving logs with a timestamp filter."""
        mock_response = Mock()
        mock_response.read.return_value = json.dumps([]).encode('utf-8')
        mock_response.__enter__ = Mock(return_value=mock_response)
        mock_response.__exit__ = Mock(return_value=False)
        mock_urlopen.return_value = mock_response

        result = self.client.logs("default", since="2025-01-14T00:00:00Z", limit=50)

        self.assertEqual(result, [])
        # Verify the URL contains the since parameter
        call_args = mock_urlopen.call_args
        self.assertIn("since=2025-01-14T00%3A00%3A00Z", call_args[0][0].get_full_url())

    @patch('urllib.request.urlopen')
    def test_health(self, mock_urlopen):
        """Test health check endpoint."""
        mock_response = Mock()
        mock_response.read.return_value = json.dumps({
            "ok": True,
            "servers": [{"name": "default", "status": "connected"}]
        }).encode('utf-8')
        mock_response.__enter__ = Mock(return_value=mock_response)
        mock_response.__exit__ = Mock(return_value=False)
        mock_urlopen.return_value = mock_response

        result = self.client.health()

        self.assertTrue(result["ok"])
        self.assertEqual(len(result["servers"]), 1)

    @patch('urllib.request.urlopen')
    def test_http_error_4xx_no_retry(self, mock_urlopen):
        """Test that 4xx errors are not retried."""
        error_response = Mock()
        error_response.read.return_value = json.dumps({
            "error": "Bad request"
        }).encode('utf-8')
        error_response.code = 400
        error_response.reason = "Bad Request"

        http_error = HTTPError(
            url="http://localhost:8787/tools/gemini",
            code=400,
            msg="Bad Request",
            hdrs={},
            fp=error_response
        )
        mock_urlopen.side_effect = http_error

        with self.assertRaises(RuntimeError) as context:
            self.client.get_tools("gemini")

        # Should fail immediately without retries
        self.assertEqual(mock_urlopen.call_count, 1)
        self.assertIn("Gateway HTTP 400", str(context.exception))
        self.assertIn("Bad request", str(context.exception))

    @patch('urllib.request.urlopen')
    @patch('time.sleep')  # Mock sleep to speed up tests
    def test_http_error_5xx_with_retry(self, mock_sleep, mock_urlopen):
        """Test that 5xx errors are retried."""
        error_response = Mock()
        error_response.read.return_value = b"Internal Server Error"
        error_response.code = 500
        error_response.reason = "Internal Server Error"

        http_error = HTTPError(
            url="http://localhost:8787/execute",
            code=500,
            msg="Internal Server Error",
            hdrs={},
            fp=error_response
        )
        mock_urlopen.side_effect = http_error

        with self.assertRaises(RuntimeError) as context:
            self.client.execute("gemini", {"name": "test", "args": {}})

        # Should retry: initial attempt + 2 retries = 3 total
        self.assertEqual(mock_urlopen.call_count, 3)
        self.assertIn("Request failed after 3 attempts", str(context.exception))

    @patch('urllib.request.urlopen')
    @patch('time.sleep')
    def test_network_error_with_retry(self, mock_sleep, mock_urlopen):
        """Test that network errors are retried."""
        mock_urlopen.side_effect = URLError("Network unreachable")

        with self.assertRaises(RuntimeError) as context:
            self.client.get_tools("gemini")

        # Should retry: initial attempt + 2 retries = 3 total
        self.assertEqual(mock_urlopen.call_count, 3)
        self.assertIn("Request failed after 3 attempts", str(context.exception))

    @patch('urllib.request.urlopen')
    @patch('time.sleep')
    def test_retry_with_eventual_success(self, mock_sleep, mock_urlopen):
        """Test that retries eventually succeed after transient failures."""
        # First two attempts fail, third succeeds
        success_response = Mock()
        success_response.read.return_value = json.dumps({"ok": True}).encode('utf-8')
        success_response.__enter__ = Mock(return_value=success_response)
        success_response.__exit__ = Mock(return_value=False)

        mock_urlopen.side_effect = [
            URLError("Network error"),
            URLError("Network error"),
            success_response
        ]

        result = self.client.health()

        self.assertTrue(result["ok"])
        self.assertEqual(mock_urlopen.call_count, 3)
        # Verify exponential backoff: 0.01s, 0.02s
        self.assertEqual(mock_sleep.call_count, 2)

    @patch('urllib.request.urlopen')
    def test_timeout_configuration(self, mock_urlopen):
        """Test that timeout is properly configured."""
        mock_response = Mock()
        mock_response.read.return_value = json.dumps({"ok": True}).encode('utf-8')
        mock_response.__enter__ = Mock(return_value=mock_response)
        mock_response.__exit__ = Mock(return_value=False)
        mock_urlopen.return_value = mock_response

        client = GatewayClient("http://localhost:8787", timeout=30.0)
        client.health()

        # Check that urlopen was called with the correct timeout
        call_kwargs = mock_urlopen.call_args[1]
        self.assertEqual(call_kwargs['timeout'], 30.0)

    @patch('urllib.request.urlopen')
    def test_custom_retry_settings(self, mock_urlopen):
        """Test client with custom retry settings."""
        client = GatewayClient(
            "http://localhost:8787",
            max_retries=5,
            retry_delay=0.5,
            retry_backoff=3.0
        )

        self.assertEqual(client.max_retries, 5)
        self.assertEqual(client.retry_delay, 0.5)
        self.assertEqual(client.retry_backoff, 3.0)

    @patch('urllib.request.urlopen')
    def test_execute_without_server_parameter(self, mock_urlopen):
        """Test execute without specifying server parameter."""
        mock_response = Mock()
        mock_response.read.return_value = json.dumps({"result": "ok"}).encode('utf-8')
        mock_response.__enter__ = Mock(return_value=mock_response)
        mock_response.__exit__ = Mock(return_value=False)
        mock_urlopen.return_value = mock_response

        result = self.client.execute("gemini", {"name": "test", "args": {}})

        self.assertEqual(result, "ok")
        # Verify the request payload doesn't include server when not specified
        call_args = mock_urlopen.call_args[0][0]
        payload = json.loads(call_args.data.decode('utf-8'))
        self.assertNotIn("server", payload)

    @patch('urllib.request.urlopen')
    def test_get_tools_url_construction(self, mock_urlopen):
        """Test that get_tools constructs URLs correctly."""
        mock_response = Mock()
        mock_response.read.return_value = json.dumps({"tools": []}).encode('utf-8')
        mock_response.__enter__ = Mock(return_value=mock_response)
        mock_response.__exit__ = Mock(return_value=False)
        mock_urlopen.return_value = mock_response

        # Test with server parameter
        self.client.get_tools("gemini", server="test-server")
        call_args = mock_urlopen.call_args[0][0]
        self.assertEqual(
            call_args.get_full_url(),
            "http://localhost:8787/tools/gemini?server=test-server"
        )

        # Test without server parameter
        self.client.get_tools("openai")
        call_args = mock_urlopen.call_args[0][0]
        self.assertEqual(
            call_args.get_full_url(),
            "http://localhost:8787/tools/openai"
        )

    @patch('urllib.request.urlopen')
    def test_error_extraction_from_response_body(self, mock_urlopen):
        """Test that errors are properly extracted from response bodies."""
        error_response = Mock()
        error_response.read.return_value = json.dumps({
            "error": "Invalid tool name: nonexistent_tool"
        }).encode('utf-8')
        error_response.code = 404
        error_response.reason = "Not Found"

        http_error = HTTPError(
            url="http://localhost:8787/execute",
            code=404,
            msg="Not Found",
            hdrs={},
            fp=error_response
        )
        mock_urlopen.side_effect = http_error

        with self.assertRaises(RuntimeError) as context:
            self.client.execute("gemini", {"name": "nonexistent_tool", "args": {}})

        self.assertIn("Invalid tool name: nonexistent_tool", str(context.exception))


if __name__ == '__main__':
    unittest.main()
