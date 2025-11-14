#!/usr/bin/env python3
"""End-to-end integration test with Ollama using the Python client library.

This test validates the complete workflow using a local Ollama LLM:
1. Gateway connects to simple-test-server MCP server
2. Tools are retrieved using Python client
3. Ollama (local) is called with tools
4. Ollama generates function calls
5. Function calls are executed via gateway using Python client
6. Results are returned to Ollama
7. Ollama generates final response

Requirements:
- Ollama must be installed and running locally
- Gateway service must be running (or use built-in test gateway)
- Test MCP server must be built (node/service/test/fixtures/dist/simple-test-server.js)
- ollama Python package must be installed: pip install ollama

Environment Variables:
- OLLAMA_HOST: Override default http://127.0.0.1:11434
- OLLAMA_E2E_MODEL: Override default model (qwen3:8b)
- GATEWAY_URL: Override default http://localhost:8787

Usage:
    python3 test_e2e_ollama.py
"""

import os
import sys
import json
import subprocess
import time
import signal
from typing import Optional, Dict, Any, List
from pathlib import Path

# Check for ollama package
try:
    from ollama import Client as OllamaClient
except ImportError:
    print("ERROR: ollama package not found. Install with: pip install ollama")
    sys.exit(1)

# Import our gateway client
try:
    from mcp_tool_gateway import GatewayClient
except ImportError:
    # Try to add parent directory to path
    sys.path.insert(0, str(Path(__file__).parent))
    from mcp_tool_gateway import GatewayClient


class Colors:
    """ANSI color codes for terminal output."""
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    END = '\033[0m'
    BOLD = '\033[1m'


def log_section(message: str) -> None:
    """Print a section header."""
    print(f"\n{Colors.BOLD}{Colors.CYAN}{'=' * 60}{Colors.END}")
    print(f"{Colors.BOLD}{Colors.CYAN}{message}{Colors.END}")
    print(f"{Colors.BOLD}{Colors.CYAN}{'=' * 60}{Colors.END}\n")


def log_info(message: str) -> None:
    """Print an info message."""
    print(f"{Colors.BLUE}[INFO]{Colors.END} {message}")


def log_success(message: str) -> None:
    """Print a success message."""
    print(f"{Colors.GREEN}[SUCCESS]{Colors.END} {message}")


def log_error(message: str) -> None:
    """Print an error message."""
    print(f"{Colors.RED}[ERROR]{Colors.END} {message}")


def log_warning(message: str) -> None:
    """Print a warning message."""
    print(f"{Colors.YELLOW}[WARNING]{Colors.END} {message}")


