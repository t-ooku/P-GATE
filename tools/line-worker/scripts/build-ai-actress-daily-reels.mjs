import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const workerRoot = resolve(scriptDir, '..');
const outputDir = resolve(workerRoot, 'public/social');
const portrait = resolve(outputDir, 'runway/hoshilu-approved-model-reference-v2.jpg');
const musicSource = resolve(outputDir, 'hoshilu-reel-9malls-pop-v1.mp4');
const font = resolve(process.argv[2] || '');
// @fontsource/noto-sans-jp@5.3.0 japanese-800-normal converted from WOFF to
// TTF. Pinning the rendered font bytes keeps the seven reviewed MP4 hashes
// reproducible instead of accepting a visually different system font.
const EXPECTED_FONT_SHA256 = '10fa067aec79348367ce2036d0f304d7e188b54b80d03b712d73a53dc88eb6f6';

if (!font || !existsSync(font)) {
  throw new Error('Usage: node build-ai-actress-daily-reels.mjs /absolute/path/to/japanese-font.ttf');
}
const fontSha256 = createHash('sha256').update(readFileSync(font)).digest('hex');
if (fontSha256 !== EXPECTED_FONT_SHA256) throw new Error(`FONT_SHA256_MISMATCH:${fontSha256}`);
if (!existsSync(portrait) || !existsSync(musicSource)) throw new Error('SOURCE_ASSET_MISSING');
mkdirSync(outputDir, { recursive: true });

const creatives = [
  {
    day: 'mon', middle: 'instagram-ambiguous-four-market-v1.png',
    headline: '名前が分からなくても、大丈夫。',
    headlineSize: 44,
    lead: '覚えている特徴から探してみよ。',
    middleTitle: '見た場所・色・形・使い方', middleSub: 'そのままHOSHILUへ',
    outro: '今日も、私が一緒に探すね。', color: '0x5524d8', accent: '0x58d7ff'
  },
  {
    day: 'tue', middle: 'instagram-youth-cross-market-v1.png',
    headline: '韓国っぽい、あれ何だっけ？',
    lead: '名前を知らなくても探せるよ。',
    middleTitle: 'Qoo10・SHEINも横断', middleSub: '気になるものを見つけよう',
    outro: 'HOSHILU BUZZも見てみてね。', color: '0xe72f91', accent: '0x8d5bff'
  },
  {
    day: 'wed', middle: 'hoshilu-buzz-ranking-v1.jpg',
    headline: '今日のバズ、もう見た？',
    lead: '気になるものを、すぐチェック。',
    middleTitle: 'HOSHILU BUZZ', middleSub: 'ランキングから見つけよう',
    outro: '今日も、私が案内するね。', color: '0x6d31e8', accent: '0xff3a9a'
  },
  {
    day: 'thu', middle: 'instagram-ambiguous-four-market-v1.png',
    headline: '見つけたら、モールを比較。',
    lead: '同じ検索語で見比べられるよ。',
    middleTitle: '最大13モールへ', middleSub: '購入先を自分でチェック',
    outro: '迷ったら、また私に聞いてね。', color: '0x1769d2', accent: '0x56e2ff'
  },
  {
    day: 'fri', middle: 'hoshilu-buzz-ranking-v1.jpg',
    headline: '金曜のバズ、チェックしよ。',
    lead: '次に欲しいもの、見つかるかも。',
    middleTitle: 'HOSHILU BUZZ', middleSub: '気になるランキングを確認',
    outro: '週末も、私が案内するね。', color: '0xef2b8d', accent: '0x6848ff'
  },
  {
    day: 'sat', middle: 'hoshilu-buzz-ranking-v1.jpg',
    headline: '今日のバズ、もう見た？',
    lead: '気になるものを、すぐチェック。',
    middleTitle: 'HOSHILU BUZZ', middleSub: '気になるランキングを見にいこう',
    outro: '明日も、私が案内するね。', color: '0x5f27d7', accent: '0xff2f92'
  },
  {
    day: 'sun', middle: 'instagram-youth-cross-market-v1.png',
    headline: '日曜は、次に欲しいもの探そ。',
    lead: 'ランキングからでも大丈夫。',
    middleTitle: 'HOSHILU BUZZ', middleSub: '韓国トレンドも横断検索へ',
    outro: '来週も、毎日ここで会おうね。', color: '0x087f99', accent: '0x45e0d0'
  }
];

