#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 RAW_MP4 OUTPUT_MP4" >&2
  exit 64
fi

raw_video="$1"
output_video="$2"
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(git -C "${script_dir}" rev-parse --show-toplevel)"
screen_image="${repo_root}/tools/line-worker/public/social/runway/hoshilu-product-screen-v1.jpg"
font_dir="${HOSHILU_FONT_DIR:-}"
subtitle_file="${script_dir}/initial_reel_overlay_20260813.ass"

if [[ -z "${font_dir}" ]]; then
  echo "HOSHILU_FONT_DIR is required" >&2
  exit 64
fi

for command_name in ffmpeg ffprobe; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Required command not found: ${command_name}" >&2
    exit 69
  fi
done

for required_file in \
  "${raw_video}" \
  "${screen_image}" \
  "${subtitle_file}" \
  "${font_dir}/NotoSansCJKjp-Bold.otf" \
  "${font_dir}/NotoSansCJKjp-Regular.otf"; do
  if [[ ! -f "${required_file}" ]]; then
    echo "Required file not found: ${required_file}" >&2
    exit 66
  fi
done

IFS=x read -r video_width video_height < <(
  ffprobe -v error -select_streams v:0 \
    -show_entries stream=width,height \
    -of csv=p=0:s=x "${raw_video}"
)
if [[ "${video_width}" != "720" || "${video_height}" != "1280" ]]; then
  echo "Expected a 720x1280 source, got ${video_width}x${video_height}" >&2
  exit 65
fi

mkdir -p -- "$(dirname -- "${output_video}")"

# Reproduce the exact candidate approved on 2026-08-13. The generated phone UI
# is hidden only during its close-up and replaced with the fact-checked HOSHILU
# screen. The original Runway AAC packets are copied without regeneration.
ffmpeg -hide_banner -y \
  -i "${raw_video}" \
  -loop 1 -framerate 24 -i "${screen_image}" \
  -filter_complex \
    "[1:v]scale=720:1280:flags=lanczos,setsar=1[verified_screen];[0:v][verified_screen]overlay=x=0:y=0:enable='between(t,2.20,6.75)':eof_action=pass:shortest=0[composite];[composite]ass='${subtitle_file}':fontsdir='${font_dir}'[video]" \
  -map "[video]" \
  -map 0:a:0? \
  -c:v libx264 \
  -preset medium \
  -crf 18 \
  -profile:v high \
  -level:v 4.0 \
  -pix_fmt yuv420p \
  -r 24 \
  -c:a copy \
  -movflags +faststart \
  "${output_video}"

echo "Rendered candidate: ${output_video}"
