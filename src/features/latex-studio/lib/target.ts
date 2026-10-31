// Candidature visée : organisme ou institution obligatoire, poste facultatif.
export interface Target { organization: string; role: string }

export const targetReady = (t: Target) => t.organization.trim().length >= 2
