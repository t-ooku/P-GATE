#!/usr/bin/env python3
"""2026-09-04 大隆さん指示: 希望価格ウォッチ推しのリール（AI女優 v1）を作る。

- 素材: public/social/runway/hoshilu-approved-model-reference-v1.jpg（承認済み v1）、
  public/social/hoshilu-reel-9malls-pop-v1.mp4（既存の音源）。Runway 課金なし（ffmpeg のみ）。
- 中央のカードは Pillow で描く（実画面のスクショではなく、機能を説明する図）。
- 出力: public/social/hoshilu-ai-actress-watch-v1.mp4（720x1280, 9秒, 30fps）

使い方: python3 scripts/build-watch-reel.py /path/to/NotoSansCJK.ttc
"""
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SOCIAL = ROOT / 'public' / 'social'
PORTRAIT = SOCIAL / 'runway' / 'hoshilu-approved-model-reference-v1.jpg'
MUSIC = SOCIAL / 'hoshilu-reel-9malls-pop-v1.mp4'
OUTPUT = SOCIAL / 'hoshilu-ai-actress-watch-v1.mp4'
CARD = Path('/tmp/hoshilu-watch-card.png')
FONT = Path(sys.argv[1] if len(sys.argv) > 1 else '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc')

if not FONT.exists():
    raise SystemExit(f'FONT_MISSING:{FONT}')
if not PORTRAIT.exists() or not MUSIC.exists():
    raise SystemExit('SOURCE_ASSET_MISSING')


def font(size):
    return ImageFont.truetype(str(FONT), size)


