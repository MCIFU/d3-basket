"""
Fotos de jugador en primer plano, como las de acb.com: cara centrada, fondo
transparente y el mismo encuadre (medido sobre las fotos oficiales de la ACB:
la cara ocupa el 50 % del ancho y los ojos quedan al 38,6 % de la altura, 5:6).

Las fotos de la FEB llegan de dos formas: PNG sin fondo de cintura para arriba
o JPEG 200x300 con fondo. A las segundas se les quita el fondo (rembg,
modelo u2net_human_seg); a todas se les detecta la cara (YuNet de OpenCV) y se
recortan. El resultado va a public/media/players/<ref>.webp y la app lo usa en
lugar de la foto original (src/db/media.ts).

Uso (una vez: pip install pillow numpy opencv-python-headless "rembg[cpu]"):
  python tools/media/faces.py [--db data/d3basket.db] [--force] [--limit N]
"""
import argparse
import io
import os
import sqlite3
import sys
import time
import urllib.request
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public' / 'media' / 'players'
YUNET = Path(__file__).with_name('face_detection_yunet_2023mar.onnx')
YUNET_URL = 'https://huggingface.co/opencv/face_detection_yunet/resolve/main/face_detection_yunet_2023mar.onnx'

# Encuadre ACB (media de 24 fotos oficiales).
FACE_WIDTH = 0.50   # ancho de la cara / ancho de la foto
EYES_Y = 0.386      # altura de los ojos / alto de la foto
SIZE = (300, 358)   # 5:6, la mitad de las de la ACB

UA = 'D3Basket/0.1 (scouting personal; +https://github.com/MCIFU/d3-basket)'


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def keep_main_silhouette(im: Image.Image) -> Image.Image:
    """Quita restos de fondo que deja rembg: solo se conserva la silueta más grande.
    Se erosiona antes de separar manchas para cortar las uniones finas con los restos."""
    a = np.array(im.getchannel('A'))
    core = cv2.erode((a > 128).astype(np.uint8), np.ones((5, 5), np.uint8), iterations=2)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(core, 8)
    if n <= 2:
        return im
    main = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    keep = cv2.dilate((labels == main).astype(np.uint8), np.ones((5, 5), np.uint8), iterations=3)
    keep = cv2.GaussianBlur(keep.astype(np.float32), (5, 5), 0)
    im.putalpha(Image.fromarray((a * np.clip(keep, 0, 1)).astype(np.uint8)))
    return im


def fade_sides(im: Image.Image, frac: float = 0.08) -> Image.Image:
    """Degradado en los bordes izquierdo y derecho: evita cortes rectos al dejar margen."""
    a = np.array(im.getchannel('A')).astype(np.float32)
    n = max(2, int(im.width * frac))
    ramp = np.linspace(0, 1, n, dtype=np.float32)
    a[:, :n] *= ramp
    a[:, -n:] *= ramp[::-1]
    im = im.copy()
    im.putalpha(Image.fromarray(a.astype(np.uint8)))
    return im


def needs_recheck(file: Path) -> bool:
    """Resultado dudoso de una pasada anterior: varias manchas o hueco a los lados abajo."""
    try:
        a = np.array(Image.open(file).getchannel('A'))
    except OSError:
        return True  # fichero dañado o incompleto
    n, _, stats, _ = cv2.connectedComponentsWithStats((a > 40).astype(np.uint8), 8)
    blobs = (stats[1:, cv2.CC_STAT_AREA] > a.size * 0.004).sum()
    rows = np.where(a.max(1) > 10)[0]
    bottom = a[int(rows[-1] - SIZE[1] * 0.1)] if len(rows) else a[-1]
    return blobs > 1 or (bottom > 40).mean() < 0.55


def has_transparency(im: Image.Image) -> bool:
    if im.mode != 'RGBA':
        return False
    a = np.array(im)[:, :, 3]
    h, w = a.shape
    border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    # Fondo transparente de verdad: bordes casi vacíos (salvo la parte inferior, donde está el cuerpo).
    return (border < 10).mean() > 0.5 and (a < 10).mean() > 0.1


