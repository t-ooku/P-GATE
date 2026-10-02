#!/usr/bin/env python3
"""HOSHILU Seller「AI販促担当」の SNS 用画像（指示書 ai-promo-20261003-v2 §6-2・§12）。

既存カルーセル（build-social-carousels.py）と同じく Pillow + Noto CJK で描く。AI 画像生成は使わない。
テンプレは 3 種（正方形 1080x1080・縦 1080x1350・横 1080x566）。どれも幅 1,080px 以下（R2 の容量対策）。
構成: 商品写真（店が許諾した画像 URL、https のみ）＋店の色の帯＋見出し（14 字以内）＋小見出し（24 字以内）＋ロゴ。

入力 JSON: {"briefs":[{"key":"<seller_key>/<week_key>/<deliverable_id>-<n>","headline":"","sub":"",
             "image_url":"https://...","color":"#1f6f5c","logo_url":"https://...(任意)"}]}
出力: <out>/<key>-{square,portrait,landscape}.jpg と <out>/manifest.json（文字の見切れ検査の結果つき）。
使い方: python3 build-seller-promo-images.py briefs.json out/ /usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc
"""
import io
import json
import re
import sys
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

SIZES = {'square': (1080, 1080), 'portrait': (1080, 1350), 'landscape': (1080, 566)}
MAX_IMAGE_BYTES = 8 * 1024 * 1024
KEY_PATTERN = re.compile(r'^[A-Za-z0-9_:/-]{3,200}$')


def hex_colour(value, fallback=(31, 111, 92)):
    match = re.fullmatch(r'#([0-9a-fA-F]{6})', str(value or ''))
    if not match:
        return fallback
    raw = match.group(1)
    return tuple(int(raw[i:i + 2], 16) for i in (0, 2, 4))


def fetch_image(url):
    """店が許諾した画像だけを読む。https 以外・大きすぎる画像は使わない（写真なしで描く）。"""
    if not str(url or '').startswith('https://'):
        return None
    request = urllib.request.Request(url, headers={'user-agent': 'hoshilu-seller-promo-images/1.0'})
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            data = response.read(MAX_IMAGE_BYTES + 1)
        if len(data) > MAX_IMAGE_BYTES:
            return None
        return Image.open(io.BytesIO(data)).convert('RGB')
    except Exception:
        return None


def cover(photo, size):
    w, h = size
    scale = max(w / photo.width, h / photo.height)
    resized = photo.resize((max(1, int(photo.width * scale)), max(1, int(photo.height * scale))), Image.LANCZOS)
    left = (resized.width - w) // 2
    top = (resized.height - h) // 2
    return resized.crop((left, top, left + w, top + h))


def fit_font(draw, text, font_path, max_width, start, minimum):
    size = start
    while size > minimum:
        fnt = ImageFont.truetype(font_path, size)
        if draw.textlength(text, font=fnt) <= max_width:
            return fnt, False
        size -= 2
    fnt = ImageFont.truetype(font_path, minimum)
    return fnt, draw.textlength(text, font=fnt) > max_width


def readable_ink(colour):
    r, g, b = colour
    return (20, 20, 20) if (0.299 * r + 0.587 * g + 0.114 * b) > 160 else (255, 255, 255)


def render(brief, kind, font_path, photo, logo):
    w, h = SIZES[kind]
    colour = hex_colour(brief.get('color'))
    ink = readable_ink(colour)
    band_h = int(h * (0.34 if kind != 'landscape' else 0.42))
    img = Image.new('RGB', (w, h), (246, 244, 240))
    if photo is not None:
        img.paste(cover(photo, (w, h - band_h)), (0, 0))
    draw = ImageDraw.Draw(img)
    draw.rectangle((0, h - band_h, w, h), fill=colour)
    pad = int(w * 0.06)
    max_text = w - pad * 2
    headline = str(brief.get('headline') or '')[:14]
    sub = str(brief.get('sub') or '')[:24]
    head_font, head_over = fit_font(draw, headline, font_path, max_text, int(min(w * 0.095, band_h * 0.34)), int(min(w * 0.05, band_h * 0.2)))
    sub_font, sub_over = fit_font(draw, sub, font_path, max_text, int(min(w * 0.05, band_h * 0.18)), int(min(w * 0.03, band_h * 0.12)))
    y = h - band_h + int(band_h * 0.18)
    draw.text((pad, y), headline, font=head_font, fill=ink)
    head_box = draw.textbbox((pad, y), headline, font=head_font)
    y2 = head_box[3] + int(band_h * 0.08)
    draw.text((pad, y2), sub, font=sub_font, fill=ink)
    sub_box = draw.textbbox((pad, y2), sub, font=sub_font)
    if logo is not None:
        logo_h = int(band_h * 0.22)
        scaled = logo.resize((max(1, int(logo.width * logo_h / logo.height)), logo_h), Image.LANCZOS)
        img.paste(scaled, (w - pad - scaled.width, h - pad // 2 - logo_h))
    # 見切れ検査（機械的）: 文字が帯の外・画像の外に出ていないか。Cloud Vision での文字崩れ検査は別段で行う。
    clipped = head_over or sub_over or head_box[2] > w - pad // 2 or sub_box[2] > w - pad // 2 or sub_box[3] > h
    return img, {'clipped': bool(clipped), 'headline_px': int(head_font.size), 'sub_px': int(sub_font.size)}


def main(briefs_path, out_dir, font_path):
    data = json.loads(Path(briefs_path).read_text(encoding='utf-8'))
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    manifest = {'images': []}
    for brief in data.get('briefs', [])[:20]:
        key = str(brief.get('key') or '')
        if not KEY_PATTERN.match(key) or '..' in key:
            manifest['images'].append({'key': key[:80], 'error': 'KEY_INVALID'})
            continue
        photo = fetch_image(brief.get('image_url'))
        logo = fetch_image(brief.get('logo_url'))
        for kind in SIZES:
            img, check = render(brief, kind, font_path, photo, logo)
            name = f'{key.replace("/", "__")}-{kind}.jpg'
            img.save(out / name, 'JPEG', quality=86, optimize=True, progressive=True)
            manifest['images'].append({'key': key, 'kind': kind, 'file': name, 'width': img.width, 'height': img.height,
                                       'photo': photo is not None, **check})
    (out / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding='utf-8')
    return 1 if any(item.get('clipped') or item.get('error') for item in manifest['images']) else 0


if __name__ == '__main__':
    if len(sys.argv) != 4:
        print(__doc__)
        sys.exit(2)
    sys.exit(main(sys.argv[1], sys.argv[2], sys.argv[3]))
