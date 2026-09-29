"""
Escudos homogéneos y colores de club.

Cada escudo se descarga, se le quita el fondo si no es transparente, se recorta
el margen vacío y se centra en un lienzo cuadrado de 256 px con el mismo aire
para todos: así se ven del mismo tamaño en tablas y fichas. Resultado en
public/media/logos/<ref>.png.

De cada escudo se saca además la paleta del club (colores más presentes,
agrupados con k-means en espacio Lab) → public/media/colors.json:
  { "<ref>": { "primary": "#rrggbb", "secondary": "#rrggbb" } }
En la ACB se respeta el color principal oficial de acb.com y del escudo solo
se toma el secundario.

Uso: python tools/media/logos.py [--db data/d3basket.db] [--force]
"""
import argparse
import io
import json
import sqlite3
import sys
import time
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from faces import ROOT, fetch

OUT = ROOT / 'public' / 'media' / 'logos'
COLORS = ROOT / 'public' / 'media' / 'colors.json'
SIZE = 256
MARGIN = 0.06


def remove_flat_background(im: Image.Image) -> Image.Image:
    """Fondo liso (blanco o de color) → transparente, rellenando desde las esquinas."""
    rgba = np.array(im.convert('RGBA'))
    rgb, orig_alpha = rgba[:, :, :3].copy(), rgba[:, :, 3]
    h, w = rgb.shape[:2]
    # Lo ya transparente se pinta del color del fondo para que el relleno lo atraviese.
    edge = np.concatenate([rgba[0], rgba[-1], rgba[:, 0], rgba[:, -1]])
    solid = edge[edge[:, 3] > 200][:, :3]
    if len(solid):
        rgb[orig_alpha < 10] = np.median(solid, 0).astype(np.uint8)
    mask = np.zeros((h + 2, w + 2), np.uint8)
    for seed in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        if mask[seed[1] + 1, seed[0] + 1] == 0:
            cv2.floodFill(rgb.copy(), mask, seed, (0, 0, 0), (12, 12, 12), (12, 12, 12), cv2.FLOODFILL_MASK_ONLY | 8)
    bg = mask[1:-1, 1:-1] > 0
    alpha = np.where(bg, 0, 255).astype(np.uint8)
    alpha = cv2.GaussianBlur(alpha, (3, 3), 0)  # borde suave
    out = np.dstack([rgba[:, :, :3], np.minimum(alpha, orig_alpha)])
    return Image.fromarray(out, 'RGBA')


def is_transparent(im: Image.Image) -> bool:
    if im.mode != 'RGBA':
        return False
    a = np.array(im)[:, :, 3]
    border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    return (border < 10).mean() > 0.6


def trim(im: Image.Image) -> Image.Image:
    bbox = im.getchannel('A').point(lambda v: 255 if v > 12 else 0).getbbox()
    return im.crop(bbox) if bbox else im


