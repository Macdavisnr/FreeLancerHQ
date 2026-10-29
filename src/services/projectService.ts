import { api, ApiError } from '@/lib/api'
import type { Project, ProjectInput, Task, TaskWithProject } from '@/types/project'

/** All projects, or only one client's when clientId is given. */
export async function listProjects(clientId?: string): Promise<Project[]> {
  const query = clientId ? `?clientId=${encodeURIComponent(clientId)}` : ''
  const { projects } = await api<{ projects: Project[] }>(`/projects${query}`)
  return projects
}

export async function getProject(id: string): Promise<{ project: Project; tasks: Task[] } | null> {
  try {
    return await api<{ project: Project; tasks: Task[] }>(`/projects/${id}`)
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null
    throw err
  }
}

export async function createProject(input: ProjectInput): Promise<Project> {
  const { project } = await api<{ project: Project }>('/projects', { method: 'POST', body: input })
  return project
}

export async function updateProject(id: string, input: ProjectInput): Promise<Project> {
  const { project } = await api<{ project: Project }>(`/projects/${id}`, { method: 'PUT', body: input })
  return project
}

export async function addTask(projectId: string, title: string, dueDate: string | null = null): Promise<Task> {
  const { task } = await api<{ task: Task }>(`/projects/${projectId}/tasks`, {
    method: 'POST',
    body: { title, dueDate },
  })
  return task
}

/** Every task across all projects. */
export async function listTasks(): Promise<TaskWithProject[]> {
  const { tasks } = await api<{ tasks: TaskWithProject[] }>('/tasks')
  return tasks
}

export async function setTaskDone(taskId: string, done: boolean): Promise<Task> {
  const { task } = await api<{ task: Task }>(`/tasks/${taskId}`, { method: 'PATCH', body: { done } })
  return task
}

/** null removes the due date. */
export async function setTaskDueDate(taskId: string, dueDate: string | null): Promise<Task> {
  const { task } = await api<{ task: Task }>(`/tasks/${taskId}`, { method: 'PATCH', body: { dueDate } })
  return task
}

export async function deleteTask(taskId: string): Promise<void> {
  await api<void>(`/tasks/${taskId}`, { method: 'DELETE' })
}
