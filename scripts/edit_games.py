#!/usr/bin/env python3
"""Serve a localhost-only editor for data/games.json."""

from hashlib import sha256
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import stat
import tempfile
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "data" / "games.json"
EDITOR = ROOT / "tools"
MAX_REQUEST_SIZE = 5 * 1024 * 1024


def catalog_bytes():
    return CATALOG.read_bytes()


def validate_games(games):
    if not isinstance(games, list):
        raise ValueError("The catalogue must be a list of games.")

    titles = set()
    for index, game in enumerate(games, start=1):
        if not isinstance(game, dict):
            raise ValueError(f"Game {index} must be an object.")
        title = game.get("title")
        if not isinstance(title, str) or not title.strip():
            raise ValueError(f"Game {index} needs a non-empty title.")
        normalized_title = title.strip().casefold()
        if normalized_title in titles:
            raise ValueError(f'Game title "{title.strip()}" is duplicated.')
        titles.add(normalized_title)
        if "starred" in game and not isinstance(game["starred"], bool):
            raise ValueError(f"Game {index} has an invalid Hall of Fame value.")
        if "comment" in game and not isinstance(game["comment"], str):
            raise ValueError(f"Game {index} comment must be text.")


class EditorHandler(BaseHTTPRequestHandler):
    server_version = "GamesCatalogEditor"

    def send_response_headers(self, content_type, status=200):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header(
            "Content-Security-Policy",
            "default-src 'self'; connect-src 'self'; style-src 'self'; "
            "script-src 'self'; object-src 'none'; base-uri 'none'; "
            "frame-ancestors 'none'",
        )

    def send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response_headers("application/json; charset=utf-8", status)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_file(self, path, content_type):
        body = path.read_bytes()
        self.send_response_headers(content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def local_request(self, require_origin=False):
        port = self.server.server_port
        allowed_hosts = {f"127.0.0.1:{port}", f"localhost:{port}"}
        if self.headers.get("Host", "").lower() not in allowed_hosts:
            self.send_json({"error": "Requests must use the local editor address."}, 403)
            return False
        if require_origin:
            allowed_origins = {f"http://{host}" for host in allowed_hosts}
            if self.headers.get("Origin") not in allowed_origins:
                self.send_json({"error": "The request origin is not allowed."}, 403)
                return False
        return True

    def do_GET(self):
        if not self.local_request():
            return
        path = urlsplit(self.path).path
        if path == "/":
            self.send_file(EDITOR / "editor.html", "text/html; charset=utf-8")
        elif path == "/editor.css":
            self.send_file(EDITOR / "editor.css", "text/css; charset=utf-8")
        elif path == "/editor.js":
            self.send_file(EDITOR / "editor.js", "text/javascript; charset=utf-8")
        elif path == "/api/games":
            content = catalog_bytes()
            self.send_json(
                {
                    "games": json.loads(content),
                    "version": sha256(content).hexdigest(),
                }
            )
        else:
            self.send_json({"error": "Not found."}, 404)

    def do_POST(self):
        if urlsplit(self.path).path != "/api/games":
            self.send_json({"error": "Not found."}, 404)
            return
        if not self.local_request(require_origin=True):
            return
        if self.headers.get_content_type() != "application/json":
            self.send_json({"error": "Send the catalogue as JSON."}, 415)
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self.send_json({"error": "Invalid request size."}, 400)
            return
        if size <= 0 or size > MAX_REQUEST_SIZE:
            self.send_json({"error": "The catalogue request is empty or too large."}, 413)
            return
        try:
            payload = json.loads(self.rfile.read(size))
            if not isinstance(payload, dict) or not isinstance(
                payload.get("version"), str
            ):
                raise ValueError("The save request is missing its catalogue version.")
            validate_games(payload.get("games"))
        except (json.JSONDecodeError, UnicodeDecodeError, ValueError) as error:
            self.send_json({"error": str(error)}, 400)
            return

        current = catalog_bytes()
        if sha256(current).hexdigest() != payload["version"]:
            self.send_json(
                {
                    "error": (
                        "The catalogue changed on disk since it was opened. "
                        "Reload the editor before saving."
                    )
                },
                409,
            )
            return

        temporary_path = None
        try:
            with tempfile.NamedTemporaryFile(
                mode="w",
                encoding="utf-8",
                dir=CATALOG.parent,
                prefix=".games.",
                suffix=".tmp",
                delete=False,
            ) as temporary:
                temporary_path = Path(temporary.name)
                temporary.write(json.dumps(payload["games"], ensure_ascii=False, indent=2))
                temporary.write("\n")
            os.chmod(temporary_path, stat.S_IMODE(CATALOG.stat().st_mode))
            os.replace(temporary_path, CATALOG)
            temporary_path = None
        finally:
            if temporary_path is not None:
                temporary_path.unlink(missing_ok=True)

        updated = catalog_bytes()
        self.send_json(
            {"version": sha256(updated).hexdigest(), "saved": True}
        )

    def log_message(self, format_string, *args):
        print(f"{self.address_string()} - {format_string % args}")


def main():
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    if not 0 <= args.port <= 65535:
        parser.error("--port must be between 0 and 65535")

    with ThreadingHTTPServer(("127.0.0.1", args.port), EditorHandler) as server:
        host, port = server.server_address
        print(f"Games editor available at http://{host}:{port}/ (Ctrl+C to stop)")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nEditor stopped.")


if __name__ == "__main__":
    main()
