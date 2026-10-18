import { apiClient } from './client'

export interface AdminService {
  long_description?: string
  what_to_expect?: string[]
  id: string
  name: string
  slug: string
  description: string | null
  duration_minutes: number
  price_cents: number
  image_url: string | null
  is_active: boolean
}

export interface ServiceCreatePayload {
  long_description?: string
  what_to_expect?: string[]
  name: string
  description?: string | null
  duration_minutes: number
  price_cents: number
  image_url?: string | null
  is_active?: boolean
}

export interface ServiceUpdatePayload {
  long_description?: string
  what_to_expect?: string[]
  name?: string
  slug?: string
  description?: string | null
  duration_minutes?: number
  price_cents?: number
  image_url?: string | null
  is_active?: boolean
}

export function listAdminServices(): Promise<AdminService[]> {
  return apiClient<AdminService[]>('/api/v1/admin/services/', { auth: true })
}

export function createAdminService(data: ServiceCreatePayload): Promise<AdminService> {
  return apiClient<AdminService>('/api/v1/admin/services/', {
    method: 'POST',
    body: data,
    auth: true,
  })
}

export function updateAdminService(id: string, data: ServiceUpdatePayload): Promise<AdminService> {
  return apiClient<AdminService>(`/api/v1/admin/services/${id}`, {
    method: 'PUT',
    body: data,
    auth: true,
  })
}

export function deleteAdminService(id: string): Promise<void> {
  return apiClient<void>(`/api/v1/admin/services/${id}`, { method: 'DELETE', auth: true })
}
