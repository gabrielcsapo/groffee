import { apiFetch } from '../lib/api'
import { ExploreList } from './explore.client'

export default async function Explore() {
  const data = await apiFetch('/api/repos?limit=30')

  return <ExploreList initialRepos={data.repositories || []} />
}
