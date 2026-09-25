#!/usr/bin/env bash
# Encode the finished 1920x1080 PNG frames into every deliverable.
#   encode.sh FRAMES_DIR OUT_DIR NAME
# Colour: RGB -> BT.709 limited range, explicitly (swscale defaults to BT.601),
# and every stream is tagged so browsers decode with the same matrix. That is
# what lets the frame edge land on exactly rgb(243,244,251).
set -euo pipefail
SRC=$1; OUT=$2; NAME=$3
mkdir -p "$OUT"
FPS=30
TAGS="-colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv"
CONV="accurate_rnd+full_chroma_int+full_chroma_inp"

# 1. FHD master — 1920x1080, visually lossless
ffmpeg -v error -y -framerate $FPS -i "$SRC/f%04d.png" \
  -vf "scale=1920:1080:flags=lanczos+$CONV:out_color_matrix=bt709:out_range=tv,format=yuv420p" \
  -c:v libx264 -preset veryslow -crf 14 -profile:v high -tune film \
  $TAGS -movflags +faststart -an "$OUT/$NAME-fhd.mp4"

# 2. site cut — the slot is 55.82% tall (1440x804): trim 4px top/bottom, then scale
SITE_VF="crop=1920:1072:0:4,scale=1440:804:flags=lanczos+$CONV:out_color_matrix=bt709:out_range=tv,format=yuv420p"
ffmpeg -v error -y -framerate $FPS -i "$SRC/f%04d.png" -vf "$SITE_VF" \
  -c:v libx264 -preset veryslow -crf ${SITE_CRF:-24} -profile:v high -tune film \
  -x264-params "aq-mode=3:aq-strength=0.9:keyint=180:min-keyint=180" \
  $TAGS -movflags +faststart -an "$OUT/$NAME.mp4"

ffmpeg -v error -y -framerate $FPS -i "$SRC/f%04d.png" -vf "$SITE_VF" \
  -c:v libvpx-vp9 -b:v 0 -crf ${VP9_CRF:-32} -row-mt 1 -tile-columns 1 -deadline good -cpu-used 1 \
  -g 180 -pass 1 $TAGS -an -f null /dev/null
ffmpeg -v error -y -framerate $FPS -i "$SRC/f%04d.png" -vf "$SITE_VF" \
  -c:v libvpx-vp9 -b:v 0 -crf ${VP9_CRF:-32} -row-mt 1 -tile-columns 1 -deadline good -cpu-used 1 \
  -g 180 -pass 2 $TAGS -an "$OUT/$NAME.webm"
rm -f ffmpeg2pass-0.log

# 3. poster = frame 0 of the site cut, so the swap to video is invisible.
#    PIL rather than ffmpeg's mjpeg: its edge lands a uniform 1 level off in G
#    (the JPEG colour lattice has no exact point for #f3f4fb) instead of +-1 noise.
"${PY:-python3}" - "$SRC/f0000.png" "$OUT/$NAME-poster.jpg" <<'PY'
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert("RGB").crop((0, 4, 1920, 1076)).resize((1440, 804), Image.LANCZOS)
im.save(sys.argv[2], "JPEG", quality=85, subsampling=2, optimize=True, progressive=True)
PY
ls -la "$OUT"
