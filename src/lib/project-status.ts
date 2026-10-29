import type { ProjectStatus } from '@/types/project'

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  review: 'Review',
  completed: 'Completed',
}
