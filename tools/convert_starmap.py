# NASA SVS Deep Star Maps 2020 (linear, 0..1) -> sRGB 8bit 이미지
import sys, os, OpenEXR, numpy as np
from PIL import Image
src, outdir = sys.argv[1], sys.argv[2]
with OpenEXR.File(src) as f:
    a = f.channels()['RGB'].pixels.astype(np.float32)
a = np.clip(a, 0, 1)
def srgb(x): return np.where(x <= 0.0031308, 12.92 * x, 1.055 * np.power(x, 1 / 2.4) - 0.055)
for w in (4096, 2048):
    img = a
    if w != a.shape[1]:
        # 면적 평균 다운샘플 (선형 공간에서 2x2 평균)
        img = a.reshape(a.shape[0] // 2, 2, a.shape[1] // 2, 2, 3).mean((1, 3))
    u8 = np.round(srgb(img) * 255).astype(np.uint8)
    im = Image.fromarray(u8, 'RGB')
    for ext, kw in (('png', dict(optimize=True)), ('webp', dict(lossless=False, quality=90, method=6)), ('jpg', dict(quality=92, subsampling=0))):
        p = os.path.join(outdir, f'starmap_{w}.{ext}')
        im.save(p, **kw)
        print(p, os.path.getsize(p) // 1024, 'KB')
