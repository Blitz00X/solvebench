"""Fresh install -> failing sample -> edit -> safe exit -> reopen -> passing F5.

Requires Python pyte, Bun and Python 3. No credentials, network APIs or model.
Dependencies may be fetched during source installation. All user data is temporary.
Optionally --launcher PATH --workspace PATH tests a preinstalled clean release.
"""
import argparse
import codecs
import fcntl
import os
from pathlib import Path
import pty
import select
import shutil
import signal
import struct
import subprocess
import tempfile
import termios
import time
import pyte

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument("--launcher", type=Path)
parser.add_argument("--workspace", type=Path)
args = parser.parse_args()
if bool(args.launcher) != bool(args.workspace):
    parser.error("--launcher and --workspace must be supplied together")

with tempfile.TemporaryDirectory(prefix="solvebench-installed-pty-") as temp:
    home = Path(temp) / "home"
    home.mkdir()
    env = {"HOME": str(home), "PATH": os.environ["PATH"], "TERM": "xterm-256color",
           "WORKBENCH_BUN": os.environ.get("WORKBENCH_BUN") or shutil.which("bun") or ""}
    if args.launcher:
        launcher, workspace = args.launcher.resolve(), args.workspace.resolve()
    else:
        prefix = Path(temp) / "install"
        subprocess.run(["bash", str(ROOT / "install.sh"), "--source", str(ROOT), "--prefix", str(prefix)], env=env, check=True)
        launcher = prefix / "bin/solvebench"
        workspace = prefix / "share/solvebench/workspace"
    for flag in ("--help", "--version"):
        subprocess.run([str(launcher), flag], env=env, stdout=subprocess.DEVNULL, check=True)
    assert not (workspace / ".solvebench").exists(), "help/version created runtime state"

    class Terminal:
        def __init__(self):
            self.screen = pyte.Screen(140, 40)
            self.stream = pyte.Stream(self.screen)
            self.decoder = codecs.getincrementaldecoder("utf8")("replace")
            self.pid, self.fd = pty.fork()
            self.exited = False
            if self.pid == 0:
                os.chdir(home)
                os.execve(str(launcher), [str(launcher), "--sample"], env)
            fcntl.ioctl(self.fd, termios.TIOCSWINSZ, struct.pack("HHHH", 40, 140, 0, 0))

        def frame(self):
            return "\n".join(self.screen.display)

        def pump(self, seconds=.15):
            deadline = time.monotonic() + seconds
            while time.monotonic() < deadline:
                ready, _, _ = select.select([self.fd], [], [], .05)
                if ready:
                    try:
                        data = os.read(self.fd, 65536)
                        if not data:
                            return
                        self.stream.feed(self.decoder.decode(data))
                    except OSError:
                        return

        def wait(self, label, seconds=15):
            deadline = time.monotonic() + seconds
            while label not in self.frame() and time.monotonic() < deadline:
                self.pump()
            assert label in self.frame(), (label, self.frame())

        def send(self, data):
            os.write(self.fd, data)
            self.pump()

        def expect_exit(self):
            deadline = time.monotonic() + 10
            while time.monotonic() < deadline:
                self.pump()
                pid, status = os.waitpid(self.pid, os.WNOHANG)
                if pid:
                    self.exited = True
                    assert os.waitstatus_to_exitcode(status) == 0, status
                    return
            raise AssertionError("launcher did not exit after confirmation")

        def close(self):
            if not self.exited:
                try:
                    os.kill(self.pid, signal.SIGTERM)
                except ProcessLookupError:
                    pass
                os.waitpid(self.pid, 0)
            os.close(self.fd)

    ui = Terminal()
    try:
        ui.wait("Add Two Numbers")
        ui.send(b"\x05")
        ui.wait("return 0")  # starter must be populated before any UI open action
        ui.send(b"\x1b[15~")
        ui.wait("0/1 passed")
        ui.send(b"\x05")
        ui.wait("focus:editor")
        ui.send(b"\x1b[H\x1b[1;2F")
        ui.send(b"\x1b[200~def add(a, b):\n    return a + b\n\x1b[201~")
        ui.send(b"\x03")
        ui.wait("UNSAVED CHANGES")
        ui.send(b"\x1b")
        assert "UNSAVED CHANGES" not in ui.frame(), ui.frame()
        assert "return a + b" in ui.frame(), ui.frame()
        ui.send(b"\x03")
        ui.wait("UNSAVED CHANGES")
        ui.send(b"\r")
        ui.expect_exit()
    finally:
        ui.close()
    copied = workspace / "exercises/local/python/solvebench-sample-sum-two/solution.py"
    assert "return a + b" in copied.read_text()
    ui = Terminal()
    try:
        ui.wait("Add Two Numbers")
        ui.send(b"\x05")
        ui.wait("return a + b")
        ui.send(b"\x1b[15~")
        ui.wait("3/3 passed")
        ui.send(b"\x03")
        ui.expect_exit()
    finally:
        ui.close()
    print("PASS: installed help/version + seeded sample + failed F5 + edit + cancel/save exit + persisted restart + passing F5")
