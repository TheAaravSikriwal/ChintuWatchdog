// dayGrouping.js — group the All-Agents feed into per-day "chats".
//
// The All-Agents view is organised like a messaging app: each calendar day is
// its own conversation. Today is the live chat; past days are history. This
// keeps the interleaved feed readable (one day at a time) instead of dumping
// every session across all time into one stream.

function pad(n) {
  return n < 10 ? '0' + n : '' + n
}

/** Local calendar-day key 'YYYY-MM-DD' for a Date. */
export function dayKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Today's day key. */
export function todayKey() {
  return dayKey(new Date())
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Human label for a day key: Today / Yesterday / weekday (last 7d) / date. */
export function dayLabel(key) {
  const now = new Date()
  const tKey = dayKey(now)
  if (key === tKey) return 'Today'

  const y = new Date(now)
  y.setDate(y.getDate() - 1)
  if (key === dayKey(y)) return 'Yesterday'

  const [yr, mo, da] = key.split('-').map(Number)
  const d = new Date(yr, mo - 1, da)
  const ageDays = Math.floor((now - d) / (24 * 60 * 60 * 1000))
  if (ageDays < 7) return WEEKDAYS[d.getDay()]

  const sameYear = yr === now.getFullYear()
  return sameYear ? `${MONTHS[mo - 1]} ${da}` : `${MONTHS[mo - 1]} ${da}, ${yr}`
}

/**
 * Build the descending list of days that have All-Agents activity.
 * Today is always included (the live chat), even with no events yet.
 *
 * @param {Map} sessions - Map<sessionId, Session>
 * @returns {Array<{ key, label, count, agents, lastAt }>}  newest first
 */
export function getActivityDays(sessions) {
  const map = new Map() // key -> { count, agents:Set, lastAt }

  for (const sess of sessions.values()) {
    for (const ev of sess.events) {
      const ts = ev.timestamp ? new Date(ev.timestamp) : sess.lastEventAt
      if (!ts || isNaN(ts.getTime())) continue
      const key = dayKey(ts)
      let e = map.get(key)
      if (!e) { e = { count: 0, agents: new Set(), lastAt: 0 }; map.set(key, e) }
      e.count++
      e.agents.add(sess.agent)
      e.lastAt = Math.max(e.lastAt, ts.getTime())
    }
  }

  const tKey = todayKey()
  if (!map.has(tKey)) map.set(tKey, { count: 0, agents: new Set(), lastAt: Date.now() })

  return [...map.entries()]
    .map(([key, e]) => ({ key, label: dayLabel(key), count: e.count, agents: e.agents.size, lastAt: e.lastAt }))
    .sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0)) // newest first
}
