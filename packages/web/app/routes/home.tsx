import { apiFetch } from '../lib/api'
import { HomeView } from './home.client'

export default async function Home() {
  const data = await apiFetch('/api/repos?limit=10')

  return <HomeView initialRepos={data.repositories || []} />
}
