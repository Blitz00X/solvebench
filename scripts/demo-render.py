"""Rasterize actual captured terminal spans and encode a silent, paced demo.

Run after `SOLVEBENCH_DEMO_OUTPUT="$PWD/docs/media/demo" bun test scripts/demo-capture.test.tsx`.
Requires Pillow and ffmpeg.
No screen text is invented; only the provenance header and step captions are added.
"""
from pathlib import Path
import json, re, subprocess
from PIL import Image, ImageDraw, ImageFont
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'docs/media/demo'
frames = json.loads((OUT / 'captures.json').read_text())
font_path = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'
font = ImageFont.truetype(font_path, 21)
label = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 23)
def color(value):
    values = [float(x) for x in re.findall(r'[0-9.]+', value)]
    return tuple(round(x * 255) for x in values[:3])
paths = []
for frame in frames:
    img = Image.new('RGB', (1920, 1080), '#0d1421')
    d = ImageDraw.Draw(img)
    d.text((50, 22), 'SolveBench alpha · offline scripted hint demonstration', fill='#d5e7f7', font=label)
    d.text((50, 57), 'Actual terminal UI renderer + real local Python tests · no AI model call', fill='#94a9bf', font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 18))
    for y, line in enumerate(frame['lines']):
        x = 50
        for span in line['spans']:
            w = span['width'] * 13
            d.rectangle((x, 98+y*23, x+w, 98+(y+1)*23), fill=color(span['bg']))
            if span['text'].strip():
                # Draw by cells to retain terminal column alignment with box glyphs.
                cx = x
                for char in span['text']:
                    d.text((cx, 98+y*23-1), char, font=font, fill=color(span['fg']))
                    cx += 13
            x += w
    d.text((50, 1034), frame['caption'], fill='#d5e7f7', font=label)
    path = OUT / (frame['name'] + '.png')
    img.save(path)
    paths.append(path)
(OUT / 'frames.ffconcat').write_text('ffconcat version 1.0\n' + ''.join("file '" + p.name + "'\nduration " + str(f['duration']) + '\n' for p, f in zip(paths, frames)) + "file '" + paths[-1].name + "'\n")
subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', str(OUT/'frames.ffconcat'), '-vf', 'fps=24', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(OUT/'solvebench-offline-demo.mp4')], check=True)
subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', str(OUT/'solvebench-offline-demo.mp4'), '-vf', 'fps=4,scale=1200:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse', str(OUT/'solvebench-offline-demo.gif')], check=True)
print('Rendered actual UI spans to PNG + MP4 + GIF')