class Pipeline:
    def __init__(self):
        if not YUNET.exists():
            YUNET.write_bytes(fetch(YUNET_URL))
        self.det = cv2.FaceDetectorYN.create(str(YUNET), '', (320, 320), 0.7)
        self._rembg = None

    def remove_bg(self, im: Image.Image) -> Image.Image:
        if self._rembg is None:
            from rembg import new_session, remove
            session = new_session('u2net_human_seg')
            self._rembg = lambda x: remove(x, session=session, post_process_mask=True)
        return self._rembg(im.convert('RGB')).convert('RGBA')

    def face(self, im: Image.Image):
        """Cara más grande: (x, y, w, h, ojos_x, ojos_y) o None.
        Si la cara llena la foto el detector falla: se reintenta con márgenes alrededor."""
        f = self._detect(im)
        if f is None:
            pad = int(max(im.size) * 0.5)
            padded = Image.new('RGBA', (im.width + 2 * pad, im.height + 2 * pad), (0, 0, 0, 0))
            padded.alpha_composite(im, (pad, pad))
            f = self._detect(padded)
            if f is not None:
                x, y, w, h, ex, ey = f
                f = (x - pad, y - pad, w, h, ex - pad, ey - pad)
        return f

    def _detect(self, im: Image.Image):
        bg = Image.new('RGBA', im.size, (255, 255, 255, 255))
        bg.alpha_composite(im)
        arr = cv2.cvtColor(np.array(bg.convert('RGB')), cv2.COLOR_RGB2BGR)
        # Las caras pequeñas (fotos de cuerpo entero) se detectan mejor ampliando.
        scale = max(1.0, 640 / max(im.size))
        if scale > 1:
            arr = cv2.resize(arr, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
        self.det.setInputSize((arr.shape[1], arr.shape[0]))
        _, faces = self.det.detect(arr)
        if faces is None or not len(faces):
            return None
        f = max(faces, key=lambda r: r[2] * r[3]) / scale
        return f[0], f[1], f[2], f[3], (f[4] + f[6]) / 2, (f[5] + f[7]) / 2

    def process(self, raw: bytes) -> Image.Image | None:
        im = Image.open(io.BytesIO(raw))
        im.load()
        im = im.convert('RGBA')
        if not has_transparency(im):
            im = keep_main_silhouette(self.remove_bg(im))
        f = self.face(im)
        if f is None:
            return None
        x, y, w, h, ex, ey = f
        cw = w / FACE_WIDTH
        # Foto original muy ajustada a la cara: el encuadre se limita a 1,3 veces su ancho
        # (cara algo más grande que en la ACB) y los bordes laterales se difuminan.
        cw = min(cw, max(w * 1.25, im.width * 1.3))
        if cw > im.width:
            im = fade_sides(im)
        ch = cw * SIZE[1] / SIZE[0]
        cx = x + w / 2
        left, top = cx - cw / 2, ey - EYES_Y * ch
        # Recorte con relleno transparente si el encuadre se sale de la foto.
        canvas = Image.new('RGBA', (int(round(cw)), int(round(ch))), (0, 0, 0, 0))
        canvas.alpha_composite(im, dest=(max(0, -int(round(left))), max(0, -int(round(top)))),
                               source=(max(0, int(round(left))), max(0, int(round(top)))))
        out = canvas.resize(SIZE, Image.LANCZOS)
        if cw < SIZE[0]:
            # Ampliada: un poco de enfoque para compensar.
            rgb = out.convert('RGB').filter(ImageFilter.UnsharpMask(radius=1.2, percent=70, threshold=2))
            rgb.putalpha(out.getchannel('A'))
            out = rgb
        # Si la foto original acaba antes que el encuadre, el corte inferior queda recto:
        # se suaviza con un degradado para que no parezca una foto cortada.
        a = np.array(out.getchannel('A')).astype(np.float32)
        rows = np.where(a.max(1) > 10)[0]
        if len(rows) and rows[-1] < SIZE[1] - 2:
            end = rows[-1]
            fade = int(SIZE[1] * 0.08)
            for i in range(fade):
                a[end - i] *= i / fade
            out.putalpha(Image.fromarray(a.astype(np.uint8)))
        return out


def targets(db: str):
    con = sqlite3.connect(db)
    rows = con.execute(
        """
        SELECT DISTINCT 'f' || x.external_id, COALESCE(p.photo_url, p.photo_nobg_url)
        FROM players p
        -- Por id de la FEB aunque el jugador también tenga ficha en acb.com.
        JOIN external_ids x ON x.entity_type = 'player' AND x.entity_id = p.id AND x.source = 'feb'
        JOIN roster_entries r ON r.player_id = p.id
        JOIN teams t ON t.id = r.team_id
        JOIN competition_seasons cs ON cs.id = t.competition_season_id
        JOIN competitions c ON c.id = cs.competition_id
        WHERE c.code <> 'ACB'
          AND COALESCE(p.photo_url, p.photo_nobg_url) LIKE '%feb.es%'
        """
    ).fetchall()
    con.close()
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--db', default=str(ROOT / 'data' / 'd3basket.db'))
    ap.add_argument('--force', action='store_true')
    ap.add_argument('--recheck', action='store_true', help='rehace solo los resultados dudosos (restos de fondo, huecos)')
    ap.add_argument('--clean', action='store_true', help='solo limpia restos de fondo en las fotos ya generadas')
    ap.add_argument('--refs', help='fichero con referencias (una por línea) que se rehacen')
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--delay', type=float, default=0.3)
    ap.add_argument('--shard', default='0/1', help='k/n: procesa solo una de n partes (para lanzar varios en paralelo)')
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    if args.clean:
        changed = 0
        for file in sorted(OUT.glob('*.webp')):
            im = Image.open(file).convert('RGBA')
            before = np.array(im.getchannel('A')).sum()
            im = keep_main_silhouette(im)
            if np.array(im.getchannel('A')).sum() < before * 0.995:
                im.save(file, 'WEBP', quality=84, method=6)
                changed += 1
        print(f'✔ {changed} fotos limpiadas')
        return
    pipe = Pipeline()
    only = set(Path(args.refs).read_text().split()) if args.refs else None

    def pending(ref: str) -> bool:
        file = OUT / f'{ref}.webp'
        if only is not None:
            return ref in only
        return args.force or not file.exists() or (args.recheck and needs_recheck(file))

    todo = [(ref, url) for ref, url in targets(args.db) if pending(ref)]
    k, n = map(int, args.shard.split('/'))
    todo = [t for i, t in enumerate(todo) if i % n == k]
    if args.limit:
        todo = todo[: args.limit]
    ok = noface = fail = 0
    print(f'{len(todo)} fotos por procesar')
    for i, (ref, url) in enumerate(todo, 1):
        try:
            out = pipe.process(fetch(url))
            if out is None:
                noface += 1
            else:
                out.save(OUT / f'{ref}.webp', 'WEBP', quality=84, method=6)
                ok += 1
        except Exception as e:  # noqa: BLE001
            fail += 1
            print(f'  ✗ {ref} {url}: {e}', file=sys.stderr)
        if i % 50 == 0:
            print(f'  {i}/{len(todo)}  ok {ok} · sin cara {noface} · errores {fail}', flush=True)
        time.sleep(args.delay)
    print(f'✔ {ok} fotos nuevas · {noface} sin cara detectable · {fail} errores')


if __name__ == '__main__':
    main()
