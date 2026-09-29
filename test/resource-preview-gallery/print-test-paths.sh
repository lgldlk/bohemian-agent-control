#!/usr/bin/env bash
set -euo pipefail

ROOT="test/resource-preview-gallery"

printf '%s\n' \
  "Markdown gallery: $ROOT/README.md" \
  "TSX focused range: $ROOT/code/ExamplePanel.tsx:12-26" \
  "TSX range with columns: $ROOT/code/ExamplePanel.tsx:15:3-26:8" \
  "GitHub style range: $ROOT/code/ExamplePanel.tsx#L28-L39" \
  "TypeScript: $ROOT/code/example.ts" \
  "Python: $ROOT/code/example.py" \
  "CSS: $ROOT/code/styles.css" \
  "JSON: $ROOT/data/sample.json" \
  "YAML: $ROOT/data/config.yaml" \
  "CSV: $ROOT/data/people.csv" \
  "HTML source: $ROOT/docs/sample.html" \
  "Plain text: $ROOT/docs/notes.txt" \
  "Log file: $ROOT/docs/sample.log" \
  "PNG: $ROOT/assets/clipboard-preview.png" \
  "PNG with spaces: $ROOT/assets/preview with spaces.png" \
  "SVG: $ROOT/assets/resource-preview.svg" \
  "PDF: $ROOT/docs/sample.pdf" \
  "Audio: $ROOT/media/test-tone.wav" \
  "Video: $ROOT/media/test-video.mp4" \
  "Binary: $ROOT/binary/sample.bin" \
  "Directory: $ROOT/assets"
