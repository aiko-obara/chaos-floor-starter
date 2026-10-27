"""Local-only starter server; no image API, secrets or remote writes."""
import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
from urllib.parse import unquote, urlsplit

PUBLIC = Path(__file__).resolve().parent / 'public'


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC), **kwargs)

    def log_message(self, *args):
        pass

    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'same-origin')
        super().end_headers()

    def do_GET(self):
        port = self.server.server_port
        if self.headers.get('Host', '').lower() not in {f'127.0.0.1:{port}', f'localhost:{port}'}:
            self.send_error(400)
            return
        path = unquote(urlsplit(self.path).path)
        if path == '/api/config':
            body = json.dumps({'generationAvailable': False, 'referenceRequired': True,
                               'reason': '新テーマの制作はCodexと制作スキルを使用します。'}).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(body)
            return
        if path == '/api/samples':
            self.path = '/assets/sample.json'
        elif path.startswith('/api/'):
            self.send_error(404)
            return
        resolved = Path(self.translate_path(self.path)).resolve()
        if not resolved.is_relative_to(PUBLIC.resolve()):
            self.send_error(404)
            return
        super().do_GET()

    def do_HEAD(self):
        if urlsplit(self.path).path.startswith('/api/'):
            self.send_error(405)
        else:
            super().do_HEAD()

    def do_POST(self):
        self.send_error(405, 'This starter has no generation or write API')

    def list_directory(self, path):
        self.send_error(404)
        return None


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=4173)
    args = parser.parse_args()
    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    print(f'Local: http://127.0.0.1:{server.server_port}/', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
