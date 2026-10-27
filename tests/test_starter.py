import importlib.util
from pathlib import Path
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
import json

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('starter_server', ROOT / 'app/server.py')
server_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server_module)


class StarterServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), server_module.Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.origin = f'http://127.0.0.1:{cls.server.server_port}'

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def test_editor_configuration(self):
        with urllib.request.urlopen(self.origin + '/api/config') as response:
            self.assertFalse(json.load(response)['generationAvailable'])
        with urllib.request.urlopen(self.origin + '/api/samples') as response:
            self.assertTrue(json.load(response)['samples'])

    def test_no_write_api(self):
        request = urllib.request.Request(self.origin + '/api/generations', data=b'{}', method='POST')
        with self.assertRaises(urllib.error.HTTPError) as result:
            urllib.request.urlopen(request)
        self.assertEqual(result.exception.code, 405)

    def test_no_source_file_access(self):
        with self.assertRaises(urllib.error.HTTPError):
            urllib.request.urlopen(self.origin + '/server.py')

    def test_host_boundary(self):
        request = urllib.request.Request(self.origin + '/', headers={'Host': 'example.com'})
        with self.assertRaises(urllib.error.HTTPError) as result:
            urllib.request.urlopen(request)
        self.assertEqual(result.exception.code, 400)
