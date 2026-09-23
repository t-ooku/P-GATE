#!/usr/bin/env python3
"""2026-09-17 大隆さん決定: カルーセル画像フィード投稿（月・水・土）。

- 入力: ops/social/carousels-v3.json（6 セット、ユーザー向け 3・セラー向け 3）
- 出力: public/social/carousel/<set_id>/<n>.jpg（1080x1350、4 枚）と
        public/social/carousel/manifest.json（sha256・枚数・監査用）
- 描画は Pillow だけ（AI 生成なし、実在商品・他社ロゴなし）。同じ入力から同じ画像が出る。
- 文言の機械検査: §33 の禁止表現、割引率・価格の断定を含む文は失敗させる。

2026-09-23 大隆さん指示「インスタ投稿したの50円書いてたから削除したよ。違うのをオシャレに作って再投稿して」:
- 2026-09-21 に廃止した Demand Match Click（1クリック50円）が seller-demand-visible に残っていた。
  PRICING_BAN で「50円」「1クリック」「クリック課金」「Demand Match Click」を機械で止める。
  料金の言い方は「4,980円/月（税込）・最初の3か月0円・クリックによる追加料金なし」だけにする。
- 同時に見た目を作り直した。表紙は濃色のグラデーションに大きな見出し、中面は影のついた白いカード、
  下に進行ドット。書体は Bold（見出し）と Regular（本文）を使い分ける。どちらも ubuntu の
  fonts-noto-cjk に入っているので、CI と手元で同じ絵が出る。
- 画像を作り直すのは .github/workflows/build-social-carousels.yml。Issue パッチ経由の push は
  Actions の GITHUB_TOKEN で行われ、後続のワークフローを起こさない（GitHub の仕様）。
  このファイルか carousels-v3.json を外から push し直すと再生成が走る。

使い方: python3 scripts/build-social-carousels.py [/path/to/NotoSansCJK-Bold.ttc]
"""
import hashlib
import json
import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'ops' / 'social' / 'carousels-v3.json'
OUT = ROOT / 'public' / 'social' / 'carousel'
FONT = Path(sys.argv[1] if len(sys.argv) > 1 else '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc')
FORBIDDEN = re.compile(r'必ず|売上が上が|多数のユーザー|業界No|確実に|100%|最安|\d+%OFF|\d+%off|保証します')
# 2026-09-23: 廃止した課金の言い方を二度と載せない。数字ではなく言い方ごと止める。
PRICING_BAN = re.compile(r'Demand Match Click|1クリック|クリック課金|クリック単価|50円|５０円')

INK = (23, 23, 43)
MUTED = (109, 107, 128)
FAINT = (154, 151, 173)
VIOLET = (115, 87, 255)
PINK = (255, 79, 154)
NAVY = (26, 22, 51)
PAPER = (255, 255, 255)
LINE = (235, 231, 247)

if not FONT.exists():
    raise SystemExit(f'FONT_MISSING:{FONT}')


# 見出しは太く、本文は細く。ubuntu の fonts-noto-cjk に必ず入っている Bold と Regular だけを
# 使う（別ウェイトを足すとワークフローの変更が要り、CI と手元で絵が変わってしまう）。
REGULAR_FONT = FONT.with_name('NotoSansCJK-Regular.ttc')
if not REGULAR_FONT.exists():
    REGULAR_FONT = FONT


def font(size, weight='bold'):
    path = REGULAR_FONT if weight == 'light' else FONT
    return ImageFont.truetype(str(path), size)


