import json
import mimetypes
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import unquote, urlsplit
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parent
PUBLIC_DIR = ROOT / "public"
MODEL = "qwen/qwen3.8-27b"
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"


def load_environment():
    env_path = ROOT / ".env"
    if not env_path.exists():
        return

    for line in env_path.read_text(encoding="utf-8").splitlines():
        key, separator, value = line.partition("=")
        key = key.strip()
        if separator and key and key.replace("_", "").isalnum() and key not in os.environ:
            os.environ[key] = value.strip().strip("\"'")


class RelayHandler(BaseHTTPRequestHandler):
    def send_json(self, status, data):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        pathname = urlsplit(self.path).path
        if pathname == "/api/health":
            self.send_json(200, {
                "configured": bool(os.environ.get("GROQ_API_KEY")),
                "model": MODEL,
            })
            return

        relative_path = "index.html" if pathname == "/" else unquote(pathname).lstrip("/")
        file_path = (PUBLIC_DIR / relative_path).resolve()
        try:
            file_path.relative_to(PUBLIC_DIR)
        except ValueError:
            self.send_error(403, "Forbidden")
            return

        if not file_path.is_file():
            self.send_error(404, "Not found")
            return

        body = file_path.read_bytes()
        content_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", f"{content_type}; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if urlsplit(self.path).path != "/api/chat":
            self.send_error(404, "Not found")
            return
        if not os.environ.get("GROQ_API_KEY"):
            self.send_json(503, {
                "error": "Groq is not configured yet. Add GROQ_API_KEY to your .env file and restart the app."
            })
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length > 1_000_000:
                self.send_json(413, {"error": "Request is too large."})
                return
            payload = json.loads(self.rfile.read(length))
        except (ValueError, json.JSONDecodeError):
            self.send_json(400, {"error": "Request body must be valid JSON."})
            return

        messages = payload.get("messages", []) if isinstance(payload, dict) else []
        if not isinstance(messages, list):
            messages = []
        valid_messages = [
            {"role": message["role"], "content": message["content"][:12000]}
            for message in messages
            if isinstance(message, dict)
            and message.get("role") in ("user", "assistant")
            and isinstance(message.get("content"), str)
            and message["content"].strip()
        ][-20:]

        if not valid_messages or valid_messages[-1]["role"] != "user":
            self.send_json(400, {"error": "Send a message to start the conversation."})
            return

        request_body = json.dumps({
            "model": MODEL,
            "messages": [
                {
                    "role": "system",
                    "content": "You are a thoughtful, clear, and capable assistant. Be concise by default and use formatting when it improves readability.",
                },
                *valid_messages,
            ],
            "temperature": 0.7,
            "max_tokens": 2048,
        }).encode("utf-8")
        request = Request(
            GROQ_URL,
            data=request_body,
            headers={
                "Authorization": f"Bearer {os.environ['GROQ_API_KEY']}",
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            },
            method="POST",
        )

        try:
            with urlopen(request, timeout=60) as response:
                result = json.loads(response.read())
        except HTTPError as error:
            try:
                result = json.loads(error.read())
                detail = result.get("error", {}).get("message", "The Groq request could not be completed.")
            except (ValueError, AttributeError):
                detail = "The Groq request could not be completed."
            self.send_json(429 if error.code == 429 else 502, {"error": detail})
            return
        except (URLError, TimeoutError, OSError):
            self.send_json(502, {"error": "Could not reach Groq. Check your connection and try again."})
            return
        except ValueError:
            self.send_json(502, {"error": "Groq returned an unreadable response. Please try again."})
            return

        content = result.get("choices", [{}])[0].get("message", {}).get("content")
        if not isinstance(content, str):
            self.send_json(502, {"error": "Groq returned an empty response. Please try again."})
            return
        self.send_json(200, {"content": content, "model": MODEL})

    def log_message(self, format_string, *args):
        print(f"{self.address_string()} - {format_string % args}")


def main():
    load_environment()
    port = int(os.environ.get("PORT", "3000"))
    server = ThreadingHTTPServer(("127.0.0.1", port), RelayHandler)
    print(f"Relay is ready at http://localhost:{port}")
    if not os.environ.get("GROQ_API_KEY"):
        print("Add GROQ_API_KEY to .env to enable replies.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nRelay stopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()