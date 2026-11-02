import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('configure', Path(__file__).with_name('configure.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class ConfigureTests(unittest.TestCase):
    def test_secrets_are_unique_and_file_cannot_be_overwritten(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'devspace.env'
            module.configure(path)
            before = path.read_bytes()
            entries = dict(line.split('=', 1) for line in before.decode().splitlines() if line and not line.startswith('#'))
            names = ('SECRET_KEY', 'LIVE_SERVER_SECRET_KEY', 'POSTGRES_PASSWORD', 'RABBITMQ_PASSWORD', 'AWS_SECRET_ACCESS_KEY')
            values = [entries[name] for name in names]
            self.assertEqual(len(set(values)), len(names))
            self.assertTrue(all(len(value) == 64 for value in values))
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            with self.assertRaises(FileExistsError): module.configure(path)
            self.assertEqual(path.read_bytes(), before)
