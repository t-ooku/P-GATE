#!/usr/bin/env python3
"""HOSHILU AI女優リール第2弾の後処理レンダラー(2026-08-18)。

Runwayが生成した生動画には、HOSHILUの画面を模した「架空のUI」が映り込み、
本文・チップ・同意文が実在しない日本語の羅列になっていた
(job: runway-hoshilu-recommend-voice-20260818-v1)。生成前のuser_conceptで
「字幕や画面内文字は生成せず、後工程で正確に追加する」と指示していたが、
モデルは参照画像を模した画面文字を生成した。

初回リール(2026-08-13)と同じ方針で、生成された画面は一切公開せず、権利・
内容を確認済みの実画面スクリーンショットへ差し替える。初回はスマホが画面
いっぱいに映っていたため矩形の全面オーバーレイで済んだが、今回はスマホが
フレーム内を移動するため、フレームごとの射影変換で貼り込む。

貼り込み位置は事前にSIFT特徴点マッチング+RANSACで推定し、時系列で
中央値フィルタ+移動平均をかけて平滑化した結果を
reel_screen_track_20260818_recommend_voice.json に固定してある。
このスクリプトは推定をやり直さず、その固定値だけを使うので、同じ入力からは
常に同じ出力が得られる(承認時に照合したSHA256を再現できる)。

指の映り込みは肌色マスクで除外し、実画面が指の上に乗らないようにする。
音声はRunwayのAACパケットをそのままコピーし、再生成しない。

使い方:
  python3 render_reel_20260818_recommend_voice.py RAW_MP4 OUTPUT_MP4
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile

import cv2
import numpy as np

# 同じ入力から常に同じバイト列を得るため、並列実行とOpenCL経路を止める。
cv2.setNumThreads(1)
try:
    cv2.ocl.setUseOpenCL(False)
except cv2.error:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
TRACK = os.path.join(HERE, 'reel_screen_track_20260818_recommend_voice.json')
SUBTITLES = os.path.join(HERE, 'reel_overlay_20260818_recommend_voice.ass')
SCREEN = os.path.join(HERE, '..', '..', 'public', 'social', 'runway', 'hoshilu-product-screen-v1.jpg')

# 推定した四隅をそのまま使うと、生成画面よりわずかに外側(ベゼル)へはみ出す。
# 実測して 1.8% 内側へ寄せると画面内に収まる。
INSET = 0.018
SOURCE_QUAD = np.float32([[0, 0], [720, 0], [720, 1280], [0, 1280]])


def inset_quad(quad, ratio):
    center = quad.mean(axis=0)
    return (quad - center) * (1 - ratio) + center


def skin_mask(frame):
    """指・手を実画面より手前に残すためのマスク。"""
    ycrcb = cv2.cvtColor(frame, cv2.COLOR_BGR2YCrCb)
    luma, cr, cb = cv2.split(ycrcb)
    mask = ((cr > 135) & (cr < 180) & (cb > 77) & (cb < 130) & (luma > 60)).astype(np.uint8) * 255
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    return mask


def physical_screen_mask(frame, quad):
    """フレーム内で実際に光っている画面の範囲。

    生成された画面は参照画像の上側だけを映しているため、参照画像の全体
    (720x1280)を四隅へ貼ると下側がスマホの外へはみ出す。推定した四隅は
    「参照画像をどう置くか」であって「画面がどこで終わるか」ではないので、
    終端はフレームから直接求める。ベゼルはほぼ黒なので、四隅の少し外側まで
    見て暗部を取り除き、中心とつながった明るい領域だけを画面とみなす。
    細い文字が消えるように暗部マスクへ開き処理をかけてから使う。
    """
    height, width = frame.shape[:2]
    region = np.zeros((height, width), np.uint8)
    cv2.fillConvexPoly(region, inset_quad(quad, -0.06).astype(np.int32), 255)
    value = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)[..., 2]
    bezel = ((value < 70).astype(np.uint8)) * 255
    bezel = cv2.morphologyEx(bezel, cv2.MORPH_OPEN, np.ones((9, 9), np.uint8))
    candidate = cv2.bitwise_and(region, cv2.bitwise_not(bezel))
    count, labels, stats, _ = cv2.connectedComponentsWithStats(candidate, 8)
    if count < 2:
        return region
    center = quad.mean(axis=0).astype(int)
    label = labels[int(np.clip(center[1], 0, height - 1)), int(np.clip(center[0], 0, width - 1))]
    if label == 0:
        label = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    mask = ((labels == label).astype(np.uint8)) * 255
    flooded = mask.copy()
    cv2.floodFill(flooded, np.zeros((height + 2, width + 2), np.uint8), (0, 0), 255)
    return cv2.bitwise_or(mask, cv2.bitwise_not(flooded))


def compose(frame, quad, screen):
    height, width = frame.shape[:2]
    target = inset_quad(quad.astype(np.float32), INSET)
    matrix = cv2.getPerspectiveTransform(SOURCE_QUAD, target)
    warped = cv2.warpPerspective(screen, matrix, (width, height),
                                 flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REPLICATE)
    mask = np.zeros((height, width), np.uint8)
    cv2.fillConvexPoly(mask, target.astype(np.int32), 255)
    mask = cv2.bitwise_and(mask, cv2.erode(physical_screen_mask(frame, quad.astype(np.float32)),
                                           np.ones((5, 5), np.uint8)))
    mask = cv2.erode(mask, np.ones((3, 3), np.uint8))
    mask = cv2.bitwise_and(mask, cv2.bitwise_not(cv2.dilate(skin_mask(frame), np.ones((5, 5), np.uint8))))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((7, 7), np.uint8))
    mask = cv2.GaussianBlur(mask, (9, 9), 0)
    alpha = (mask.astype(np.float32) / 255.0)[..., None]
    # 実画面はスクリーンショットなので、動画側の露出に合わせないと貼り込みが
    # 光って見える。貼り込む領域の明度平均を合わせるだけの補正に留める。
    solid = mask > 200
    if solid.sum() > 2000:
        original = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)[..., 0][solid].astype(np.float32)
        replacement = cv2.cvtColor(warped, cv2.COLOR_BGR2LAB)[..., 0][solid].astype(np.float32)
        gain = float(np.clip(original.mean() / max(replacement.mean(), 1e-3), 0.55, 1.25))
    else:
        gain = 1.0
    adjusted = cv2.GaussianBlur(np.clip(warped.astype(np.float32) * gain, 0, 255), (3, 3), 0.8)
    return np.clip(frame.astype(np.float32) * (1 - alpha) + adjusted * alpha, 0, 255).astype(np.uint8)


def main(argv):
    if len(argv) != 2:
        print(__doc__)
        return 64
    raw_video, output_video = argv
    for required in (raw_video, TRACK, SUBTITLES, SCREEN):
        if not os.path.isfile(required):
            print(f'Required file not found: {required}', file=sys.stderr)
            return 66
    for command in ('ffmpeg', 'ffprobe'):
        if shutil.which(command) is None:
            print(f'Required command not found: {command}', file=sys.stderr)
            return 69

    probe = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0',
                            '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', raw_video],
                           capture_output=True, text=True, check=True).stdout.strip()
    if probe != '720x1280':
        print(f'Expected a 720x1280 source, got {probe}', file=sys.stderr)
        return 65

    track = json.load(open(TRACK, encoding='utf-8'))
    low, high = int(track['lo']), int(track['hi'])
    corners = np.array(track['corners'], dtype=np.float32)
    if corners.shape != (high - low + 1, 4, 2):
        print('Tracking data does not match its declared frame range', file=sys.stderr)
        return 65
    screen = cv2.imread(SCREEN)
    if screen is None or screen.shape[:2] != (1280, 720):
        print('Approved screen capture must be a 720x1280 image', file=sys.stderr)
        return 65

    with tempfile.TemporaryDirectory() as work:
        source = os.path.join(work, 'src')
        composed = os.path.join(work, 'out')
        os.makedirs(source)
        os.makedirs(composed)
        subprocess.run(['ffmpeg', '-v', 'error', '-i', raw_video, '-vsync', '0', '-q:v', '1',
                        os.path.join(source, 'f_%04d.png')], check=True)
        names = sorted(os.listdir(source))
        replaced = 0
        for name in names:
            index = int(name[2:6])
            frame = cv2.imread(os.path.join(source, name))
            if low <= index <= high:
                frame = compose(frame, corners[index - low], screen)
                replaced += 1
            cv2.imwrite(os.path.join(composed, name), frame)
        print(f'Replaced the generated phone screen on {replaced}/{len(names)} frames')
        # 初回リール(2026-08-13)と同じく、SIMDとマルチスレッドを止めて
        # ビット単位で再現可能な符号化にする。音声はRunwayのAACをそのまま
        # コピーし、再エンコードしない。
        subprocess.run([
            'ffmpeg', '-hide_banner', '-y',
            '-cpuflags', '0', '-cpucount', '1',
            '-filter_threads', '1', '-filter_complex_threads', '1', '-threads', '1',
            '-framerate', '24', '-i', os.path.join(composed, 'f_%04d.png'),
            '-i', raw_video,
            '-filter_complex', f"[0:v]ass='{SUBTITLES}'[video]",
            '-map', '[video]', '-map', '1:a:0?',
            '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
            '-profile:v', 'high', '-level:v', '4.0', '-threads', '1',
            '-x264-params', 'asm=0:threads=1:lookahead_threads=1:sliced_threads=0',
            '-pix_fmt', 'yuv420p', '-r', '24',
            '-c:a', 'copy', '-movflags', '+faststart',
            output_video
        ], check=True)
    print(f'Rendered candidate: {output_video}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main(sys.argv[1:]))
