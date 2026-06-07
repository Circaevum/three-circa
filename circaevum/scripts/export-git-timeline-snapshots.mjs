#!/usr/bin/env node
/**
 * Export git-timeline JSON snapshots for production GL (circaevum.com).
 * Run from repo root: node yang/web/circaevum/scripts/export-git-timeline-snapshots.mjs
 */
import { createRequire } from 'module'
import { mkdir, writeFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CIR_ROOT = join(__dirname, '..', '..', '..', '..')
const OUT_DIR = join(__dirname, '..', 'data', 'git-timeline')
const require = createRequire(import.meta.url)
const { collectGitTimeline } = require(
  join(CIR_ROOT, 'Zhong', 'scripts', 'git-timeline-data.cjs')
)

const PRESETS = [
  { path: 'yang/web', label: 'GL' },
  { path: 'yang/yin-portal', label: 'Yin-portal' },
  { path: 'yang/spec', label: 'Nakama spec' },
  { path: 'yang/unity/TimeBox', label: 'Unity' },
  { path: 'Zhong', label: 'Zhong' },
  { path: 'cookbook', label: 'Cookbook' },
]

function repoPathToSlug(repoPath) {
  const p = String(repoPath || '').trim()
  return p ? p.replace(/\//g, '-') : 'root'
}

await mkdir(OUT_DIR, { recursive: true })

for (const preset of PRESETS) {
  const slug = repoPathToSlug(preset.path)
  try {
    const payload = await collectGitTimeline(CIR_ROOT, preset.path)
    const outPath = join(OUT_DIR, `${slug}.json`)
    await writeFile(outPath, JSON.stringify(payload, null, 2) + '\n')
    console.log(`✓ ${preset.label} (${preset.path}) → ${slug}.json (${payload.commits.length} commits)`)
  } catch (e) {
    console.warn(`✗ ${preset.label} (${preset.path}): ${e.message || e}`)
  }
}
