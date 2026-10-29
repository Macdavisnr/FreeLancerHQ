import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import PageHeader from '@/components/PageHeader'
import BackLink from '@/components/BackLink'
import DocumentsPanel from '@/components/DocumentsPanel'
import StatCard from '@/components/StatCard'
import StatusBadge from '@/components/StatusBadge'
import TaskRow from '@/components/TaskRow'
import { STATUS_LABELS } from '@/lib/project-status'
import { btnPrimary, btnSecondary } from '@/lib/ui'
import { addTask, deleteTask, getProject, setTaskDone, setTaskDueDate } from '@/services/projectService'
import type { Project, Task } from '@/types/project'
import { describeDeadline, formatCurrency, formatDate } from '@/utils/format'

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-line py-2.5 last:border-0">
      <span className="text-muted">{label}</span>
      <span className="font-semibold">{children}</span>
    </div>
  )
}

export default function ProjectDetailPage() {
  const { id } = useParams()
  const [data, setData] = useState<{ project: Project; tasks: Task[] } | null | undefined>(undefined)
  const [newTask, setNewTask] = useState('')
  const [newDue, setNewDue] = useState('')
  const [error, setError] = useState('')
  const taskInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (id) getProject(id).then(setData)
  }, [id])

  if (data === undefined) return <p className="text-muted">Loading…</p>
  if (data === null) {
    return (
      <>
        <p className="mb-4 text-muted">Project not found.</p>
        <Link to="/projects" className={btnSecondary}>Back to projects</Link>
      </>
    )
  }

  const { project, tasks } = data
  const doneCount = tasks.filter((t) => t.done).length
  const progress = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0

  const setTasks = (update: (tasks: Task[]) => Task[]) =>
    setData((d) => d && { ...d, tasks: update(d.tasks) })

  async function handleAddTask(e: FormEvent) {
    e.preventDefault()
    if (!newTask.trim()) return
    setError('')
    try {
      const task = await addTask(project.id, newTask, newDue || null)
      setTasks((t) => [...t, task])
      setNewTask('')
      setNewDue('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add task.')
    }
  }

  async function handleToggle(task: Task) {
    setError('')
    try {
      const updated = await setTaskDone(task.id, !task.done)
      setTasks((t) => t.map((x) => (x.id === updated.id ? updated : x)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update task.')
    }
  }

  async function handleDueDate(task: Task, dueDate: string | null) {
    setError('')
    try {
      const updated = await setTaskDueDate(task.id, dueDate)
      setTasks((t) => t.map((x) => (x.id === updated.id ? updated : x)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update task.')
    }
  }

  async function handleDelete(task: Task) {
    setError('')
    try {
      await deleteTask(task.id)
      setTasks((t) => t.filter((x) => x.id !== task.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete task.')
    }
  }

  return (
    <>
      <div className="mb-2 flex items-center gap-2 text-sm text-muted">
        <BackLink to="/projects" label="Projects" />
        <span>/</span>
        <span>{project.name}</span>
      </div>
      <PageHeader
        title={project.name}
        subtitle={project.clientName}
        action={
          <div className="flex flex-wrap gap-3">
            <Link to={`/projects/${project.id}/edit`} className={btnSecondary}>Edit project</Link>
            <Link
              to={`/invoices/new?clientId=${project.clientId}&projectId=${project.id}`}
              className={btnSecondary}
            >
              New invoice
            </Link>
            <button onClick={() => taskInput.current?.focus()} className={btnPrimary}>Add task</button>
          </div>
        }
      />
      <div className="-mt-4 mb-6"><StatusBadge status={project.status} /></div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Budget" value={formatCurrency(project.budget)} note="Fixed price" tone="blue" />
        <StatCard
          label="Invoiced"
          value={formatCurrency(project.invoiced)}
          note={project.invoiceCount === 0 ? 'No invoice yet' : `${project.invoiceCount} invoice${project.invoiceCount === 1 ? '' : 's'}`}
          tone="green"
        />
        <StatCard
          label="Deadline"
          value={formatDate(project.deadline)}
          note={project.status === 'completed' ? 'Completed' : describeDeadline(project.deadline)}
          tone="amber"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl border border-line bg-white p-6 shadow-sm lg:col-span-2">
          <h2 className="mb-3 font-bold">Tasks</h2>
          <div className="mb-1 flex justify-between text-sm">
            <span className="text-muted">Progress</span>
            <span className="font-bold">{progress}%</span>
          </div>
          <div className="mb-3 h-2 overflow-hidden rounded-full bg-brand-50">
            <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${progress}%` }} />
          </div>

          <ul>
            {tasks.length === 0 && <li className="border-t border-line py-4 text-muted">No tasks yet. Add the first one below.</li>}
            {tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onToggle={() => handleToggle(task)}
                onDueDate={(date) => handleDueDate(task, date)}
                onDelete={() => handleDelete(task)}
              />
            ))}
          </ul>

          <form onSubmit={handleAddTask} className="mt-3 flex flex-col gap-2 border-t border-line pt-4 sm:flex-row">
            <input
              ref={taskInput}
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
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
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </section>

        <div className="space-y-4">
          <section className="rounded-2xl border border-line bg-white p-6 shadow-sm">
            <h2 className="mb-2 font-bold">Details</h2>
            <DetailRow label="Client">
              <Link to={`/clients/${project.clientId}`} className="text-brand-700">{project.clientName}</Link>
            </DetailRow>
            <DetailRow label="Status">{STATUS_LABELS[project.status]}</DetailRow>
            <DetailRow label="Started">{formatDate(project.startDate)}</DetailRow>
          </section>
          <section className="rounded-2xl border border-line bg-white p-6 shadow-sm">
            <h2 className="mb-2 font-bold">Description</h2>
            <p className="text-muted">{project.description || 'No description yet.'}</p>
          </section>
          <DocumentsPanel filter={{ projectId: project.id }} emptyMessage="No documents for this project yet." />
        </div>
      </div>
    </>
  )
}
