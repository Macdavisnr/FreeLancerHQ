import { useRef } from 'react'
import type { Task } from '@/types/project'
import { daysUntil, describeDue } from '@/utils/format'

interface Props {
  task: Task
  onToggle: () => void
  /** null removes the due date */
  onDueDate: (date: string | null) => void
  onDelete: () => void
}

/** One task: tick it off, set or change its due date, or delete it. Used on project and Tasks pages. */
export default function TaskRow({ task, onToggle, onDueDate, onDelete }: Props) {
  // A hidden native date input: the button opens its picker, so we get the browser's own calendar.
  const picker = useRef<HTMLInputElement>(null)
  const overdue = task.dueDate !== null && !task.done && daysUntil(task.dueDate) < 0

  return (
    <li className="flex items-center gap-3 border-t border-line py-3">
      <input
        type="checkbox"
        checked={task.done}
        onChange={onToggle}
        aria-label={`Mark "${task.title}" as ${task.done ? 'not done' : 'done'}`}
        className="h-5 w-5 shrink-0 accent-brand-600"
      />
      <span className={`min-w-0 flex-1 ${task.done ? 'text-muted line-through' : ''}`}>{task.title}</span>

      <span className="relative shrink-0">
        <button
          type="button"
          onClick={() => picker.current?.showPicker()}
          className={`rounded-lg px-2 py-1 text-sm hover:bg-canvas ${
            overdue ? 'font-semibold text-red-600' : task.dueDate ? 'text-muted' : 'text-muted/60'
          }`}
        >
          {task.dueDate ? describeDue(task.dueDate) : '+ Due date'}
        </button>
        <input
          ref={picker}
          type="date"
          tabIndex={-1}
          aria-hidden="true"
          value={task.dueDate ?? ''}
          onChange={(e) => onDueDate(e.target.value || null)}
          className="pointer-events-none absolute right-0 bottom-0 h-0 w-0 opacity-0"
        />
      </span>
      {task.dueDate && (
        <button
          type="button"
          onClick={() => onDueDate(null)}
          aria-label={`Remove due date from "${task.title}"`}
          title="Remove due date"
          className="hidden text-xs text-muted hover:text-ink sm:inline"
        >
          clear
        </button>
      )}

      <button onClick={onDelete} aria-label={`Delete "${task.title}"`} className="px-2 text-muted hover:text-red-600">
        ✕
      </button>
    </li>
  )
}
