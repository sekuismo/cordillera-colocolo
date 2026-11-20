"""Servidor estático de desarrollo sin caché (el http.server normal deja módulos JS viejos en el navegador)."""
import functools, http.server, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
    http.server.ThreadingHTTPServer(("127.0.0.1", port), functools.partial(Handler, directory=ROOT)).serve_forever()
