// useDurationTick.js — Global 1-second timer for running action durations
import { useState, useEffect } from 'react'

export function useDurationTick() {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setTick(t => t + 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  return tick
}