function drawtext(value) {
  return String(value)
    .replaceAll('\\', '\\\\')
    .replaceAll("'", "\\'")
    .replaceAll(':', '\\:')
    .replaceAll('%', '\\%');
}

for (const creative of creatives) {
  const middle = resolve(outputDir, creative.middle);
  if (!existsSync(middle)) throw new Error(`MIDDLE_ASSET_MISSING:${creative.middle}`);
  const output = resolve(outputDir, `hoshilu-ai-actress-daily-${creative.day}-v1.mp4`);
  const filter = [
    `[0:v]scale=800:1422,zoompan=z='min(zoom+0.0007,1.055)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=90:s=720x1280:fps=30,trim=duration=3,setpts=PTS-STARTPTS,setsar=1,eq=saturation=1.05:contrast=1.02,drawbox=x=0:y=0:w=720:h=245:color=${creative.color}@0.62:t=fill,drawbox=x=0:y=1045:w=720:h=235:color=${creative.color}@0.64:t=fill,drawtext=fontfile=${font}:text='HOSHILU':fontcolor=white:fontsize=46:x=52:y=54:shadowcolor=black@0.45:shadowx=3:shadowy=3,drawtext=fontfile=${font}:text='${drawtext(creative.headline)}':fontcolor=white:fontsize=${creative.headlineSize || 50}:x=(w-text_w)/2:y=136:borderw=2:bordercolor=${creative.accent}@0.9,drawtext=fontfile=${font}:text='${drawtext(creative.lead)}':fontcolor=white:fontsize=34:x=(w-text_w)/2:y=1103:shadowcolor=black@0.6:shadowx=2:shadowy=2,fade=t=out:st=2.72:d=0.28[v0]`,
    `[1:v]scale=720:1060:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:color=0xf8eefe,setsar=1,fps=30,trim=duration=3,setpts=PTS-STARTPTS,drawbox=x=0:y=1050:w=720:h=230:color=${creative.color}@0.88:t=fill,drawtext=fontfile=${font}:text='${drawtext(creative.middleTitle)}':fontcolor=white:fontsize=50:x=(w-text_w)/2:y=1080,drawtext=fontfile=${font}:text='${drawtext(creative.middleSub)}':fontcolor=white:fontsize=31:x=(w-text_w)/2:y=1164,fade=t=in:st=0:d=0.20,fade=t=out:st=2.72:d=0.28[v1]`,
    `[2:v]scale=800:1422,zoompan=z='1.045':x='(iw-iw/zoom)/2+8*sin(on/20)':y='(ih-ih/zoom)/2':d=90:s=720x1280:fps=30,trim=duration=3,setpts=PTS-STARTPTS,setsar=1,eq=saturation=1.05:contrast=1.02,drawbox=x=0:y=0:w=720:h=250:color=${creative.color}@0.62:t=fill,drawbox=x=0:y=1000:w=720:h=280:color=${creative.color}@0.72:t=fill,drawtext=fontfile=${font}:text='${drawtext(creative.outro)}':fontcolor=white:fontsize=49:x=(w-text_w)/2:y=126:borderw=2:bordercolor=${creative.accent}@0.9,drawtext=fontfile=${font}:text='HOSHILU':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=1044,drawtext=fontfile=${font}:text='hoshilu.app':fontcolor=white:fontsize=38:x=(w-text_w)/2:y=1133:shadowcolor=black@0.8:shadowx=3:shadowy=3,fade=t=in:st=0:d=0.20,fade=t=out:st=2.78:d=0.22[v2]`,
    '[v0][v1][v2]concat=n=3:v=1:a=0,format=yuv420p[v]',
    '[3:a]atrim=start=0:end=9,asetpts=PTS-STARTPTS,volume=0.9,afade=t=in:st=0:d=0.20,afade=t=out:st=8.5:d=0.5[a]'
  ].join(';');
  const result = spawnSync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-loop', '1', '-t', '3', '-i', portrait,
    '-loop', '1', '-t', '3', '-i', middle,
    '-loop', '1', '-t', '3', '-i', portrait,
    '-i', musicSource,
    '-filter_complex', filter,
    '-map', '[v]', '-map', '[a]', '-r', '30',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-profile:v', 'high', '-level', '4.0',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', '-shortest',
    output
  ], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`FFMPEG_FAILED:${creative.day}`);
  console.log(output);
}
