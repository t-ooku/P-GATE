#!/usr/bin/env python3
"""2026-09-17 大隆さん決定: カルーセル画像フィード投稿（月・水・土）。

- 入力: ops/social/carousels-v3.json（6 セット、ユーザー向け 3・セラー向け 3）
- 出力: public/social/carousel/<set_id>/<n>.jpg（1080x1350、4 枚）と
        public/social/carousel/manifest.json（sha256・枚数・監査用）
- 描画は Pillow だけ（AI 生成なし、実在商品・他社ロゴなし）。同じ入力から同じ画像が出る。
- 文言の機械検査: §33 の禁止表現、割引率・価格の断定を含む文は失敗させる。

使い方: python3 scripts/build-social-carousels.py [/path/to/NotoSansCJK-Bold.ttc]
"""
import hashlib
import json
import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'ops' / 'social' / 'carousels-v3.json'
OUT = ROOT / 'public' / 'social' / 'carousel'
FONT = Path(sys.argv[1] if len(sys.argv) > 1 else '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc')
FORBIDDEN = re.compile(r'必ず|売上が上が|多数のユーザー|業界No|確実に|100%|最安|\d+%OFF|\d+%off|保証します')
INK = (23, 23, 43)
MUTED = (109, 107, 128)
VIOLET = (115, 87, 255)
PINK = (255, 79, 154)
CANVAS = (248, 247, 252)
PAPER = (255, 255, 255)
LINE = (233, 229, 245)

if not FONT.exists():
    raise SystemExit(f'FONT_MISSING:{FONT}')


def font(size, index=0):
    return ImageFont.truetype(str(FONT), size, index=index)


def gradient(width, height):
    img = Image.new('RGB', (width, height), CANVAS)
    px = img.load()
    for y in range(height):
        t = y / max(1, height - 1)
        r = int(238 + (248 - 238) * t)
        g = int(232 + (247 - 232) * t)
        b = int(255 + (252 - 255) * t)
        for x in range(width):
            px[x, y] = (r, g, b)
    return img


def draw_multiline(draw, xy, text, fnt, fill, line_gap=1.22, max_width=None):
    x, y = xy
    lines = []
    for raw in text.split('\n'):
        if not max_width:
            lines.append(raw)
            continue
        current = ''
        for ch in raw:
            trial = current + ch
            # 行頭禁則: 閉じ括弧・句読点は前の行に付ける
            if draw.textlength(trial, font=fnt) > max_width and current and ch not in '」』）、。！？':
                lines.append(current)
                current = ch
            else:
                current = trial
        lines.append(current)
    size = fnt.size
    for line in lines:
        draw.text((x, y), line, font=fnt, fill=fill)
        y += int(size * line_gap)
    return y


def render_slide(doc, item, slide, index, total):
    width, height = doc['size']
    img = gradient(width, height)
    draw = ImageDraw.Draw(img)
    seller = item['audience'] == 'seller'
    accent = VIOLET if not seller else (36, 27, 77)
    # ブランド帯
    draw.rounded_rectangle((60, 60, 60 + 84, 60 + 84), radius=22, fill=accent)
    draw.text((60 + 22, 60 + 8), 'H', font=font(56), fill=PAPER)
    draw.text((164, 68), 'HOSHILU', font=font(40), fill=INK)
    draw.text((164, 114), 'ホシル' if not seller else 'ホシル｜ショップ・セラーの方へ', font=font(24), fill=MUTED)
    # ページ番号
    label = f'{index}/{total}'
    draw.text((width - 60 - draw.textlength(label, font=font(28)), 84), label, font=font(28), fill=MUTED)
    # カード
    card = (60, 220, width - 60, height - 200)
    draw.rounded_rectangle(card, radius=44, fill=PAPER, outline=LINE, width=3)
    kicker = slide['kicker']
    kicker_font = font(30)
    if kicker.isdigit():
        draw.rounded_rectangle((120, 290, 120 + 88, 290 + 88), radius=28, fill=PINK if not seller else accent)
        draw.text((120 + 28, 290 + 16), kicker, font=font(50), fill=PAPER)
        y = 420
    else:
        draw.text((120, 300), kicker, font=kicker_font, fill=VIOLET if not seller else accent)
        y = 360
    y = draw_multiline(draw, (120, y), slide['headline'], font(72), INK, line_gap=1.25, max_width=width - 240)
    y += 30
    draw.line((120, y, 120 + 120, y), fill=PINK if not seller else accent, width=8)
    y += 40
    draw_multiline(draw, (120, y), slide['body'], font(40), MUTED, line_gap=1.5, max_width=width - 240)
    # フッター
    footer_font = font(30)
    draw.text((60, height - 130), doc['footer'], font=footer_font, fill=INK)
    hint = '無料・メール6桁かLINEで登録' if not seller else '相談フォーム送信だけでは課金されません'
    draw.text((60, height - 84), hint, font=font(26), fill=MUTED)
    if index == total:
        cta = 'プロフィールのリンクから →'
        w = draw.textlength(cta, font=font(30))
        draw.rounded_rectangle((width - 60 - w - 56, height - 140, width - 60, height - 70), radius=35, fill=accent)
        draw.text((width - 60 - w - 28, height - 124), cta, font=font(30), fill=PAPER)
    return img


def main():
    doc = json.loads(SOURCE.read_text(encoding='utf-8'))
    manifest = {'version': doc['version'], 'size': doc['size'], 'sets': {}}
    for item in doc['sets']:
        text = json.dumps(item, ensure_ascii=False)
        bad = FORBIDDEN.search(text)
        if bad:
            raise SystemExit(f'FORBIDDEN_CLAIM:{item["id"]}:{bad.group(0)}')
        if not 2 <= len(item['slides']) <= 10:
            raise SystemExit(f'SLIDE_COUNT:{item["id"]}')
        folder = OUT / item['id']
        folder.mkdir(parents=True, exist_ok=True)
        files = []
        for index, slide in enumerate(item['slides'], start=1):
            img = render_slide(doc, item, slide, index, len(item['slides']))
            target = folder / f'{index}.jpg'
            img.save(target, 'JPEG', quality=88, optimize=True, progressive=False)
            digest = hashlib.sha256(target.read_bytes()).hexdigest()
            files.append({'file': f'{item["id"]}/{index}.jpg', 'sha256': digest, 'bytes': target.stat().st_size})
        manifest['sets'][item['id']] = {'audience': item['audience'], 'slides': len(item['slides']), 'files': files}
        print(item['id'], len(files), 'slides')
    (OUT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
