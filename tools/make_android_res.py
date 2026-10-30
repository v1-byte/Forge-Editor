#!/usr/bin/env python3
"""Buat SEMUA aset gambar CodeForge dari logo FORGE (assets/logo-source.png).

Sumber : assets/logo-source.png  (logo putih di atas hitam, 1254x1254)
Hasil  : resources/android/res/**   ikon launcher (adaptif, bulat, monokrom) + splash
         assets/icon-*.png, splash*.png   master untuk @capacitor/assets (opsional)
         www/assets/*                      logo & favicon web (WebP / PNG palet, sangat ringan)

Jalankan ulang hanya bila logo berubah:  python3 tools/make_android_res.py
Butuh: pip install pillow numpy scipy
"""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage as ndi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'logo-source.png')
RES = os.path.join(ROOT, 'resources', 'android', 'res')
WEB = os.path.join(ROOT, 'www', 'assets')

# Palet "Forge": hijau zamrud -> cyan di atas biru-hitam pekat
C1, C2 = (46, 230, 166), (56, 189, 248)      # gradien logo
BG_A, BG_B = (12, 34, 32), (5, 9, 14)         # gradien latar ikon
FLAT = (7, 13, 18)                            # latar splash polos (#070d12)

lum = np.array(Image.open(SRC).convert('L'))


# ---------- ekstraksi logo ----------
def tint(alpha, c1=C1, c2=C2):
    """alpha (uint8 HxW) -> RGBA berwarna gradien diagonal."""
    h, w = alpha.shape
    t = (np.add.outer(np.linspace(0, 1, h), np.linspace(0, 1, w))) / 2
    rgb = np.stack([c1[i] + (c2[i] - c1[i]) * t for i in range(3)], -1)
    return Image.fromarray(np.dstack([rgb, alpha]).astype(np.uint8), 'RGBA')


def tight(img):
    bbox = img.split()[-1].point(lambda v: 255 if v > 10 else 0).getbbox()
    return img.crop(bbox)


def frog_alpha():
    """Hanya huruf 'g' berbentuk kodok (+ kilau mata), tanpa huruf lain."""
    lab, n = ndi.label(lum > 110)
    sizes = ndi.sum(lum > 110, lab, range(1, n + 1))
    main = int(np.argmax(sizes)) + 1
    ys, xs = np.where(lab == main)
    x0, y0, x1, y1 = xs.min(), ys.min(), xs.max(), ys.max()
    keep = lab == main
    for i in range(1, n + 1):          # kilau mata = komponen kecil di dalam bbox kodok
        yy, xx = np.where(lab == i)
        if i != main and sizes[i - 1] < 800 and x0 < xx.min() and xx.max() < x1 and y0 < yy.min() and yy.max() < y1:
            keep |= lab == i
    keep = ndi.binary_dilation(keep, iterations=3)
    # lubang mata hitam tetap hitam: ambil luminans apa adanya di dalam area (di-dilate)
    a = np.where(keep, lum, 0).astype(np.uint8)
    return a


mark = tight(tint(frog_alpha()))
full = tight(tint(lum))
mark_white = tight(tint(frog_alpha(), (255, 255, 255), (255, 255, 255)))


def fit(img, w=None, h=None):
    r = (w / img.width) if w else (h / img.height)
    return img.resize((max(1, round(img.width * r)), max(1, round(img.height * r))), Image.LANCZOS)


