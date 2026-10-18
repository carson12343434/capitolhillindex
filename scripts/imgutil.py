"""Portrait cropping and encoding shared by photos.py and candidate_photos.py."""
from __future__ import annotations

import base64
import io

from PIL import Image, ImageOps

BIG = (300, 367)     # stored files: race cards, drawers, social posts
SMALL = (96, 118)    # inline thumbnails in the members table
RATIO = BIG[0] / BIG[1]

_cascade = None


def _faces(img: Image.Image) -> list[tuple[int, int, int, int]]:
    """Face boxes (x, y, w, h), largest first. Empty if OpenCV isn't installed."""
    global _cascade
    try:
        import cv2
        import numpy as np
    except ImportError:
        return []
    if _cascade is None:
        _cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    gray = cv2.cvtColor(np.asarray(img.convert("RGB")), cv2.COLOR_RGB2GRAY)
    found = _cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=6, minSize=(40, 40))
    if len(found) == 0:
        found = _cascade.detectMultiScale(gray, scaleFactor=1.05, minNeighbors=4, minSize=(40, 40))
    return sorted((tuple(int(v) for v in f) for f in found), key=lambda f: -f[2] * f[3])


def open_image(data: bytes) -> Image.Image:
    img = Image.open(io.BytesIO(data))
    img = ImageOps.exif_transpose(img)
    return img.convert("RGB")


def crop_portrait(img: Image.Image, find_face: bool) -> Image.Image | None:
    """Crop to the site's portrait shape. Official portraits are already head-and-shoulders, so they get a
    top-weighted crop. Other photos are cropped around the largest detected face; no face means no photo,
    since a badly framed crowd shot is worse than a placeholder."""
    W, H = img.size
    if find_face:
        faces = _faces(img)
        if not faces:
            # Portrait-shaped photos with no detectable face are usually tight headshots at an angle;
            # landscape ones are usually event photos, which we skip.
            return crop_portrait(img, find_face=False) if H >= W * 1.1 else None
        x, y, w, h = faces[0]
        if w < 60 or w < W * 0.12:  # too small to look sharp once enlarged, or a face in a crowd
            return None
        cw = min(W, int(w * 2.4))
        ch = int(cw / RATIO)
        if ch > H:
            ch = H
            cw = int(ch * RATIO)
        cx, cy = x + w / 2, y + h / 2
        left = int(min(max(cx - cw / 2, 0), W - cw))
        top = int(min(max(cy - ch * 0.42, 0), H - ch))
        return img.crop((left, top, left + cw, top + ch))
    if W / H > RATIO:
        cw = int(H * RATIO)
        left = (W - cw) // 2
        return img.crop((left, 0, left + cw, H))
    ch = int(W / RATIO)
    top = int((H - ch) * 0.15)
    return img.crop((0, top, W, top + ch))


def webp(img: Image.Image, size: tuple[int, int], quality: int) -> bytes:
    out = img.resize(size, Image.LANCZOS) if img.size != size else img
    buf = io.BytesIO()
    out.save(buf, "WEBP", quality=quality, method=6)
    return buf.getvalue()


def data_uri(b: bytes) -> str:
    return "data:image/webp;base64," + base64.b64encode(b).decode()
