"""Real launcher: local collection import, editing, F5 and persistent copies.

Run with a Python environment containing pyte. Uses a temporary workspace;
does not submit solutions or call a model.
"""
import codecs
import fcntl
import os
from pathlib import Path
import pty
import select
import signal
import struct
import tempfile
import termios
import time
import pyte

ROOT = Path(__file__).resolve().parent.parent
with tempfile.TemporaryDirectory(prefix="solvebench-local-pty-") as workspace:
    screen = pyte.Screen(140, 40)
    stream = pyte.Stream(screen)
    decoder = codecs.getincrementaldecoder("utf8")("replace")
    pid, fd = pty.fork()
    if pid == 0:
        os.environ["TERM"] = "xterm-256color"
        os.environ["EXERCISM_API_TOKEN"] = ""
        os.chdir(workspace)
        os.execv(str(ROOT / "bin/pairs"), ["pairs", "--repo", workspace])
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", 40, 140, 0, 0))

    def frame():
        return "\n".join(screen.display)

    def pump(seconds=.15):
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            ready, _, _ = select.select([fd], [], [], .05)
            if ready:
                try:
                    stream.feed(decoder.decode(os.read(fd, 65536)))
                except OSError:
                    break

    def wait_for(label, seconds=12):
        deadline = time.monotonic() + seconds
        while label not in frame() and time.monotonic() < deadline:
            pump()
        assert label in frame(), (label, frame())

    def send(data):
        os.write(fd, data)
        pump()

    try:
        wait_for("SOLVEBENCH")
        pump(.5)
        send(b"\x0f")  # Ctrl+O
        wait_for("IMPORT EXERCISES")
        send(b"\x1b[200~" + str(ROOT / "examples/local-exercises").encode() + b"\x1b[201~")
        send(b"\r")
        wait_for("Imported 1 local exercise")
        assert "IMPORT EXERCISES" not in frame(), frame()
        assert "Add Two Numbers" in frame(), frame()
        send(b"\r")
        wait_for("focus:editor")
        send(b"\x1b[15~")  # F5: incomplete starter must fail
        wait_for("TEST RESULTS")
        wait_for("0/1 passed")
        send(b"\x05")  # Ctrl+E
        wait_for("focus:editor")
        send(b"\x1b[H")  # Home: buffer start
        send(b"\x1b[1;2F")  # Shift+End: select to buffer end
        send(b"\x1b[200~def add(a, b):\n    return a + b\n\x1b[201~")
        send(b"\x1b[15~")
        wait_for("3/3 passed")
        copied = Path(workspace) / "exercises/local/python/solvebench-sample-sum-two/solution.py"
        assert "return a + b" in copied.read_text()
        assert "return 0" in (ROOT / "examples/local-exercises/sum-two/solution.py").read_text()
        print("PTY local collection import + editor paste + failing/passing F5 + saved copy: PASS")
    finally:
        send(b"\x03")
        try:
            os.kill(pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        os.waitpid(pid, 0)
        os.close(fd)
