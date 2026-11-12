"""Local dev server for Maps+: serves this folder on http://localhost:8080 with caching disabled,
so the browser always loads the latest files after an edit (no Ctrl+F5 needed)."""
import http.server
import os
import socketserver

PORT = 8080
os.chdir(os.path.dirname(os.path.abspath(__file__)))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


if __name__ == "__main__":
    with Server(("127.0.0.1", PORT), NoCacheHandler) as httpd:
        print(f"Maps+ dev server on http://localhost:{PORT} (no caching)")
        httpd.serve_forever()
