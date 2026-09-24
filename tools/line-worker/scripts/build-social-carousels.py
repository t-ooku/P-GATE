#!/usr/bin/env python3
"""2026-09-17 大隆さん決定: カルーセル画像フィード投稿（月・水・土）。

- 入力: ops/social/carousels-v3.json（8 セット、ユーザー向け 4・セラー向け 4）
- 出力: public/social/carousel/<set_id>/<n>.jpg（1080x1350、4 枚）と
        public/social/carousel/manifest.json（sha256・枚数・監査用）
- 描画は Pillow だけ（AI 生成なし、実在商品・他社ロゴなし）。同じ入力から同じ画像が出る。
- 文言の機械検査: §33 の禁止表現、割引率・価格の断定を含む文は失敗させる。

2026-09-23 大隆さん指示「インスタ投稿したの50円書いてたから削除したよ。違うのをオシャレに作って再投稿して」:
- 2026-09-21 に廃止した Demand Match Click（1クリック50円）が seller-demand-visible に残っていた。
  PRICING_BAN で「50円」「1クリック」「クリック課金」「Demand Match Click」を機械で止める。
  料金の言い方は「4,980円/月（税込）・最初の3か月0円・クリックによる追加料金なし」だけにする。
- 同時に見た目を作り直した。中面は影のついた白いカード、下に進行ドット。
  書体は Bold（見出し）と Regular（本文）を使い分ける。どちらも ubuntu の
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
# 2026-09-24: HOSHILU の正本の色（public/styles.css の :root）。
# ボタンや見出しは pink → violet → cyan のグラデーション。表紙の見出し帯もこれに合わせる。
CYAN = (35, 184, 255)
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


# 2026-09-24 大隆さん指示「モール名なども出したり、より人間的なフィード投稿を」。
# 扱うのは Amazon・楽天市場・Yahoo!ショッピング・Qoo10 の4つ。名前だけを文字で書く
# （他社のロゴ・配色・商品写真は使わない）。
def chips(draw, xy, labels, max_width, ink, border, fill=None):
    x0, y = xy
    x = x0
    fnt = font(26, 'light')
    height = 56
    for label in labels:
        w = int(draw.textlength(label, font=fnt)) + 44
        if x > x0 and x + w > x0 + max_width:
            x, y = x0, y + height + 14
        draw.rounded_rectangle((x, y, x + w, y + height), radius=28, outline=border, width=3, fill=fill)
        draw.text((x + 22, y + 12), label, font=fnt, fill=ink)
        x += w + 14
    return y + height


def search_bar(draw, xy, text, width, ink, muted, face, border):
    """検索欄の見た目。探し方そのものを見せるための飾りで、実在の商品名は入れない。"""
    x, y = xy
    height = 92
    draw.rounded_rectangle((x, y, x + width, y + height), radius=30, fill=face, outline=border, width=3)
    cx, cy = x + 46, y + height // 2
    draw.ellipse((cx - 15, cy - 15, cx + 15, cy + 15), outline=muted, width=5)
    draw.line((cx + 11, cy + 11, cx + 24, cy + 24), fill=muted, width=5)
    draw.text((x + 88, y + 26), text, font=font(32, 'light'), fill=ink)
    return y + height


# 2026-09-24 大隆さん「もっと画像とかロゴまたはモールのロゴに近しい感じで作成できない？」への答え。
# 他社のロゴ・ロゴに似せた意匠・商品写真は使わない（商標の問題に加えて、楽天アフィリエイトは
# 公式バナーでも「画像の上に文字を載せる／切り取る」ことを禁じており、スクショ利用も禁止）。
# 代わりに HOSHILU 自身の画面を図形で描く。並ぶのは実在しない見本で、値段は数字を書かず棒で表す
# （商品名・価格を作らない、という自分たちの決まりを守るため）。モール名だけは文字で入る。
def result_panel(draw, xy, width, results, ink, muted, face, border, spot):
    x, y = xy
    rows = results.get('rows', [])
    height = 150 + len(rows) * 150
    draw.rounded_rectangle((x, y, x + width, y + height), radius=34, fill=PAPER, outline=border, width=3)
    search_bar(draw, (x + 26, y + 26), results.get('query', ''), width - 52, ink, muted, face, border)
    top = y + 146
    for index, row in enumerate(rows):
        tint = [(236, 232, 252), (252, 234, 243), (234, 244, 252)][index % 3]
        mark = [(206, 197, 246), (247, 202, 224), (198, 224, 247)][index % 3]
        draw.rounded_rectangle((x + 30, top, x + 30 + 118, top + 118), radius=22, fill=tint)
        cx, cy = x + 30 + 59, top + 59
        if index % 3 == 0:
            draw.ellipse((cx - 34, cy - 34, cx + 34, cy + 34), fill=mark)
        elif index % 3 == 1:
            draw.rounded_rectangle((cx - 32, cy - 36, cx + 32, cy + 36), radius=14, fill=mark)
        else:
            draw.polygon([(cx, cy - 36), (cx + 36, cy + 30), (cx - 36, cy + 30)], fill=mark)
        text_x = x + 176
        text_w = width - (text_x - x) - 40
        draw.rounded_rectangle((text_x, top + 10, text_x + text_w, top + 28), radius=9, fill=(233, 231, 242))
        draw.rounded_rectangle((text_x, top + 40, text_x + int(text_w * 0.62), top + 58), radius=9, fill=(240, 238, 247))
        draw.rounded_rectangle((text_x, top + 80, text_x + 112, top + 104), radius=12, fill=(214, 210, 232))
        label = row.get('mall', '')
        fnt = font(22, 'light')
        label_w = int(draw.textlength(label, font=fnt)) + 30
        draw.rounded_rectangle((text_x + text_w - label_w, top + 74, text_x + text_w, top + 110),
                               radius=18, outline=spot, width=2)
        draw.text((text_x + text_w - label_w + 15, top + 80), label, font=fnt, fill=spot)
        top += 150
    return y + height


# 2026-09-24 大隆さん「先程送ったインフルエンサーのサムネと君が作成した画像を見比べた？全然ダメ」。
# 比べると、向こうは写真が画面いっぱいで、文字はその上に重ねてある。こちらは余白の多い
# 資料のような絵だった。表紙は HOSHILU が持っている自前の画像（public/social/ 等）を全面に敷き、
# 大きな文字を重ねる形にする。他社のロゴ・商品写真は使わないまま、密度だけを上げる。
def cover_art(path, size):
    art = Image.open(ROOT / 'public' / path).convert('RGB')
    width, height = size
    scale = max(width / art.width, height / art.height)
    art = art.resize((max(width, int(art.width * scale)), max(height, int(art.height * scale))),
                     Image.LANCZOS)
    left = (art.width - width) // 2
    top = int((art.height - height) * 0.42)
    return art.crop((left, top, left + width, top + height))


def scrim(img, top_alpha=160, bottom_alpha=248):
    """文字を読ませるための暗い膜。上を少し、下半分をしっかり暗くする。
    写真の上に見出しの帯と本文を置くので、ここが薄いと全体が没する。"""
    width, height = img.size
    layer = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    for y in range(height):
        t = y / max(1, height - 1)
        top = top_alpha * max(0.0, 1 - t * 4.0)
        bottom = bottom_alpha * max(0.0, (t - 0.22) / 0.78) ** 1.05
        draw.line(((0, y), (width, y)), fill=(12, 8, 26, int(min(250, top + bottom))))
    return Image.alpha_composite(img.convert('RGBA'), layer).convert('RGB')


# 2026-09-24 大隆さん「キャッチがもっとホシルのポートレートカラーで。文字の枠線があるのはダサい」。
# 白フチをやめ、見出しは HOSHILU の色の帯（pink → violet → cyan）の上に白抜きで置く。
# 帯は文字の幅ぴったりに作るので、行ごとに長さが変わって雑誌の見出しのように見える。
def brand_colour(t):
    t = min(1.0, max(0.0, t))
    return mix(PINK, VIOLET, t / 0.62) if t <= 0.62 else mix(VIOLET, CYAN, (t - 0.62) / 0.38)


def brand_band(img, box, radius=20, span=None):
    """見出しの帯。色は帯の中の位置ではなく**画面の左端からの位置**で決める。
    2026-09-24 大隆さん「キャッチコピーの背景の色がズレてるよ」: 行ごとに 0→1 で
    引いていたため、短い行も長い行も左端がピンク・右端がシアンになり、上下の行で
    同じ x なのに色が違っていた。1枚の大きなグラデーションから切り出す形に直す。"""
    x0, y0, x1, y1 = box
    width, height = max(1, x1 - x0), max(1, y1 - y0)
    reference = max(1, span or img.size[0])
    band = Image.new('RGB', (width, height))
    draw = ImageDraw.Draw(band)
    for x in range(width):
        draw.line(((x, 0), (x, height)), fill=brand_colour((x0 + x) / reference))
    mask = Image.new('L', (width, height), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, width - 1, height - 1), radius=radius, fill=255)
    img.paste(band, (x0, y0), mask)
    return img


def gradient_text(img, xy, text, fnt, span, start_x=None):
    """文字そのものを HOSHILU の色で塗る。帯で囲うより軽く、見出しが写真から浮く。
    色は画面の左端からの位置で決めるので、行が変わっても同じ x は同じ色になる。"""
    x, y = xy
    mask = Image.new('L', img.size, 0)
    ImageDraw.Draw(mask).text((x, y), text, font=fnt, fill=255)
    paint = Image.new('RGB', img.size)
    draw = ImageDraw.Draw(paint)
    base = start_x if start_x is not None else 0
    for column in range(img.size[0]):
        draw.line(((column, 0), (column, img.size[1])), fill=brand_colour((column - base) / max(1, span)))
    img.paste(paint, (0, 0), mask)
    return img


def text_shadow(img, lines, fnt, origin, line_step, blur=16, alpha=185):
    """白い文字を写真の上で読ませるための、やわらかい影。枠線は使わない。"""
    mask = Image.new('L', img.size, 0)
    draw = ImageDraw.Draw(mask)
    x, y = origin
    for line in lines:
        draw.text((x, y + 6), line, font=fnt, fill=alpha)
        y += line_step
    mask = mask.filter(ImageFilter.GaussianBlur(blur))
    shade = Image.new('RGBA', img.size, (10, 6, 26, 0))
    shade.putalpha(mask)
    return Image.alpha_composite(img.convert('RGBA'), shade).convert('RGB')


def marker(draw, box, colour=(255, 214, 64), radius=7):
    """手で引いた線のような下線。参考にしたバナーの黄色い線と同じ役割。"""
    draw.rounded_rectangle(box, radius=radius, fill=colour)


def pill(draw, xy, text, fnt, face, ink, pad=26, height=62):
    x, y = xy
    w = int(draw.textlength(text, font=fnt)) + pad * 2
    draw.rounded_rectangle((x, y, x + w, y + height), radius=height // 2, fill=face)
    draw.text((x + pad, y + (height - fnt.size) // 2 - 4), text, font=fnt, fill=ink)
    return x + w


def render_art_cover(doc, item, slide, total):
    width, height = doc['size']
    seller = item['audience'] == 'seller'
    img = scrim(cover_art(slide['art'], (width, height)))
    draw = ImageDraw.Draw(img)

    # ロゴは小さく上に。主役は写真と見出し。
    draw.rounded_rectangle((60, 56, 60 + 66, 56 + 66), radius=20, fill=PAPER)
    draw.text((78, 64), 'H', font=font(40), fill=VIOLET if not seller else NAVY)
    draw.text((142, 60), 'HOSHILU', font=font(34), fill=PAPER)
    draw.text((144, 100), 'ホシル' if not seller else 'ホシル｜ショップ・セラーの方へ',
              font=font(21, 'light'), fill=(226, 222, 245))

    head_font = font(94)
    head_lines = wrap(draw, slide['headline'], head_font, width - 120)
    body_font = font(34, 'light')
    body_lines = wrap(draw, slide['body'], body_font, width - 120)
    chips_list = slide.get('chips') or []
    chip_font = font(25, 'light')
    block = 84 + len(head_lines) * int(head_font.size * 1.18) + 26 + len(body_lines) * int(body_font.size * 1.5)
    if chips_list:
        block += 96
    y = height - 176 - block

    kicker = ' '.join(slide['kicker'])
    pill(draw, (60, y), kicker, font(24, 'light'), PINK if not seller else VIOLET, PAPER, 24, 56)
    y += 84
    # 2026-09-24: 色帯をやめ、文字そのものを塗る。参考にもらったバナーと同じ考え方で、
    # 一番言いたい行だけ HOSHILU の色にして、その下に黄色い線を引く。残りは白。
    # 読ませるための黒は、枠線ではなくやわらかい影で作る。
    spans = [int(draw.textlength(line, font=head_font)) for line in head_lines]
    reference = max(spans) if spans else 1
    line_step = int(head_font.size * 1.16)
    accent = slide.get('accent_line', len(head_lines) - 1)
    # 影は2回かけて、明るい写真の上でも白と色が沈まないようにする。
    img = text_shadow(img, head_lines, head_font, (60, y), line_step, blur=30, alpha=210)
    img = text_shadow(img, head_lines, head_font, (60, y), line_step, blur=12, alpha=170)
    draw = ImageDraw.Draw(img)
    for index, (line, span) in enumerate(zip(head_lines, spans)):
        if index == accent:
            # 黄色い線は文字の下。先に引いて、その上に文字を置く。
            base = y + int(head_font.size * 1.00)
            marker(draw, (56, base, 60 + span + 14, base + 18))
            img = gradient_text(img, (60, y), line, head_font, reference, start_x=60)
            draw = ImageDraw.Draw(img)
        else:
            draw.text((60, y), line, font=head_font, fill=PAPER)
        y += line_step
    y += 14
    y += 26
    for line in body_lines:
        draw.text((62, y), line, font=body_font, fill=(232, 228, 248))
        y += int(body_font.size * 1.5)
    if chips_list:
        y += 30
        x = 60
        for label in chips_list:
            w = int(draw.textlength(label, font=chip_font)) + 48
            if x + w > width - 60:
                break
            pill(draw, (x, y), label, chip_font, (255, 255, 255), (26, 22, 51), 24, 60)
            x += w + 12

    draw.text((60, height - 118), doc['footer'], font=font(28), fill=PAPER)
    hint = '登録は無料' if not seller else '相談フォーム送信だけでは課金されません'
    draw.text((60, height - 80), hint, font=font(23, 'light'), fill=(206, 200, 232))
    dots(draw, width, height - 44, 1, total, PAPER, (120, 108, 164))
    return img


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

    kicker_font = font(26, 'light')
    kicker = ' '.join(slide['kicker'])
    kicker_width = int(draw.textlength(kicker, font=kicker_font)) + 48
    draw.rounded_rectangle((72, 312, 72 + kicker_width, 312 + 58), radius=29,
                           fill=PINK if not seller else VIOLET)
    draw.text((96, 324), kicker, font=kicker_font, fill=PAPER)

    # 見出しの1行目にマーカーを引く。雑誌の見出しのように、最初のひと言を目に入れるため。
    head_font = font(86)
    head_lines = wrap(draw, slide['headline'], head_font, width - 144)
    y = 406
    for position, line in enumerate(head_lines):
        if position == 0 and line:
            mark = int(draw.textlength(line, font=head_font))
            draw.rounded_rectangle((66, y + 58, 66 + mark + 16, y + 100), radius=8,
                                   fill=(255, 79, 154, 255) if not seller else (115, 87, 255))
        draw.text((72, y), line, font=head_font, fill=PAPER)
        y += int(head_font.size * 1.26)
    y += 30
    y = draw_multiline(draw, (72, y), slide['body'], font(37, 'light'), (223, 218, 245),
                       line_gap=1.55, max_width=width - 144)
    if slide.get('chips'):
        chips(draw, (72, y + 44), slide['chips'], width - 144, PAPER, (255, 255, 255))

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

    # 画面の絵を載せる面は、文章を詰めると入らない。見出し1行と絵だけにする。
    if slide.get('results'):
        left = 128
        panel_width = width - left * 2
        panel_height = 150 + len(slide['results'].get('rows', [])) * 150
        head_font = font(58)
        head_lines = wrap(draw, slide['headline'].replace('\n', ' '), head_font, panel_width)
        block = 116 + len(head_lines) * int(head_font.size * 1.24) + 30 + panel_height
        y = box[1] + max(48, (box[3] - box[1] - block) // 2)
        kicker = slide['kicker']
        if kicker.isdigit():
            draw.ellipse((left, y, left + 84, y + 84), fill=spot)
            number = font(44)
            draw.text((left + (84 - draw.textlength(kicker, font=number)) / 2, y + 16), kicker,
                      font=number, fill=PAPER)
        y += 116
        for line in head_lines:
            draw.text((left, y), line, font=head_font, fill=INK)
            y += int(head_font.size * 1.24)
        y += 30
        result_panel(draw, (left, y), panel_width, slide['results'], INK, FAINT,
                     (247, 245, 255), LINE, spot)
        draw.text((72, height - 152), doc['footer'], font=font(29), fill=INK)
        hint = '無料・メール6桁かLINEで登録' if not seller else '相談フォーム送信だけでは課金されません'
        draw.text((72, height - 110), hint, font=font(24, 'light'), fill=FAINT)
        dots(draw, width, height - 56, index, total, spot, LINE)
        return img

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
    extra = (106 if slide.get('search') else 0) + (70 if slide.get('chips') else 0)
    total_block = lead + head_block + 30 + 9 + 48 + body_block + extra
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
    if slide.get('search'):
        y = search_bar(draw, (left, y + 14), slide['search'], text_width, INK, FAINT,
                       (247, 245, 255), LINE) + 0
    if slide.get('chips'):
        y = chips(draw, (left, y + 20), slide['chips'], text_width, MUTED, LINE)

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
        if slide.get('art'):
            return render_art_cover(doc, item, slide, total)
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
