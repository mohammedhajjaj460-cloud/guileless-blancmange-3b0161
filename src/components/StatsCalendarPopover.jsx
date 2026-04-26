import { useEffect, useRef } from 'react'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { dayKeyFromParts, pad2 } from '../utils/dateCalendar'
import styles from './StatsCalendarPopover.module.css'

const WEEKDAYS = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim']

/** Monday = 0 … Sunday = 6 */
function mondayIndex(jsDay) {
  return (jsDay + 6) % 7
}

function buildMonthGrid(year, month) {
  const first = new Date(year, month - 1, 1)
  const lastDay = new Date(year, month, 0).getDate()
  const pad = mondayIndex(first.getDay())
  const cells = []
  for (let i = 0; i < pad; i++) cells.push(null)
  for (let d = 1; d <= lastDay; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

export function StatsCalendarPopover({
  open,
  onClose,
  viewMonth,
  onViewMonthChange,
  selectedDayKey,
  onSelectDay,
  todayKey,
  daysWithData,
  onPickToday,
  highlightSelectedDay = true,
}) {
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open, onClose])

  const [vy, vm] = viewMonth.split('-').map(Number)
  const title = new Date(vy, vm - 1, 1).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
  })
  const titleCap = title.charAt(0).toUpperCase() + title.slice(1)
  const grid = buildMonthGrid(vy, vm)

  function prevMonth() {
    const d = new Date(vy, vm - 2, 1)
    onViewMonthChange(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`)
  }

  function nextMonth() {
    const d = new Date(vy, vm, 1)
    onViewMonthChange(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`)
  }

  if (!open) return null

  return (
    <div ref={wrapRef} className={styles.popover} role="dialog" aria-label="Calendrier">
      <div className={styles.head}>
        <button type="button" className={styles.navBtn} onClick={prevMonth} aria-label="Mois précédent">
          <ChevronLeft size={18} strokeWidth={2.25} />
        </button>
        <span className={styles.monthTitle}>{titleCap}</span>
        <button type="button" className={styles.navBtn} onClick={nextMonth} aria-label="Mois suivant">
          <ChevronRight size={18} strokeWidth={2.25} />
        </button>
      </div>
      <div className={styles.weekRow}>
        {WEEKDAYS.map((w) => (
          <span key={w} className={styles.weekday}>
            {w}
          </span>
        ))}
      </div>
      <div className={styles.grid}>
        {grid.map((day, i) => {
          if (day == null) {
            return <span key={`e-${i}`} className={styles.cellEmpty} />
          }
          const key = dayKeyFromParts(vy, vm, day)
          const isSelected = highlightSelectedDay && key === selectedDayKey
          const isToday = key === todayKey
          const hasData = daysWithData?.has(key)
          return (
            <button
              key={key}
              type="button"
              className={[
                styles.dayBtn,
                isSelected ? styles.daySelected : '',
                isToday && !isSelected ? styles.dayToday : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => {
                onSelectDay(key)
                onClose()
              }}
            >
              <span className={styles.dayNum}>{day}</span>
              {hasData ? <span className={styles.dot} aria-hidden /> : null}
            </button>
          )
        })}
      </div>
      <button type="button" className={styles.todayBtn} onClick={onPickToday}>
        Aujourd’hui
      </button>
    </div>
  )
}

export function StatsDateTrigger({ label, onClick, open }) {
  return (
    <button
      type="button"
      className={[styles.trigger, open ? styles.triggerOpen : ''].filter(Boolean).join(' ')}
      onClick={onClick}
      aria-expanded={open}
      aria-haspopup="dialog"
    >
      <Calendar size={18} strokeWidth={2} className={styles.triggerIcon} aria-hidden />
      <span>{label}</span>
    </button>
  )
}
