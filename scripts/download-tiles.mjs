#!/usr/bin/env node
/**
 * Download and resize NASA Blue Marble (day) and Black Marble (night) tiles.
 * 8 tiles each, 21600×21600, resized to 8192×8192 JPEG.
 *
 * Usage: node scripts/download-tiles.mjs
 * Requires: sharp (npm install --save-dev sharp)
 */

import { existsSync, mkdirSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, '..', 'public', 'textures', 'tiles')
const TILE_SIZE = 8192
const JPEG_QUALITY = 90

const TILES = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1', 'D2']

const SETS = [
  {
    name: 'Blue Marble (day)',
    prefix: 'blue_marble',
    getUrl: (tile) => `https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-base/january/world.200401.3x21600x21600.${tile}.jpg`,
  },
  {
    name: 'Black Marble (night)',
    prefix: 'black_marble',
    getUrl: (tile) => `https://assets.science.nasa.gov/content/dam/science/esd/eo/images/imagerecords/144000/144898/BlackMarble_2016_${tile}.jpg`,
  },
]

async function downloadAndResize(tile, set) {
  const outPath = path.join(OUT_DIR, `${set.prefix}_${tile}.jpg`)

  if (existsSync(outPath)) {
    console.log(`  [skip] ${tile} already exists`)
    return
  }

  const url = set.getUrl(tile)
  console.log(`  [download] ${tile} from ${url}`)

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download ${tile}: ${response.status} ${response.statusText}`)
  }

  const contentLength = response.headers.get('content-length')
  const sizeMB = contentLength ? (parseInt(contentLength) / 1024 / 1024).toFixed(1) : '?'
  console.log(`  [download] ${tile}: ${sizeMB} MB`)

  const sharp = (await import('sharp')).default

  const buffer = Buffer.from(await response.arrayBuffer())
  console.log(`  [resize] ${tile}: 21600×21600 → ${TILE_SIZE}×${TILE_SIZE}`)

  await sharp(buffer, { limitInputPixels: false })
    .resize(TILE_SIZE, TILE_SIZE, { fit: 'fill' })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toFile(outPath)

  console.log(`  [done] ${tile} → ${outPath}`)
}

async function main() {
  console.log('NASA Tile Downloader (Day + Night)')
  console.log(`Output: ${OUT_DIR}`)
  console.log(`Tile size: ${TILE_SIZE}×${TILE_SIZE} @ JPEG quality ${JPEG_QUALITY}`)

  mkdirSync(OUT_DIR, { recursive: true })

  for (const set of SETS) {
    console.log(`\n=== ${set.name} ===`)
    for (const tile of TILES) {
      console.log(`\nProcessing ${set.prefix} tile ${tile}...`)
      try {
        await downloadAndResize(tile, set)
      } catch (err) {
        console.error(`  [ERROR] ${tile}: ${err.message}`)
        console.error(`  Continuing with remaining tiles...`)
      }
    }
  }

  console.log('\nDone! Tiles saved to public/textures/tiles/')
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
