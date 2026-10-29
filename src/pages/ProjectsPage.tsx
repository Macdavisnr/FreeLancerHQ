import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '@/components/PageHeader'
import ProjectsTable from '@/components/ProjectsTable'
import { btnPrimary } from '@/lib/ui'
import { listProjects } from '@/services/projectService'
import type { Project } from '@/types/project'

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[] | null>(null)

  useEffect(() => {
    listProjects().then(setProjects)
  }, [])

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle="Track status, deadlines and budgets."
        action={<Link to="/projects/new" className={btnPrimary}>New project</Link>}
      />
      <ProjectsTable projects={projects} emptyMessage="No projects yet. Create your first one." />
    </>
  )
}
