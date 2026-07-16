// Dev helper: launch Electron with NODE_ENV=development.
// Matches Chintu's pattern: wait-on tcp:5174 ensures Vite is
// ready before Electron loads the dev URL.
const { spawn } = require('child_process')
const path = require('path')

const electron = require('electron')
const child = spawn(String(electron), [path.join(__dirname, '..')], {
  env: { ...process.env, NODE_ENV: 'development' },
  stdio: 'inherit',
})
child.on('close', (code) => process.exit(code))
