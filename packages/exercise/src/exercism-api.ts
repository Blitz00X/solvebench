import type { Difficulty } from "./types"

/**
 * Minimal Exercism API v2 client. Only the endpoints the product needs.
 * The token is sent as a bearer header and never written anywhere.
 */
export interface ExercismApiOptions {
  baseUrl: string
  token: string
  fetchImpl?: typeof fetch
}

export interface ApiTrack {
  slug: string
  title: string
  num_exercises?: number
}

export interface ApiExercise {
  slug: string
  title: string
  difficulty?: string
  blurb?: string
  /** "tutorial", "concept" or "practice" when the platform declares one. */
  type?: string
  is_unlocked?: boolean
  is_recommended?: boolean
  is_external?: boolean
}

export interface ExercismApi {
  listTracks(): Promise<ApiTrack[]>
  listExercises(trackSlug: string): Promise<ApiExercise[]>
  listCompletedSlugs(trackSlug?: string): Promise<Set<string>>
  /**
   * Marks an uploaded solution complete. This is the step that unlocks the
   * next tasks — the same action as the website's Complete exercise button.
   * Returns the exercises the platform just unlocked.
   */
  completeSolution(uuid: string): Promise<{ unlocked: string[] }>
}

export function normaliseDifficulty(raw: string | undefined): Difficulty {
  switch ((raw ?? "").toLowerCase()) {
    case "easy":
    case "beginner":
      return "easy"
    case "medium":
    case "intermediate":
      return "medium"
    case "hard":
    case "advanced":
      return "hard"
    default:
      return "unknown"
  }
}

export function createExercismApi(options: ExercismApiOptions): ExercismApi {
  const fetchImpl = options.fetchImpl ?? fetch
  const base = options.baseUrl.replace(/\/$/, "")

  async function get<T>(path: string): Promise<T> {
    const response = await fetchImpl(`${base}${path}`, {
      headers: { authorization: `Bearer ${options.token}`, accept: "application/json" },
      // A local statement must never wait forever on an unreachable API.
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) throw new Error(`exercism api ${response.status} for ${path}`)
    return (await response.json()) as T
  }

  return {
    async listTracks(): Promise<ApiTrack[]> {
      const data = await get<{ tracks?: ApiTrack[] }>("/v2/tracks")
      return data.tracks ?? []
    },

    async listExercises(trackSlug: string): Promise<ApiExercise[]> {
      const data = await get<{ exercises?: ApiExercise[] }>(`/v2/tracks/${trackSlug}/exercises`)
      return data.exercises ?? []
    },

    /**
     * Completed exercises come from the solution list, which paginates. The
     * first page is enough for the exercise list view; the local workspace is
     * the source of truth for what has actually been solved on this machine.
     */
    async listCompletedSlugs(trackSlug?: string): Promise<Set<string>> {
      const slugs = new Set<string>()
      for (let page = 1; page <= 1000; page++) {
        const data = await get<{ results?: { status?: string; exercise?: { slug?: string }; track?: { slug?: string } }[]; meta?: { total_pages?: number } }>(
          `/v2/solutions?page=${page}&per_page=100${trackSlug ? `&track_slug=${encodeURIComponent(trackSlug)}` : ""}`,
        )
        const rows = data.results ?? []
        for (const row of rows) {
          if (row.status !== "completed" || trackSlug && row.track?.slug && row.track.slug !== trackSlug) continue
          if (row.exercise?.slug) slugs.add(row.exercise.slug)
        }
        if (!rows.length || data.meta?.total_pages && page >= data.meta.total_pages || !data.meta?.total_pages && rows.length < 100) break
      }
      return slugs
    },

    async completeSolution(uuid: string): Promise<{ unlocked: string[] }> {
      const response = await fetchImpl(`${base}/v2/solutions/${encodeURIComponent(uuid)}/complete`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${options.token}`, accept: "application/json" },
      })
      if (!response.ok) throw new Error(`exercism api ${response.status} for /v2/solutions/${uuid}/complete`)
      const data = (await response.json()) as { unlocked_exercises?: { slug?: string }[] }
      return { unlocked: (data.unlocked_exercises ?? []).map((e) => e.slug).filter((s): s is string => Boolean(s)) }
    },
  }
}
