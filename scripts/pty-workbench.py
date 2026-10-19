"""Real launcher smoke test. Uses a VT emulator, not escape-stripped screen diffs.

Run: python scripts/pty-workbench.py from a venv containing pyte.
No submission and no model call are made.
"""
import os
import pty
import select
import signal
import struct
import fcntl
import termios
import time
import pyte

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
screen = pyte.Screen(140, 40)
stream = pyte.Stream(screen)
pid, fd = pty.fork()
if pid == 0:
    os.chdir(ROOT)
    os.environ["TERM"] = "xterm-256color"
    os.execv(os.path.join(ROOT, "bin", "pairs"), ["pairs"])
fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", 40, 140, 0, 0))

def pump(seconds):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        ready, _, _ = select.select([fd], [], [], .1)
        if ready:
            try:
                stream.feed(os.read(fd, 65536).decode("utf8", "replace"))
            except OSError:
                break

try:
    pump(8)
    frame = "\n".join(screen.display)
    for label in ["SOLVEBENCH", "EXERCISES", "AI", "Test · F5", "Submit · F6"]:
        assert label in frame, (label, frame)
    assert "Traceback" not in frame and "SQLiteError" not in frame
    # All regions, including the chat input, must be escapable with Tab.
    for region in ["content", "command", "actions", "header", "list"]:
        os.write(fd, b"\t")
        pump(.2)
        assert f"focus:{region}" in "\n".join(screen.display)
    os.write(fd, b"?")
    pump(.3)
    assert "KEYBOARD SHORTCUTS" in "\n".join(screen.display)
    os.write(fd, b"?")
    pump(.2)
    os.write(fd, b"\x14")  # Ctrl+T
    pump(.3)
    assert "Search languages" in "\n".join(screen.display)
    os.write(fd, b"\x1b")
    pump(.3)
    # Shift+Tab reaches the header; End is not needed for its small button set.
    os.write(fd, b"\x1b[Z")
    pump(.2)
    for _ in range(4):
        os.write(fd, b"\x1b[C")
        pump(.1)
    os.write(fd, b"\r")
    pump(.3)
    assert "Connection" in "\n".join(screen.display)
    os.write(fd, b"\x1b")
    pump(.3)
    os.write(fd, b"\x1b")  # header → tasks
    pump(.3)
    # Open an actual downloaded/unlocked task. Merely rendering an empty shell
    # is not an acceptance test for an exercise workbench.
    os.write(fd, b"\r")
    pump(8)
    frame = "\n".join(screen.display)
    assert "focus:content" in frame, frame
    assert "PROBLEM:" in frame, frame
    assert "hello_world" in frame or "hello-world" in frame, frame
    # Read the real README with styled headings, then maximize its pane.
    pump(2)
    frame = "\n".join(screen.display)
    heading_rows = [y for y, row in enumerate(screen.display) if "Hello World" in row and "PROBLEM:" not in row and "✓" not in row and "○" not in row and "→" not in row]
    assert heading_rows, frame
    assert any(cell.bold for y in heading_rows for cell in screen.buffer[y].values()), frame
    os.write(fd, b"f")
    pump(.4)
    frame = "\n".join(screen.display)
    assert "EXERCISES:" not in frame and "AI · CHAT" not in frame, frame
    assert "Restore · f" in frame, frame
    os.write(fd, b"f")
    pump(.3)
    assert "EXERCISES:" in "\n".join(screen.display)
    os.write(fd, b"\x05")
    pump(.5)
    assert "focus:editor" in "\n".join(screen.display)
    os.write(fd, b"\x05")
    pump(.3)
    assert "focus:list" in "\n".join(screen.display)
    # Run from list without typing an r into the editor.
    os.write(fd, b"\x1b[15~")  # F5
    pump(5)
    frame = "\n".join(screen.display)
    assert "TEST RESULTS" in frame and "passed" in frame, frame
    os.write(fd, b"\x0c")
    pump(1)
    assert "focus:command" in "\n".join(screen.display)
    # Actual unicode input, not mockInput: leave it as a draft, no network call.
    os.write(fd, "yardım et".encode("utf8"))
    pump(1)
    assert "yardım et" in "\n".join(screen.display)
    os.write(fd, b"\x1b")  # chat input → assistant reading
    pump(.3)
    os.write(fd, b"f")
    pump(.3)
    frame = "\n".join(screen.display)
    assert "Restore · f" in frame and "EXERCISES:" not in frame, frame
    assert "yardım et" in frame, frame
    os.write(fd, b"f")
    pump(.3)
    os.write(fd, b"\t")
    pump(.2)
    assert "focus:actions" in "\n".join(screen.display)
    # Real resize: Ctrl+L shows AI and Esc restores the work view.
    screen.resize(20, 80)
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", 20, 80, 0, 0))
    os.kill(pid, signal.SIGWINCH)
    pump(.5)
    os.write(fd, b"\x0c")
    pump(.3)
    assert "AI · CHAT" in "\n".join(screen.display)
    os.write(fd, b"\x1b")
    pump(.3)
    assert "focus:assistant" in "\n".join(screen.display)
    os.write(fd, b"\x1b")
    pump(.3)
    assert "EXERCISES" in "\n".join(screen.display)
    os.write(fd, b"?")
    pump(.3)
    assert "KEYBOARD SHORTCUTS" in "\n".join(screen.display)
    os.write(fd, b"\x1b[F")  # End: final help line is reachable
    pump(.3)
    assert "Esc or ? to close" in "\n".join(screen.display)
    print("PTY markdown heading styles + center/AI full screen + keyboard + F5 + Unicode + narrow screen: PASS")
    print("\n".join(screen.display))
finally:
    os.write(fd, b"\x03")
    pump(.5)
    try:
        os.kill(pid, signal.SIGTERM)
    except ProcessLookupError:
        pass
    os.waitpid(pid, 0)