def normalize(im: Image.Image) -> Image.Image:
    im = im.convert('RGBA')
    if not is_transparent(im):
        im = remove_flat_background(im)
    im = trim(im)
    # Algunos PNG "transparentes" llevan dentro un recuadro de fondo liso: fuera también.
    # Se repite por si el recuadro tiene un marco fino alrededor.
    for _ in range(3):
        a = np.array(im)[3:-3, 3:-3]
        border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
        opaque = border[border[:, 3] > 200][:, :3].astype(int)
        if not (len(opaque) > 0.6 * len(border) and opaque.std(0).max() < 12):
            break
        im = trim(remove_flat_background(im.crop((3, 3, im.width - 3, im.height - 3))))
    inner = int(SIZE * (1 - 2 * MARGIN))
    s = inner / max(im.size)
    im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
    canvas = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    canvas.alpha_composite(im, ((SIZE - im.width) // 2, (SIZE - im.height) // 2))
    return canvas


def hexc(rgb) -> str:
    return '#%02x%02x%02x' % tuple(int(round(v)) for v in rgb)


def palette(im: Image.Image, k: int = 6):
    """[(rgb, peso, croma, luminosidad)] de mayor a menor presencia."""
    a = np.array(im.convert('RGBA')).reshape(-1, 4)
    px = a[a[:, 3] > 200][:, :3]
    if len(px) < 50:
        return []
    if len(px) > 40000:
        px = px[np.random.default_rng(0).choice(len(px), 40000, replace=False)]
    lab = cv2.cvtColor(px.reshape(-1, 1, 3).astype(np.uint8), cv2.COLOR_RGB2LAB).reshape(-1, 3).astype(np.float32)
    k = min(k, len(np.unique(px, axis=0)))
    _, labels, centers = cv2.kmeans(lab, k, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.5), 4, cv2.KMEANS_PP_CENTERS)
    out = []
    for i, c in enumerate(centers):
        members = px[labels.ravel() == i]
        if not len(members):
            continue
        rgb = np.median(members, 0)
        L = c[0] * 100 / 255
        chroma = float(np.hypot(c[1] - 128, c[2] - 128))
        out.append((rgb, len(members) / len(px), chroma, L))
    return sorted(out, key=lambda x: -x[1])


def lab_dist(a, b) -> float:
    la = cv2.cvtColor(np.uint8([[a]]), cv2.COLOR_RGB2LAB)[0, 0].astype(float)
    lb = cv2.cvtColor(np.uint8([[b]]), cv2.COLOR_RGB2LAB)[0, 0].astype(float)
    return float(np.linalg.norm(la - lb))


def club_colors(im: Image.Image, official_primary: str | None):
    pal = palette(im)
    if not pal:
        return None
    # Colores "de marca": con croma, o negros/grises oscuros; el blanco solo como secundario.
    chromatic = [p for p in pal if p[2] > 18 and p[1] > 0.04]
    dark = [p for p in pal if p[2] <= 18 and p[3] < 35 and p[1] > 0.06]
    white = [p for p in pal if p[2] <= 18 and p[3] > 88 and p[1] > 0.06]
    if official_primary:
        primary = tuple(int(official_primary[i:i + 2], 16) for i in (1, 3, 5))
    elif chromatic:
        primary = chromatic[0][0]
    elif dark:
        primary = dark[0][0]
    else:
        primary = pal[0][0]
    secondary = None
    for p in chromatic + dark + white:
        if lab_dist(p[0], primary) > 35:
            secondary = p[0]
            break
    # Escudo casi blanco: la web lo dibuja con contorno para que se vea sobre fondo claro.
    light = sum(p[1] for p in pal if p[3] > 85 and p[2] < 18) > 0.6
    return {'primary': hexc(primary), 'secondary': hexc(secondary) if secondary is not None else None, **({'light': True} if light else {})}


def targets(db: str):
    con = sqlite3.connect(db)
    rows = con.execute(
        """
        SELECT cr.ref, c.code, COALESCE(t.logo_url, cl.logo_url),
               CASE WHEN c.code = 'ACB' THEN COALESCE(t.primary_color, cl.primary_color) END
        FROM teams t
        JOIN clubs cl ON cl.id = t.club_id
        JOIN v_club_ref cr ON cr.club_id = cl.id
        JOIN competition_seasons cs ON cs.id = t.competition_season_id
        JOIN competitions c ON c.id = cs.competition_id
        WHERE cs.is_current = 1 AND COALESCE(t.logo_url, cl.logo_url) LIKE 'http%'
        """
    ).fetchall()
    con.close()
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--db', default=str(ROOT / 'data' / 'd3basket.db'))
    ap.add_argument('--force', action='store_true')
    ap.add_argument('--delay', type=float, default=0.2)
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    colors = json.loads(COLORS.read_text()) if COLORS.exists() else {}
    done = fail = 0
    for ref, code, url, official in targets(args.db):
        file = OUT / f'{ref}.png'
        if file.exists() and ref in colors and not args.force:
            continue
        try:
            logo = normalize(Image.open(io.BytesIO(fetch(url))))
            logo.save(file, 'PNG', optimize=True)
            c = club_colors(logo, official)
            if c:
                colors[ref] = c
            done += 1
        except Exception as e:  # noqa: BLE001
            fail += 1
            print(f'  ✗ {ref} {url}: {e}', file=sys.stderr)
        time.sleep(args.delay)
    COLORS.write_text(json.dumps(dict(sorted(colors.items())), indent=1, ensure_ascii=False) + '\n')
    print(f'✔ {done} escudos procesados · {fail} errores · {len(colors)} clubes con colores')


if __name__ == '__main__':
    main()
