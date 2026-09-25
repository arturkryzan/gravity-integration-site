"""EXR reading + the display transform shared by previews and the final post."""
import numpy as np
import OpenEXR

BG_SRGB8 = np.array([243, 244, 251], dtype=np.float64)   # section.bg-light


def read_exr(path):
    with OpenEXR.File(path) as f:
        ch = f.parts[0].channels
        if "RGB" in ch:
            rgb = ch["RGB"].pixels
        elif "RGBA" in ch:
            rgb = ch["RGBA"].pixels[..., :3]
        else:
            rgb = np.stack([ch[k].pixels for k in ("R", "G", "B")], -1)
    return np.asarray(rgb, dtype=np.float32)


def srgb_oetf(x):
    x = np.clip(x, 0.0, 1.0)
    return np.where(x <= 0.0031308, 12.92 * x, 1.055 * np.power(x, 1 / 2.4) - 0.055)


def srgb_eotf(v):
    v = np.clip(v, 0.0, 1.0)
    return np.where(v <= 0.04045, v / 12.92, np.power((v + 0.055) / 1.055, 2.4))


def shoulder(lin, knee=0.82):
    """Standard view, but with a soft roll-off above `knee` so glossy highlights
    and emissive cores compress instead of hard-clipping (keeps the hub's
    green highlight from turning into a flat white disc)."""
    peak = np.max(lin, axis=-1, keepdims=True)
    over = np.maximum(peak - knee, 0.0)
    comp = knee + (1.0 - knee) * (1.0 - np.exp(-over / (1.0 - knee)))
    scale = np.where(peak > knee, comp / np.maximum(peak, 1e-6), 1.0)
    out = lin * scale
    # desaturate toward white only where the compressed value approaches 1
    w = np.clip((peak - 1.0) / 3.0, 0.0, 1.0) ** 1.5
    return out * (1 - w) + w * np.max(out, axis=-1, keepdims=True)


def to_display(lin, exposure=1.0):
    return srgb_oetf(shoulder(lin * exposure))
