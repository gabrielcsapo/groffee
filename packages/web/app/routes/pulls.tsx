import { apiFetch } from '../lib/api'
import { PullsList } from './pulls.client'

export default async function Pulls({ params }: { params: { owner: string; repo: string } }) {
  const { owner, repo } = params
  const data = await apiFetch(`/api/repos/${owner}/${repo}/pulls?status=open`)

  return <PullsList owner={owner} repo={repo} initialPulls={data.pullRequests || []} />
}
