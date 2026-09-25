"""Post for the gravity.integration loop: EXR -> finished sRGB frames.

1. bloom        only energy above ~1.0 linear (pulses, flashes, glints)
2. display      Standard sRGB with a soft shoulder (exrio.to_display)
3. chips        ERP / CRM / ... tracked to their spheres (screen.json from the
                render), in Epilogue 700, scaled and defocused to the sphere's
                depth so they sit in the shot instead of on top of it
4. edge         squircle dissolve that reaches the page background #f3f4fb
                exactly — so the <video>'s rectangle (and its 8px radius)
                disappears into section.bg-light
"""
import argparse, json, math, os, sys
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFont
from exrio import read_exr, to_display, BG_SRGB8

HERE = os.path.dirname(os.path.abspath(__file__))
FONT = os.path.join(HERE, "fonts", "Epilogue-700.ttf")
INK = np.array([20, 21, 42]) / 255.0          # --gi-ink  #14152a
GREEN = np.array([39, 234, 147]) / 255.0      # --gi-green #27EA93
IDLE = np.array([185, 188, 204]) / 255.0
BG = BG_SRGB8 / 255.0


def bloom(lin, strength, thr=1.0):
    H, W, _ = lin.shape
    bright = np.maximum(lin - thr, 0.0)
    out = np.zeros_like(lin)
    for sigma_frac, w in ((0.0035, 0.45), (0.011, 0.35), (0.032, 0.20)):
        s = max(sigma_frac * W, 0.6)
        out += w * cv2.GaussianBlur(bright, (0, 0), s)
    return lin + strength * out


def edge_mask(H, W, d0, d1, p=4.0):
    y, x = np.mgrid[0:H, 0:W].astype(np.float64)
    xn = (2 * (x + 0.5) / W - 1)
    yn = (2 * (y + 0.5) / H - 1)
    d = (np.abs(xn) ** p + np.abs(yn) ** p) ** (1 / p)
    t = np.clip((d - d0) / (d1 - d0), 0, 1)
    m = 1 - t * t * (3 - 2 * t)
    return m[..., None]


