# MCP Tool Gateway - Python Client

Python client library for the [MCP Tool Gateway](https://github.com/abstractionlair/mcp-tool-gateway) service.

## Installation

```bash
pip install -e .
```

## Quick Start

```python
from mcp_tool_gateway import GatewayClient

# Initialize client
gateway = GatewayClient("http://localhost:8787")

# Get tools in provider-specific format
tools = gateway.get_tools("gemini", server="default")

# Execute a tool call
result = gateway.execute("gemini", {
    "name": "add",
    "args": {"a": 15, "b": 27}
}, server="default")

print(result)  # 42
```

## Features

- **Provider-specific methods**: Support for Gemini, OpenAI, and xAI formats
- **Automatic retries**: Exponential backoff for transient failures
- **Type hints**: Full type annotations for IDE support
- **Zero dependencies**: Uses only Python standard library
- **Comprehensive tests**: 20+ unit tests with mocked HTTP

## Documentation

See the [main project README](../README.md#using-the-python-client) for detailed usage examples and API reference.

## Testing

```bash
python -m unittest test_client.py -v
```

## License

MIT License - see [LICENSE](../LICENSE) for details.
