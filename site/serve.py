#!/usr/bin/env python3
"""Local-only preview; no install or build step required."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from pathlib import Path
if __name__ == '__main__':
    print('Sova preview: http://127.0.0.1:4187', flush=True)
    ThreadingHTTPServer(('127.0.0.1', 4187), partial(SimpleHTTPRequestHandler, directory=str(Path(__file__).parent))).serve_forever()
