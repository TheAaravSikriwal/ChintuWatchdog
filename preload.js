const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('watchdog', {
  // Request all existing events on mount
  getInitialEvents: () => ipcRenderer.invoke('watchdog:get-initial-events'),

  // Get the projects directory path (for display)
  getProjectsDir: () => ipcRenderer.invoke('watchdog:get-projects-dir'),

  // Subscribe to live events as they arrive
  onEvents: (callback) => {
    const handler = (_event, events) => callback(events)
    ipcRenderer.on('watchdog:events', handler)
    // Return cleanup function
    return () => ipcRenderer.removeListener('watchdog:events', handler)
  },
})