def mix(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gradient(size, top, bottom):
    width, height = size
    img = Image.new('RGB', (width, height), top)
    draw = ImageDraw.Draw(img)
    for y in range(height):
        draw.line(((0, y), (width, y)), fill=mix(top, bottom, y / max(1, height - 1)))
    return img


def glow(img, center, radius, color, alpha):
    """やわらかい丸い光。背景に奥行きを出すためだけに使う。"""
    layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).ellipse(
        (center[0] - radius, center[1] - radius, center[0] + radius, center[1] + radius),
        fill=color + (alpha,))
    layer = layer.filter(ImageFilter.GaussianBlur(radius // 2))
    return Image.alpha_composite(img.convert('RGBA'), layer).convert('RGB')


def card_with_shadow(img, box, radius=52):
    shadow = Image.new('RGBA', img.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        (box[0] + 6, box[1] + 18, box[2] + 6, box[3] + 22), radius=radius, fill=(40, 30, 90, 46))
    shadow = shadow.filter(ImageFilter.GaussianBlur(26))
    img = Image.alpha_composite(img.convert('RGBA'), shadow).convert('RGB')
    ImageDraw.Draw(img).rounded_rectangle(box, radius=radius, fill=PAPER, outline=LINE, width=2)
    return img


def wrap(draw, text, fnt, max_width):
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
    return lines


def draw_multiline(draw, xy, text, fnt, fill, line_gap=1.22, max_width=None):
    x, y = xy
    for line in wrap(draw, text, fnt, max_width):
        draw.text((x, y), line, font=fnt, fill=fill)
        y += int(fnt.size * line_gap)
    return y


def logo(draw, xy, accent, sub, on_dark=False):
    x, y = xy
    draw.rounded_rectangle((x, y, x + 78, y + 78), radius=24, fill=PAPER if on_dark else accent)
    draw.text((x + 22, y + 10), 'H', font=font(46), fill=accent if on_dark else PAPER)
    draw.text((x + 100, y + 6), 'HOSHILU', font=font(38), fill=PAPER if on_dark else INK)
    draw.text((x + 102, y + 52), sub, font=font(23, 'light'),
              fill=(214, 209, 240) if on_dark else MUTED)


def dots(draw, width, y, index, total, active, idle):
    span = total * 18 + (total - 1) * 14 + 22
    x = (width - span) // 2
    for i in range(1, total + 1):
        on = i == index
        draw.rounded_rectangle((x, y, x + (40 if on else 18), y + 12), radius=6,
                               fill=active if on else idle)
        x += (40 if on else 18) + 14


def render_cover(doc, item, slide, total):
    width, height = doc['size']
    seller = item['audience'] == 'seller'
    top, bottom = (NAVY, (72, 50, 152)) if seller else ((52, 32, 128), (146, 70, 188))
    img = gradient((width, height), top, bottom)
    img = glow(img, (width - 110, 210), 430, PINK if not seller else VIOLET, 120)
    img = glow(img, (70, height - 150), 380, VIOLET, 92)
    draw = ImageDraw.Draw(img)
    logo(draw, (72, 72), VIOLET if not seller else NAVY,
         'ホシル' if not seller else 'ホシル｜ショップ・セラーの方へ', on_dark=True)

    draw.text((76, 326), ' '.join(slide['kicker']), font=font(26, 'light'), fill=(236, 231, 255))
    y = draw_multiline(draw, (72, 388), slide['headline'], font(86), PAPER,
                       line_gap=1.26, max_width=width - 144)
    y += 34
    draw.rounded_rectangle((72, y, 72 + 132, y + 10), radius=5, fill=PINK)
    y += 54
    draw_multiline(draw, (72, y), slide['body'], font(37, 'light'), (223, 218, 245),
                   line_gap=1.55, max_width=width - 144)

    draw.text((72, height - 138), doc['footer'], font=font(29), fill=PAPER)
    hint = '登録は無料' if not seller else '相談フォーム送信だけでは課金されません'
    draw.text((72, height - 96), hint, font=font(24, 'light'), fill=(201, 195, 228))
    dots(draw, width, height - 56, 1, total, PAPER, (108, 94, 158))
    return img


def render_page(doc, item, slide, index, total):
    width, height = doc['size']
    seller = item['audience'] == 'seller'
    accent = NAVY if seller else VIOLET
    spot = VIOLET if seller else PINK
    img = gradient((width, height), (246, 244, 255), (255, 255, 255))
    img = glow(img, (width - 40, 110), 330, spot, 46)
    draw = ImageDraw.Draw(img)
    logo(draw, (72, 72), accent, 'ホシル' if not seller else 'ホシル｜ショップ・セラーの方へ')

    box = (72, 232, width - 72, height - 232)
    img = card_with_shadow(img, box)
    draw = ImageDraw.Draw(img)

    # カードの中で天地が偏らないように、先に高さを測ってから真ん中に置く。
    left = 128
    text_width = width - left * 2
    kicker = slide['kicker']
    head_font, body_font = font(74), font(37, 'light')
    head_lines = wrap(draw, slide['headline'], head_font, text_width)
    body_lines = wrap(draw, slide['body'], body_font, text_width)
    head_block = len(head_lines) * int(head_font.size * 1.26)
    body_block = len(body_lines) * int(body_font.size * 1.56)
    lead = 142 if kicker.isdigit() else 66
    total_block = lead + head_block + 30 + 9 + 48 + body_block
    y = box[1] + max(56, (box[3] - box[1] - total_block) // 2)

    if kicker.isdigit():
        draw.ellipse((left, y, left + 92, y + 92), fill=spot)
        number = font(48)
        draw.text((left + (92 - draw.textlength(kicker, font=number)) / 2, y + 18), kicker,
                  font=number, fill=PAPER)
    else:
        draw.text((left, y + 6), ' '.join(kicker), font=font(26, 'light'), fill=spot)
    y += lead

    for line in head_lines:
        draw.text((left, y), line, font=head_font, fill=INK)
        y += int(head_font.size * 1.26)
    y += 30
    draw.rounded_rectangle((left, y, left + 108, y + 9), radius=5, fill=spot)
    y += 48
    for line in body_lines:
        draw.text((left, y), line, font=body_font, fill=MUTED)
        y += int(body_font.size * 1.56)

    draw.text((72, height - 152), doc['footer'], font=font(29), fill=INK)
    hint = '無料・メール6桁かLINEで登録' if not seller else '相談フォーム送信だけでは課金されません'
    draw.text((72, height - 110), hint, font=font(24, 'light'), fill=FAINT)
    if index == total:
        cta = 'プロフィールのリンクから →'
        fnt = font(29)
        w = draw.textlength(cta, font=fnt)
        draw.rounded_rectangle((width - 72 - w - 60, height - 162, width - 72, height - 94),
                               radius=34, fill=accent)
        draw.text((width - 72 - w - 30, height - 144), cta, font=fnt, fill=PAPER)
    dots(draw, width, height - 56, index, total, spot, LINE)
    return img


def render_slide(doc, item, slide, index, total):
    if index == 1:
        return render_cover(doc, item, slide, total)
    return render_page(doc, item, slide, index, total)


def main():
    doc = json.loads(SOURCE.read_text(encoding='utf-8'))
    manifest = {'version': doc['version'], 'size': doc['size'], 'sets': {}}
    for item in doc['sets']:
        text = json.dumps(item, ensure_ascii=False)
        bad = FORBIDDEN.search(text)
        if bad:
            raise SystemExit(f'FORBIDDEN_CLAIM:{item["id"]}:{bad.group(0)}')
        stale = PRICING_BAN.search(text)
        if stale:
            raise SystemExit(f'ABOLISHED_PRICING:{item["id"]}:{stale.group(0)}')
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
