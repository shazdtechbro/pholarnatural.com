import { apiClient } from './client'

export type PublicSettings = Record<string, string>
export const getPublicSettings = () => apiClient<PublicSettings>('/api/v1/admin/settings/public')
export function featured<T extends { id: string }>(items: T[], ids = ''): T[] {
  // Featured IDs control order, not membership: every active new product remains discoverable.
  const ordered = ids
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
  return [...items].sort((a, b) => {
    const ai = ordered.indexOf(a.id),
      bi = ordered.indexOf(b.id)
    return (ai < 0 ? ordered.length : ai) - (bi < 0 ? ordered.length : bi)
  })
}