class ChipPainter:
    SS = 3                                     # supersampling for crisp edges

    def __init__(self, W):
        self.s = W / 1920.0
        self.fonts = {}

    def font(self, px):
        k = int(round(px))
        if k not in self.fonts:
            self.fonts[k] = ImageFont.truetype(FONT, k)
        return self.fonts[k]

    def chip(self, label, glow, scale, blur):
        """Returns (premultiplied RGBA float array, anchor_x, anchor_bottom)
        where the anchor is the chip's bottom-centre in the returned array."""
        SS, s = self.SS, self.s * scale
        fpx = 34 * s * SS
        h = 58 * s * SS
        pad = 22 * s * SS
        dot = 12 * s * SS
        gap = 11 * s * SS
        f = self.font(fpx)
        tb = f.getbbox(label)
        tw = tb[2] - tb[0]
        w = pad + dot + gap + tw + pad
        margin = int(40 * s * SS + 3 * blur * SS)
        CW, CH = int(w + 2 * margin), int(h + 2 * margin)
        x0, y0 = margin, margin
        # shadow
        sh = Image.new("L", (CW, CH), 0)
        ImageDraw.Draw(sh).rounded_rectangle([x0, y0 + 5 * s * SS, x0 + w, y0 + h + 5 * s * SS],
                                             radius=h / 2, fill=255)
        sh = cv2.GaussianBlur(np.asarray(sh, np.float32) / 255.0, (0, 0), 9 * s * SS)
        # body + border
        body = Image.new("L", (CW, CH), 0)
        ImageDraw.Draw(body).rounded_rectangle([x0, y0, x0 + w, y0 + h], radius=h / 2, fill=255)
        body = np.asarray(body, np.float32) / 255.0
        inner = Image.new("L", (CW, CH), 0)
        bw = 1.6 * s * SS
        ImageDraw.Draw(inner).rounded_rectangle([x0 + bw, y0 + bw, x0 + w - bw, y0 + h - bw],
                                                radius=h / 2 - bw, fill=255)
        inner = np.asarray(inner, np.float32) / 255.0
        border = np.clip(body - inner, 0, 1)
        # text
        tl = Image.new("L", (CW, CH), 0)
        tx = x0 + pad + dot + gap - tb[0]
        ty = y0 + h / 2 - (tb[1] + tb[3]) / 2
        ImageDraw.Draw(tl).text((tx, ty), label, font=f, fill=255)
        text = np.asarray(tl, np.float32) / 255.0
        # status dot (+ halo when live)
        cx, cy = x0 + pad + dot / 2, y0 + h / 2
        dl = Image.new("L", (CW, CH), 0)
        ImageDraw.Draw(dl).ellipse([cx - dot / 2, cy - dot / 2, cx + dot / 2, cy + dot / 2], fill=255)
        dotm = np.asarray(dl, np.float32) / 255.0
        g = float(np.clip(glow, 0, 1))
        halo = np.zeros_like(dotm)
        if g > 0.01:
            hl = Image.new("L", (CW, CH), 0)
            r = dot * 1.9
            ImageDraw.Draw(hl).ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
            halo = cv2.GaussianBlur(np.asarray(hl, np.float32) / 255.0, (0, 0), dot * 0.6) * 0.55 * g

        dot_col = IDLE * (1 - g) + GREEN * g
        # composite layers (premultiplied), bottom to top
        rgb = np.zeros((CH, CW, 3), np.float32)
        a = np.zeros((CH, CW), np.float32)

        def over(col, alpha):
            nonlocal rgb, a
            rgb = col[None, None, :] * alpha[..., None] + rgb * (1 - alpha[..., None])
            a = alpha + a * (1 - alpha)

        over(INK, sh * 0.16)
        over(np.array([1.0, 1.0, 1.0]), body * 0.95)
        over(INK, border * 0.11)
        over(GREEN, halo)
        over(dot_col, dotm)
        over(INK, text)
        prem = np.concatenate([rgb, a[..., None]], -1)
        if blur > 0.05:
            prem = cv2.GaussianBlur(prem, (0, 0), blur * SS)
        # downsample by SS
        out = cv2.resize(prem, (CW // SS, CH // SS), interpolation=cv2.INTER_AREA)
        return out, (x0 + w / 2) / SS, (y0 + h) / SS

    def paint(self, img, label, x, y_bottom, glow, scale, blur):
        chip, ax, ab = self.chip(label, glow, scale, blur)
        ch, cw, _ = chip.shape
        ox, oy = x - ax, y_bottom - ab
        ix, iy = int(math.floor(ox)), int(math.floor(oy))
        fx, fy = ox - ix, oy - iy
        # sub-pixel placement: bilinear shift of the small premultiplied layer
        M = np.float32([[1, 0, fx], [0, 1, fy]])
        chip = cv2.warpAffine(chip, M, (cw + 1, ch + 1), flags=cv2.INTER_LINEAR,
                              borderMode=cv2.BORDER_CONSTANT, borderValue=0)
        H, W, _ = img.shape
        x0, y0 = max(ix, 0), max(iy, 0)
        x1, y1 = min(ix + cw + 1, W), min(iy + ch + 1, H)
        if x1 <= x0 or y1 <= y0:
            return
        c = chip[y0 - iy:y1 - iy, x0 - ix:x1 - ix]
        img[y0:y1, x0:x1] = c[..., :3] + img[y0:y1, x0:x1] * (1 - c[..., 3:4])


def process(exr_path, meta, P, painter, emask):
    lin = read_exr(exr_path)
    H, W, _ = lin.shape
    if P["bloom"] > 0:
        lin = bloom(lin, P["bloom"], P["bloom_thr"])
    img = to_display(lin, P["exposure"]).astype(np.float32)
    if P["chips"] and meta:
        hub_depth = meta["hub"]["depth"]
        order = sorted(meta["systems"].items(), key=lambda kv: -kv[1]["depth"])  # far first
        for name, m in order:
            sc = float(np.clip((hub_depth / m["depth"]) ** 0.5, 0.86, 1.16))
            pop = 1.0 + 0.8 * (m.get("scale", 1.0) - 1.0)
            blur = float(np.clip(m["coc"] * 0.30, 0.0, 2.2 * W / 1920))
            gap = 16 * W / 1920 * sc
            painter.paint(img, name, m["x"], m["top"] - gap, m["glow"], sc * pop, blur)
    # dissolve into the page background
    out = BG[None, None, :] + (img - BG[None, None, :]) * emask
    return np.clip(out, 0, 1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True)
    ap.add_argument("--dst", required=True)
    ap.add_argument("--exposure", type=float, default=1.0)
    ap.add_argument("--bloom", type=float, default=0.22)
    ap.add_argument("--bloom-thr", type=float, default=1.0)
    ap.add_argument("--no-chips", action="store_true")
    ap.add_argument("--edge", default="0.70,0.955")   # exact bg >=18 px deep at 1440x804
    ap.add_argument("--only", default=None, help="comma list of frame stems")
    a = ap.parse_args()
    P = dict(exposure=a.exposure, bloom=a.bloom, bloom_thr=a.bloom_thr, chips=not a.no_chips)
    os.makedirs(a.dst, exist_ok=True)
    meta_all = json.load(open(os.path.join(a.src, "screen.json")))
    stems = sorted(k for k in meta_all if os.path.exists(os.path.join(a.src, k + ".exr")))
    if a.only:
        stems = [s for s in stems if s in a.only.split(",")]
    d0, d1 = map(float, a.edge.split(","))
    painter, emask = None, None
    for stem in stems:
        exr = os.path.join(a.src, stem + ".exr")
        if os.environ.get("RESUME") and os.path.exists(os.path.join(a.dst, stem + ".png")):
            continue
        if emask is None:
            H, W, _ = read_exr(exr).shape
            emask = edge_mask(H, W, d0, d1).astype(np.float32)
            painter = ChipPainter(W)
        out = process(exr, meta_all[stem], P, painter, emask)
        Image.fromarray((out * 255 + 0.5).astype(np.uint8)).save(os.path.join(a.dst, stem + ".png"))
    print("post done:", len(stems), "frames ->", a.dst)


if __name__ == "__main__":
    main()
