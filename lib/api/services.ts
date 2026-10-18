import type { Service } from '@/lib/types'
import { apiClient, ApiError } from './client'

// ─── Raw backend shape ────────────────────────────────────────────────────────

interface RawService {
  long_description?: string
  what_to_expect?: string[]
  id: string
  name: string
  slug: string
  description?: string | null
  duration_minutes: number
  price_cents: number
  image_url?: string | null
  is_active: boolean
}

// ─── Normalisation ────────────────────────────────────────────────────────────

function normalise(raw: RawService): Service {
  return {
    ...raw,
    description: raw.description ?? '',
    image_url: raw.image_url ?? '',
    // long_description and what_to_expect are not yet stored in the backend DB.
    // They will be populated once the services table is extended with those columns.
    long_description: raw.long_description || raw.description || '',
    what_to_expect: raw.what_to_expect ?? [],
  }
}

// ─── Public functions ─────────────────────────────────────────────────────────

export async function getServices(): Promise<Service[]> {
  const raw = await apiClient<RawService[]>('/api/v1/services/', {})
  return raw.filter((s) => s.is_active).map(normalise)
}

export async function getServiceBySlug(slug: string): Promise<Service | null> {
  try {
    const raw = await apiClient<RawService>(`/api/v1/services/${slug}`, {})
    if (!raw.is_active) return null
    return normalise(raw)
  } catch (e) {
    if (e instanceof ApiError && e.isNotFound) return null
    throw e
  }
}
