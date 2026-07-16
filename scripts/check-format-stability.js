#!/usr/bin/env node
// Format-stability gate — verifies the stable contract hasn't changed.
//
// What's stable (must not change without deliberate review):
//   - main/event.js          — WatchdogEvent typedef + core functions
//   - src/components/EventFeed.jsx — display layer
//   - preload.js             — IPC bridge
//
// What's allowed to change freely:
//   - main/tool-map.js       — grows with each new adapter
//
// Usage: node scripts/check-format-stability.js
// Exit 0 = all hashes match. Exit 1 = mismatch detected.

const fs = require('fs')
const crypto = require('crypto')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')

const BASELINES = {
  'main/event.js':                'b29a41432aeadaca73c141732aef85b1ed5c77dfc9009cd864e7a42100a70e88',
  'src/components/EventFeed.jsx': 'bf4b74aa51b5776c7a92d1e108aa2f23fe83b2242cbc2f679a312859c2f95a2c',
  'preload.js':                   'fde0888a5b61127279d0232b016418b7eb66a07c64101851da9aa26468ff5d66',
}

let pass = 0
let fail = 0

console.log('Format-stability gate\n')

for (const [rel, expected] of Object.entries(BASELINES)) {
  const full = path.join(ROOT, rel)
  let buf
  try {
    buf = fs.readFileSync(full)
  } catch (e) {
    console.log(`  FAIL  ${rel} — file not found: ${e.message}`)
    fail++
    continue
  }

  const actual = crypto.createHash('sha256').update(buf).digest('hex')
  if (actual === expected) {
    console.log(`  OK    ${rel}`)
    pass++
  } else {
    console.log(`  FAIL  ${rel}`)
    console.log(`        expected: ${expected}`)
    console.log(`        actual:   ${actual}`)
    fail++
  }
}

console.log()
console.log(`Note: main/tool-map.js is NOT checked — it grows with each adapter.`)
console.log()

if (fail > 0) {
  console.log(`${fail} file(s) changed. The stable contract may have been modified.`)
  console.log('Review the diff before proceeding.')
  process.exit(1)
}

console.log(`${pass}/${pass} stable files match baseline. Gate passed.`)
