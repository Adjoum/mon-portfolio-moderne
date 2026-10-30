// src/lib/cvDocument.ts
// CV public du portfolio. Source de vérité : la version active en base (rpc cv_active).
//
// Le fichier statique /cv.pdf n'est utilisé que si AUCUNE version n'a jamais été publiée
// (ou si la migration n'est pas encore appliquée). Une panne passagère n'y retombe PAS :
// afficher l'ancien CV en silence est précisément le défaut que ce module corrige.
// La référence active n'est jamais mise en cache : rpc en POST, aucun stockage local.

import { supabase } from './supabase'

export const LEGACY_CV_URL = '/cv.pdf'
const DOWNLOAD_NAME = 'CV-Adjoumani.pdf'

export interface CvVersionRef {
  id: string
  bucket: string
  storage_path: string
  sha256: string
  size_bytes: number
  activated_at: string
}

export type CvResolution =
  | { kind: 'active'; version: CvVersionRef; viewUrl: string; downloadUrl: string }
  | { kind: 'legacy'; viewUrl: string; downloadUrl: string }
  | { kind: 'error' }

interface RpcResult {
  data: CvVersionRef[] | null
  error: { code?: string } | null
}

/** Décision pure (testée) : seule l'absence avérée de version autorise le fichier statique */
export function resolveCvState(
  result: RpcResult,
  urls: (version: CvVersionRef) => { viewUrl: string; downloadUrl: string },
): CvResolution {
  if (result.error) {
    return result.error.code === 'PGRST202'
      ? { kind: 'legacy', viewUrl: LEGACY_CV_URL, downloadUrl: LEGACY_CV_URL }
      : { kind: 'error' }
  }
  const version = result.data?.[0]
  if (!version) return { kind: 'legacy', viewUrl: LEGACY_CV_URL, downloadUrl: LEGACY_CV_URL }
  return { kind: 'active', version, ...urls(version) }
}

/** Aperçu et téléchargement pointent vers le même objet versionné */
export function cvVersionUrls(version: Pick<CvVersionRef, 'bucket' | 'storage_path'>) {
  const bucket = supabase.storage.from(version.bucket)
  return {
    viewUrl:     bucket.getPublicUrl(version.storage_path).data.publicUrl,
    downloadUrl: bucket.getPublicUrl(version.storage_path, { download: DOWNLOAD_NAME }).data.publicUrl,
  }
}

export async function fetchActiveCv(): Promise<CvResolution> {
  try {
    const { data, error } = await supabase.rpc('cv_active')
    return resolveCvState({ data: data as CvVersionRef[] | null, error }, cvVersionUrls)
  } catch {
    return { kind: 'error' }
  }
}
