import { describe, expect, test } from "bun:test"
import { createExercismApi, normaliseDifficulty } from "../src/exercism-api"

/** Records the fetched URLs and replays canned responses. */
function fixtureFetch(routes: Record<string, unknown>, status = 200) {
  const seen: string[] = []
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
    seen.push(url)
    for (const [suffix, body] of Object.entries(routes)) {
      if (url.endsWith(suffix) || url.includes(suffix)) {
        return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
      }
    }
    return new Response(JSON.stringify({ error: "not found" }), { status: 404 })
  }) as unknown as typeof fetch
  return { fetchImpl, seen }
}

const base = "https://api.exercism.org"

describe("normaliseDifficulty", () => {
  test("maps platform words onto the three levels", () => {
    expect(normaliseDifficulty("easy")).toBe("easy")
    expect(normaliseDifficulty("beginner")).toBe("easy")
    expect(normaliseDifficulty("medium")).toBe("medium")
    expect(normaliseDifficulty("intermediate")).toBe("medium")
    expect(normaliseDifficulty("hard")).toBe("hard")
    expect(normaliseDifficulty("advanced")).toBe("hard")
    expect(normaliseDifficulty(undefined)).toBe("unknown")
    expect(normaliseDifficulty("weird")).toBe("unknown")
  })
})

describe("ExercismApi", () => {
  test("listTracks reads /v2/tracks and sends the bearer token", async () => {
    let auth = ""
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      auth = String((init?.headers as Record<string, string> | undefined)?.["authorization"] ?? "")
      void input
      return new Response(JSON.stringify({ tracks: [{ slug: "python", title: "Python", num_exercises: 146 }] }), { status: 200 })
    }) as unknown as typeof fetch
    const api = createExercismApi({ baseUrl: base, token: "secret-token", fetchImpl })
    const tracks = await api.listTracks()
    expect(tracks).toHaveLength(1)
    expect(tracks[0]!.slug).toBe("python")
    expect(auth).toBe("Bearer secret-token")
  })

  test("listExercises reads the track exercise list", async () => {
    const { fetchImpl, seen } = fixtureFetch({
      "/v2/tracks/python/exercises": {
        exercises: [
          { slug: "hello-world", title: "Hello World", difficulty: "easy", is_unlocked: true },
          { slug: "two-fer", title: "Two Fer", difficulty: "easy", is_unlocked: false },
        ],
      },
    })
    const api = createExercismApi({ baseUrl: base, token: "t", fetchImpl })
    const exercises = await api.listExercises("python")
    expect(exercises).toHaveLength(2)
    expect(seen[0]).toContain("/v2/tracks/python/exercises")
  })

  test("listCompletedSlugs collects slugs from the paginated solutions", async () => {
    const { fetchImpl } = fixtureFetch({
      "/v2/solutions": {
        results: [
          { status: "completed", exercise: { slug: "hello-world" } },
          { status: "completed", exercise: { slug: "two-fer" } },
          { status: "completed" },
        ],
      },
    })
    const api = createExercismApi({ baseUrl: base, token: "t", fetchImpl })
    const slugs = await api.listCompletedSlugs()
    expect(slugs.has("hello-world")).toBe(true)
    expect(slugs.has("two-fer")).toBe(true)
    expect(slugs.size).toBe(2)
  })

  test("a non-200 becomes a thrown error for the caller to wrap", async () => {
    const fetchImpl = (async () => new Response("server error", { status: 500 })) as unknown as typeof fetch
    const api = createExercismApi({ baseUrl: base, token: "t", fetchImpl })
    await expect(api.listTracks()).rejects.toThrow(/exercism api 500/)
  })

  test("a 404 on an unknown track is reported with its status", async () => {
    const fetchImpl = (async () => new Response("missing", { status: 404 })) as unknown as typeof fetch
    const api = createExercismApi({ baseUrl: base, token: "t", fetchImpl })
    await expect(api.listExercises("nope")).rejects.toThrow(/exercism api 404/)
  })

  test("completeSolution PATCHes the solution and returns the unlocked tasks", async () => {
    let method = ""
    let url = ""
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
      method = String(init?.method ?? "")
      return new Response(JSON.stringify({ unlocked_exercises: [{ slug: "reverse-string" }, {}] }), { status: 200 })
    }) as unknown as typeof fetch
    const api = createExercismApi({ baseUrl: base, token: "t", fetchImpl })
    const { unlocked } = await api.completeSolution("abc-123")
    expect(method).toBe("PATCH")
    expect(url).toBe(`${base}/v2/solutions/abc-123/complete`)
    expect(unlocked).toEqual(["reverse-string"])
  })

  test("a base URL with a trailing slash is normalised", async () => {
    const { fetchImpl, seen } = fixtureFetch({ "/v2/tracks": { tracks: [] } })
    const api = createExercismApi({ baseUrl: `${base}/`, token: "t", fetchImpl })
    await api.listTracks()
    expect(seen[0]).toBe(`${base}/v2/tracks`)
  })
})
