import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '@/components/PageHeader'
import StatusBadge from '@/components/StatusBadge'
import TaskRow from '@/components/TaskRow'
import { btnPrimary } from '@/lib/ui'
import { addTask, deleteTask, listProjects, listTasks, setTaskDone, setTaskDueDate } from '@/services/projectService'
import type { Project, TaskWithProject } from '@/types/project'
import { describeDeadline } from '@/utils/format'

type Filter = 'open' | 'done' | 'all'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'done', label: 'Done' },
  { key: 'all', label: 'All' },
]

/** Tasks arrive sorted by project deadline, so grouping keeps that order. */
function groupByProject(tasks: TaskWithProject[]) {
  const groups = new Map<string, TaskWithProject[]>()
  for (const task of tasks) groups.set(task.projectId, [...(groups.get(task.projectId) ?? []), task])
  return [...groups.values()]
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<TaskWithProject[] | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [filter, setFilter] = useState<Filter>('open')
  const [projectId, setProjectId] = useState('')
  const [title, setTitle] = useState('')
  const [newDue, setNewDue] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    listTasks().then(setTasks)
    // Only projects still being worked on are offered for new tasks.
    listProjects().then((all) => {
      const active = all.filter((p) => p.status !== 'completed')
      setProjects(active)
      if (active[0]) setProjectId(active[0].id)
    })
  }, [])

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    const project = projects.find((p) => p.id === projectId)
    if (!project || !title.trim()) return
    setError('')
    try {
      await addTask(project.id, title, newDue || null)
      setTitle('')
      setNewDue('')
      if (filter === 'done') setFilter('open')
      // Reload rather than inserting locally, so the list keeps the server's order (by deadline).
      setTasks(await listTasks())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add task.')
    }
  }

  async function handleToggle(task: TaskWithProject) {
    setError('')
    try {
      const updated = await setTaskDone(task.id, !task.done)
      setTasks((t) => t && t.map((x) => (x.id === updated.id ? { ...x, done: updated.done } : x)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update task.')
    }
  }

  async function handleDueDate(task: TaskWithProject, dueDate: string | null) {
    setError('')
    try {
      const updated = await setTaskDueDate(task.id, dueDate)
      setTasks((t) => t && t.map((x) => (x.id === updated.id ? { ...x, dueDate: updated.dueDate } : x)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update task.')
    }
  }

  async function handleDelete(task: TaskWithProject) {
    setError('')
    try {
      await deleteTask(task.id)
      setTasks((t) => t && t.filter((x) => x.id !== task.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete task.')
    }
  }

  const open = (tasks ?? []).filter((t) => !t.done)
  const openProjects = new Set(open.map((t) => t.projectId)).size
  const visible = (tasks ?? []).filter((t) => filter === 'all' || t.done === (filter === 'done'))
  const groups = groupByProject(visible)

  return (
    <>
      <PageHeader
        title="Tasks"
        subtitle={
          tasks === null
            ? 'Everything you need to do, across all projects.'
            : `${open.length} open task${open.length === 1 ? '' : 's'} across ${openProjects} project${openProjects === 1 ? '' : 's'}.`
        }
      />

      {/* Add a task to any active project */}
      <section className="mb-6 rounded-2xl border border-line bg-white p-4 shadow-sm">
        {projects.length === 0 ? (
          <p className="text-muted">
            Tasks belong to a project.{' '}
            <Link to="/projects/new" className="font-semibold text-brand-700">Create a project</Link> to start adding tasks.
          </p>
        ) : (
          <form onSubmit={handleAdd} className="flex flex-col gap-2 sm:flex-row">
            <label htmlFor="task-project" className="sr-only">Project</label>
            <select
              id="task-project"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="rounded-xl border border-line bg-white px-4 py-2.5 outline-none focus:border-brand-600 sm:w-64"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name} · {p.clientName}</option>
              ))}
            </select>
            <label htmlFor="task-title" className="sr-only">Task</label>
            <input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Add a task"
              className="min-w-0 flex-1 rounded-xl border border-line px-4 py-2.5 outline-none focus:border-brand-600"
            />
            <label htmlFor="new-task-due" className="sr-only">Due date (optional)</label>
            <input
              id="new-task-due"
              type="date"
              value={newDue}
              onChange={(e) => setNewDue(e.target.value)}
              title="Due date (optional)"
              className="rounded-xl border border-line bg-white px-3 py-2.5 text-muted outline-none focus:border-brand-600"
            />
            <button type="submit" className={btnPrimary}>Add</button>
          </form>
        )}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </section>

      <div className="mb-4 flex gap-2" role="tablist" aria-label="Filter tasks">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            role="tab"
            aria-selected={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
              filter === f.key ? 'bg-brand-600 text-white' : 'border border-line bg-white text-muted hover:text-ink'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {tasks === null && <p className="text-muted">Loading…</p>}
      {tasks !== null && groups.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line bg-white p-10 text-center text-muted">
          {tasks.length === 0
            ? 'No tasks yet. Add one above, or from a project page.'
            : filter === 'open'
              ? 'Nothing left to do. 🎉'
              : 'No finished tasks yet.'}
        </div>
      )}

      <div className="space-y-4">
        {groups.map((group) => {
          const first = group[0]
          return (
            <section key={first.projectId} className="rounded-2xl border border-line bg-white p-6 shadow-sm">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Link to={`/projects/${first.projectId}`} className="font-bold hover:text-brand-700">
                    {first.projectName}
                  </Link>
                  <p className="text-sm text-muted">
                    {first.clientName} ·{' '}
                    {first.projectStatus === 'completed' ? 'Completed' : describeDeadline(first.projectDeadline)}
                  </p>
                </div>
                <StatusBadge status={first.projectStatus} />
              </div>
              <ul>
                {group.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onToggle={() => handleToggle(task)}
                    onDueDate={(date) => handleDueDate(task, date)}
                    onDelete={() => handleDelete(task)}
                  />
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </>
  )
}