class OllamaE2ETest:
    """End-to-end test orchestrator for Ollama integration."""

    def __init__(self):
        self.ollama_host = os.environ.get('OLLAMA_HOST', 'http://127.0.0.1:11434')
        self.model = os.environ.get('OLLAMA_E2E_MODEL', 'qwen3:8b')
        self.gateway_url = os.environ.get('GATEWAY_URL', 'http://localhost:8787')
        self.gateway_process: Optional[subprocess.Popen] = None
        self.ollama_client: Optional[OllamaClient] = None
        self.gateway_client: Optional[GatewayClient] = None

    def setup(self) -> None:
        """Set up test prerequisites."""
        log_section("Setting Up E2E Test Environment")

        # Check if Ollama is accessible
        log_info(f"Checking Ollama at {self.ollama_host}")
        self.ollama_client = OllamaClient(host=self.ollama_host)

        try:
            self.ollama_client.list()
            log_success(f"Ollama is accessible at {self.ollama_host}")
        except Exception as e:
            log_error(f"Cannot connect to Ollama: {e}")
            log_info("Make sure Ollama is running: ollama serve")
            raise

        # Ensure model is available
        self._ensure_model()

        # Check if gateway is accessible
        log_info(f"Checking gateway at {self.gateway_url}")
        self.gateway_client = GatewayClient(self.gateway_url, timeout=30)

        try:
            health = self.gateway_client.health()
            log_success(f"Gateway is accessible: {health}")
        except Exception as e:
            log_error(f"Cannot connect to gateway: {e}")
            log_info("Make sure the gateway is running or configure GATEWAY_URL")
            raise

    def _ensure_model(self) -> None:
        """Ensure the required model is available."""
        log_info(f"Checking for model: {self.model}")

        try:
            models = self.ollama_client.list()
            model_names = [m['name'] for m in models.get('models', [])]

            if self.model in model_names or f"{self.model}:latest" in model_names:
                log_success(f"Model {self.model} is available")
                return

            log_warning(f"Model {self.model} not found locally")
            log_info(f"Pulling model {self.model} (this may take a few minutes)...")

            # Pull the model with progress
            stream = self.ollama_client.pull(self.model, stream=True)
            last_status = None

            for progress in stream:
                status = progress.get('status', '')
                if status != last_status:
                    print(f"  {status}")
                    last_status = status

            log_success(f"Model {self.model} pulled successfully")

        except Exception as e:
            log_error(f"Failed to ensure model availability: {e}")
            raise

    def test_math_operation(self) -> None:
        """Test basic math operation with tool calling."""
        log_section("Test 1: Math Operation (add tool)")

        # Step 1: Get tools in Gemini format
        log_info("Fetching tools from gateway...")
        tools_response = self.gateway_client.get_tools("gemini", server="default")

        function_declarations = tools_response.get('function_declarations', [])
        log_success(f"Retrieved {len(function_declarations)} tools")

        tool_names = [t['name'] for t in function_declarations]
        log_info(f"Available tools: {', '.join(tool_names)}")

        assert 'add' in tool_names, "add tool not found"
        assert 'multiply' in tool_names, "multiply tool not found"
        assert 'get_weather' in tool_names, "get_weather tool not found"

        # Step 2: Convert to Ollama format
        log_info("Converting tools to Ollama format...")
        ollama_tools = [
            {
                'type': 'function',
                'function': {
                    'name': tool['name'],
                    'description': tool['description'],
                    'parameters': tool['parameters']
                }
            }
            for tool in function_declarations
        ]

        # Step 3: Call Ollama with tools
        log_info("Calling Ollama to generate function call...")
        prompt = "What is 15 plus 27? Use the add tool to calculate it. You must call the add function with arguments a=15 and b=27."

        response = self.ollama_client.chat(
            model=self.model,
            messages=[
                {'role': 'user', 'content': prompt}
            ],
            tools=ollama_tools
        )

        log_info(f"Ollama response: {json.dumps(response['message'], indent=2)}")

        # Step 4: Extract function call
        tool_calls = response['message'].get('tool_calls', [])
        assert tool_calls, "No tool calls generated by Ollama"

        add_call = next((call for call in tool_calls if call['function']['name'] == 'add'), None)
        assert add_call, "add function not called"

        log_success(f"Ollama called: {add_call['function']['name']}")
        log_info(f"Arguments: {add_call['function']['arguments']}")

        # Step 5: Execute via gateway
        log_info("Executing tool via gateway...")

        # Convert arguments (Ollama sometimes returns strings)
        args = add_call['function']['arguments']
        converted_args = {
            'a': float(args['a']) if isinstance(args['a'], str) else args['a'],
            'b': float(args['b']) if isinstance(args['b'], str) else args['b']
        }

        execution_result = self.gateway_client.execute(
            provider='gemini',
            call={'name': 'add', 'args': converted_args},
            server='default'
        )

        log_success(f"Tool executed successfully")
        log_info(f"Result: {json.dumps(execution_result, indent=2)}")

        # Parse the result
        result = execution_result.get('result', {})
        if 'content' in result and isinstance(result['content'], list):
            text_content = next((c['text'] for c in result['content'] if c.get('type') == 'text'), None)
            parsed_result = json.loads(text_content) if text_content else result
        else:
            parsed_result = result

        assert parsed_result.get('result') == 42, f"Expected 42, got {parsed_result.get('result')}"
        log_success(f"Result verified: 15 + 27 = 42")

        # Step 6: Send result back to Ollama
        log_info("Sending result back to Ollama for final response...")

        final_response = self.ollama_client.chat(
            model=self.model,
            messages=[
                {'role': 'user', 'content': prompt},
                response['message'],
                {'role': 'tool', 'content': json.dumps(parsed_result)}
            ],
            tools=ollama_tools
        )

        final_text = final_response['message']['content']
        log_success(f"Ollama final response: {final_text}")

        assert '42' in final_text.lower(), "Final response doesn't mention 42"
        log_success("Math operation test PASSED!")

    def test_logs(self) -> None:
        """Verify that tool executions are logged."""
        log_section("Test 2: Log Verification")

        log_info("Fetching logs from gateway...")
        logs = self.gateway_client.logs(server="default", limit=100)

        log_success(f"Retrieved {len(logs)} log entries")

        assert len(logs) > 0, "No logs found"

        tool_names = [log.get('tool') for log in logs]
        assert 'add' in tool_names, "add tool not found in logs"

        log_info(f"Logged tools: {', '.join(set(tool_names))}")
        log_success("Log verification test PASSED!")

    def test_weather_tool(self) -> None:
        """Test weather tool with string parameters."""
        log_section("Test 3: Weather Tool (String Parameters)")

        # Get tools
        log_info("Fetching tools from gateway...")
        tools_response = self.gateway_client.get_tools("gemini", server="default")
        function_declarations = tools_response.get('function_declarations', [])

        # Convert to Ollama format
        ollama_tools = [
            {
                'type': 'function',
                'function': {
                    'name': tool['name'],
                    'description': tool['description'],
                    'parameters': tool['parameters']
                }
            }
            for tool in function_declarations
        ]

        # Call Ollama
        log_info("Calling Ollama for weather query...")
        prompt = "What's the weather in San Francisco? Use the get_weather tool with location 'San Francisco'."

        response = self.ollama_client.chat(
            model=self.model,
            messages=[
                {'role': 'user', 'content': prompt}
            ],
            tools=ollama_tools
        )

        tool_calls = response['message'].get('tool_calls', [])

        if not tool_calls:
            log_warning("Model did not generate tool calls (can happen with smaller models)")
            return

        weather_call = next((call for call in tool_calls if call['function']['name'] == 'get_weather'), None)

        if not weather_call:
            log_warning("Model did not call get_weather (can happen with smaller models)")
            return

        log_success(f"Ollama called: {weather_call['function']['name']}")
        log_info(f"Arguments: {weather_call['function']['arguments']}")

        # Execute via gateway
        log_info("Executing weather tool via gateway...")
        execution_result = self.gateway_client.execute(
            provider='gemini',
            call={'name': weather_call['function']['name'], 'args': weather_call['function']['arguments']},
            server='default'
        )

        log_success(f"Weather tool executed successfully")
        log_info(f"Result: {json.dumps(execution_result, indent=2)}")

        # Parse result
        result = execution_result.get('result', {})
        if 'content' in result and isinstance(result['content'], list):
            text_content = next((c['text'] for c in result['content'] if c.get('type') == 'text'), None)
            parsed_result = json.loads(text_content) if text_content else result
        else:
            parsed_result = result

        assert 'location' in parsed_result, "location not in result"
        assert 'temperature' in parsed_result, "temperature not in result"
        assert 'conditions' in parsed_result, "conditions not in result"

        log_success("Weather tool test PASSED!")

    def run(self) -> bool:
        """Run all tests."""
        try:
            self.setup()
            self.test_math_operation()
            self.test_logs()
            self.test_weather_tool()

            log_section("All Tests PASSED!")
            return True

        except AssertionError as e:
            log_error(f"Test assertion failed: {e}")
            return False
        except Exception as e:
            log_error(f"Test failed with error: {e}")
            import traceback
            traceback.print_exc()
            return False
        finally:
            self.cleanup()

    def cleanup(self) -> None:
        """Clean up resources."""
        log_info("Cleaning up...")
        if self.gateway_process:
            self.gateway_process.terminate()
            self.gateway_process.wait()


def main():
    """Main entry point."""
    print(f"{Colors.BOLD}Ollama E2E Test for MCP Tool Gateway Python Client{Colors.END}")
    print(f"Model: {os.environ.get('OLLAMA_E2E_MODEL', 'qwen3:8b')}")
    print(f"Ollama Host: {os.environ.get('OLLAMA_HOST', 'http://127.0.0.1:11434')}")
    print(f"Gateway URL: {os.environ.get('GATEWAY_URL', 'http://localhost:8787')}")

    test = OllamaE2ETest()
    success = test.run()

    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()