def rounded(draw, box, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def build_card():
    w, h = 720, 1280
    im = Image.new('RGB', (w, h), (255, 248, 240))
    d = ImageDraw.Draw(im)
    # 背景の柔らかい帯
    d.rectangle((0, 0, w, 150), fill=(255, 236, 214))
    d.text((w // 2, 78), '欲しいもの、まとめて探す。', font=font(34), fill=(120, 70, 20), anchor='mm')

    # 商品カード
    rounded(d, (50, 190, 670, 760), 28, (255, 255, 255), outline=(230, 220, 205), width=2)
    rounded(d, (80, 220, 300, 440), 20, (236, 244, 250))
    # 水筒の簡易イラスト（絵文字はフォントに無いので図形で描く）
    d.rounded_rectangle((155, 255, 225, 410), radius=22, fill=(90, 130, 170))
    d.rounded_rectangle((165, 240, 215, 268), radius=8, fill=(60, 90, 120))
    d.rounded_rectangle((170, 300, 210, 380), radius=10, fill=(150, 190, 220))
    d.text((330, 250), 'NO.1', font=font(26), fill=(230, 100, 30))
    d.text((330, 292), 'ステンレス水筒 1L', font=font(34), fill=(40, 40, 40))
    d.text((330, 340), '真空断熱・食洗機OK', font=font(24), fill=(110, 110, 110))
    d.text((330, 392), '現在価格', font=font(22), fill=(120, 120, 120))
    d.text((330, 420), '¥3,980', font=font(46), fill=(40, 40, 40))

    d.text((80, 480), '希望価格', font=font(26), fill=(120, 120, 120))
    rounded(d, (80, 518, 640, 596), 18, (255, 250, 244), outline=(255, 170, 90), width=3)
    d.text((110, 557), '¥2,980', font=font(44), fill=(220, 90, 20), anchor='lm')
    d.text((610, 557), '円になったら', font=font(24), fill=(150, 110, 80), anchor='rm')

    rounded(d, (80, 630, 640, 720), 24, (255, 122, 40))
    d.text((335, 675), 'この価格になったら教えて', font=font(34), fill=(255, 255, 255), anchor='mm')
    # チェックボックス
    d.rounded_rectangle((560, 655, 600, 695), radius=8, fill=(255, 255, 255))
    d.line((568, 676, 578, 687, 594, 662), fill=(255, 122, 40), width=6)

    # 通知バブル（後半で表示）
    rounded(d, (60, 820, 660, 1000), 28, (255, 255, 255), outline=(255, 170, 90), width=3)
    d.ellipse((90, 860, 160, 930), fill=(255, 122, 40))
    d.text((125, 895), '!', font=font(46), fill=(255, 255, 255), anchor='mm')
    d.text((190, 870), 'HOSHILU からのお知らせ', font=font(24), fill=(150, 110, 80))
    d.text((190, 910), '¥2,980 になりました', font=font(40), fill=(40, 40, 40))
    d.text((190, 962), 'Amazon・楽天・Qoo10 の価格を定期確認', font=font(22), fill=(120, 120, 120))

    d.text((w // 2, 1080), '今すぐ買わないものは、入れておくだけ。', font=font(30), fill=(90, 60, 30), anchor='mm')
    d.text((w // 2, 1140), 'hoshilu.app', font=font(34), fill=(255, 122, 40), anchor='mm')
    im.save(CARD)


def esc(value):
    return (value.replace('\\', '\\\\').replace("'", "\\'").replace(':', '\\:').replace('%', '\\%'))


def text(msg, y, size, color='white', start=0.0, box=True):
    base = (f"drawtext=fontfile='{FONT}':text='{esc(msg)}':fontsize={size}:fontcolor={color}"
            f":x=(w-text_w)/2:y={y}:enable='gte(t,{start})'")
    if box:
        base += ':box=1:boxcolor=0x1a1a2e@0.62:boxborderw=22'
    return base


def main():
    build_card()
    scene1 = (
        "[0:v]scale=800:1422,zoompan=z='min(zoom+0.0007,1.055)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=90:s=720x1280:fps=30,"
        "trim=duration=3,setpts=PTS-STARTPTS,setsar=1,"
        + text('今すぐ買わなくて、いい。', 150, 52) + ','
        + text('希望価格になったら、教えるね。', 1040, 40, start=0.6) + '[v0]'
    )
    scene2 = (
        "[1:v]scale=720:1280,setsar=1,fps=30,trim=duration=3.4,setpts=PTS-STARTPTS,"
        # 通知バブルを 1.4 秒後に「出す」ため、それまで同色の板で隠す
        "drawbox=x=50:y=810:w=620:h=200:color=0xfff8f0:t=fill:enable='lt(t,1.4)'[v1]"
    )
    scene3 = (
        "[2:v]scale=800:1422,zoompan=z='1.045':x='(iw-iw/zoom)/2+8*sin(on/20)':y='(ih-ih/zoom)/2':d=90:s=720x1280:fps=30,"
        "trim=duration=2.6,setpts=PTS-STARTPTS,setsar=1,"
        + text('Amazon・楽天・Qoo10を見張るのは', 130, 40) + ','
        + text('私に任せて。', 200, 52, start=0.4) + ','
        + text('HOSHILU ｜ 欲しいもの、まとめて探す。', 1060, 32, start=0.2) + '[v2]'
    )
    filt = ';'.join([
        scene1, scene2, scene3,
        '[v0][v1][v2]concat=n=3:v=1:a=0,format=yuv420p[v]',
        '[3:a]atrim=start=0:end=9,asetpts=PTS-STARTPTS,volume=0.9,afade=t=in:st=0:d=0.20,afade=t=out:st=8.5:d=0.5[a]'
    ])
    cmd = [
        'ffmpeg', '-y', '-hide_banner', '-loglevel', 'error',
        '-loop', '1', '-t', '3', '-i', str(PORTRAIT),
        '-loop', '1', '-t', '3.4', '-i', str(CARD),
        '-loop', '1', '-t', '2.6', '-i', str(PORTRAIT),
        '-i', str(MUSIC),
        '-filter_complex', filt,
        '-map', '[v]', '-map', '[a]', '-r', '30',
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-profile:v', 'high', '-level', '4.0',
        '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-movflags', '+faststart', '-shortest',
        str(OUTPUT)
    ]
    subprocess.run(cmd, check=True)
    print(OUTPUT)


if __name__ == '__main__':
    main()
