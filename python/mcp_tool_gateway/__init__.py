from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Mapping, Optional
import urllib.request
import urllib.error

@dataclass
class GatewayClient:
    base_url: str
    timeout: float = 60.0

    def call_tool(self, server: str, tool: str, arguments: Mapping[str, Any]) -> Any:
        url = f"{self.base_url}/call_tool"
        data = json.dumps({"server": server, "tool": tool, "arguments": arguments}).encode('utf-8')
        req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                payload = json.loads(resp.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            # Surface gateway error payloads for easier debugging
            body = ""
            try:
                body = e.read().decode('utf-8')  # type: ignore[assignment]
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
            raise RuntimeError(f"Gateway HTTP {e.code}: {msg}") from e
        if 'error' in payload:
            raise RuntimeError(payload['error'])
        return payload.get('result')

    def tools(self, server: Optional[str] = None):
        url = f"{self.base_url}/tools"
        if server:
            url += f"?server={server}"
        with urllib.request.urlopen(url, timeout=self.timeout) as resp:
            return json.loads(resp.read().decode('utf-8'))

    def logs(self, server: str, since: Optional[str] = None, limit: int = 100):
        from urllib.parse import urlencode
        qs = {"server": server, "limit": limit}
        if since:
            qs["since"] = since
        url = f"{self.base_url}/logs?{urlencode(qs)}"
        with urllib.request.urlopen(url, timeout=self.timeout) as resp:
            return json.loads(resp.read().decode('utf-8'))