def center(canvas, img):
    canvas.alpha_composite(img, ((canvas.width - img.width) // 2, (canvas.height - img.height) // 2))
    return canvas


def bg_gradient(size):
    t = np.add.outer(np.linspace(0, 1, size), np.linspace(0, 1, size)) / 2
    rgb = np.stack([BG_A[i] + (BG_B[i] - BG_A[i]) * t for i in range(3)], -1)
    img = Image.fromarray(rgb.astype(np.uint8), 'RGB').convert('RGBA')
    glow = Image.new('L', (size, size), 0)
    ImageDraw.Draw(glow).ellipse((size * .18, size * .12, size * .82, size * .76), fill=46)
    glow = glow.filter(ImageFilter.GaussianBlur(size * .14))
    img.alpha_composite(Image.merge('RGBA', (*Image.new('RGB', (size, size), C1).split(), glow)))
    return img


def shaped(size, shape):
    m = Image.new('L', (size, size), 0)
    d = ImageDraw.Draw(m)
    if shape == 'round':
        d.ellipse((0, 0, size - 1, size - 1), fill=255)
    elif shape == 'square':
        d.rounded_rectangle((0, 0, size - 1, size - 1), radius=int(size * .225), fill=255)
    else:
        m = Image.new('L', (size, size), 255)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.paste(bg_gradient(size), (0, 0), m)
    return out


def pal(img, colors=128):
    """Kuantisasi palet -> PNG jauh lebih kecil, tetap halus (dithering)."""
    if img.mode == 'RGBA':
        return img.quantize(colors=colors, method=Image.FASTOCTREE, dither=Image.FLOYDSTEINBERG)
    return img.convert('RGB').quantize(colors=colors, method=Image.MEDIANCUT, dither=Image.FLOYDSTEINBERG)


def save_png(img, path, colors=128):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    pal(img, colors).save(path, optimize=True)


def save_webp(img, path, q=82):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, 'WEBP', quality=q, method=6)


def res(*parts):
    return os.path.join(RES, *parts)


# ---------- master 1024 ----------
def icon_master(shape):
    return center(shaped(1024, shape), fit(mark, h=640))


def foreground_master(white=False):
    c = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
    return center(c, fit(mark_white if white else mark, h=500))   # di dalam safe zone adaptive icon


legacy, rounded = icon_master('square'), icon_master('round')
fg, fg_mono = foreground_master(), foreground_master(True)

for name, px in {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}.items():
    save_png(legacy.resize((px, px), Image.LANCZOS), res(f'mipmap-{name}', 'ic_launcher.png'), 256)
    save_png(rounded.resize((px, px), Image.LANCZOS), res(f'mipmap-{name}', 'ic_launcher_round.png'), 256)
for name, px in {'mdpi': 108, 'hdpi': 162, 'xhdpi': 216, 'xxhdpi': 324, 'xxxhdpi': 432}.items():
    save_png(fg.resize((px, px), Image.LANCZOS), res(f'mipmap-{name}', 'ic_launcher_foreground.png'), 256)
    save_png(fg_mono.resize((px, px), Image.LANCZOS), res(f'mipmap-{name}', 'ic_launcher_monochrome.png'), 16)


# ---------- splash (latar polos -> PNG palet sangat kecil) ----------
def splash(w, h):
    c = Image.new('RGBA', (w, h), FLAT + (255,))
    return center(c, fit(full, w=round(min(w, h) * 0.58)))


SPL = {'mdpi': (320, 480), 'hdpi': (480, 800), 'xhdpi': (720, 1280), 'xxhdpi': (960, 1600), 'xxxhdpi': (1280, 1920)}
save_png(splash(480, 320), res('drawable', 'splash.png'), 96)
for name, (w, h) in SPL.items():
    save_png(splash(w, h), res(f'drawable-port-{name}', 'splash.png'), 96)
    save_png(splash(h, w), res(f'drawable-land-{name}', 'splash.png'), 96)

# ---------- XML ----------
xml_dir = res('mipmap-anydpi-v26')
os.makedirs(xml_dir, exist_ok=True)
adaptive = '''<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/cf_icon_bg"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>
</adaptive-icon>
'''
for n in ('ic_launcher.xml', 'ic_launcher_round.xml'):
    open(os.path.join(xml_dir, n), 'w').write(adaptive)

os.makedirs(res('drawable'), exist_ok=True)
open(res('drawable', 'cf_icon_bg.xml'), 'w').write('''<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <gradient android:type="linear" android:angle="315" android:startColor="#0C2220" android:endColor="#05090E"/>
</shape>
''')
os.makedirs(res('values'), exist_ok=True)
open(res('values', 'cf_colors.xml'), 'w').write('''<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="cf_icon_background">#0C2220</color>
    <color name="cf_splash_background">#070D12</color>
</resources>
''')

# ---------- master @capacitor/assets (opsional) ----------
A = os.path.join(ROOT, 'assets')
save_png(legacy, os.path.join(A, 'icon-only.png'), 256)
save_png(fg, os.path.join(A, 'icon-foreground.png'), 256)
save_png(shaped(1024, 'full'), os.path.join(A, 'icon-background.png'), 64)
for n in ('splash.png', 'splash-dark.png'):
    save_png(splash(2732, 2732), os.path.join(A, n), 96)

# ---------- web ----------
def tile(size, content, ratio, by='w'):
    t = shaped(size, 'full')
    return center(t, fit(content, w=round(size * ratio)) if by == 'w' else fit(content, h=round(size * ratio)))


save_webp(tile(256, full, 0.80).convert('RGB'), os.path.join(WEB, 'logo.webp'), 80)
save_webp(tile(96, mark, 0.66, 'h').convert('RGB'), os.path.join(WEB, 'mark.webp'), 82)
save_png(center(shaped(192, 'square'), fit(mark, h=122)), os.path.join(WEB, 'icon-192.png'), 256)
save_png(center(shaped(512, 'square'), fit(mark, h=326)), os.path.join(WEB, 'icon-512.png'), 256)
print('OK ->', RES)
