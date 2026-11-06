import { describe, expect, test } from "bun:test"
import { createDefaultRegistry, SourceRegistry, type SourceContext } from "../src/source-registry"
import type { ExerciseSource } from "../src/source"

const context = { repoRoot: "/repo" } as SourceContext

function fakeSource(id: string): ExerciseSource {
  return {
    id,
    label: id,
    isConfigured: async () => true,
    listTracks: async () => ({ ok: true, value: [] }),
    listExercises: async () => ({ ok: true, value: [] }),
    getProblem: async () => ({ ok: true, value: {} }),
    download: async () => ({ ok: true, value: {} }),
    isDownloaded: async () => false,
    runTests: async () => ({ ok: true, value: {} }),
  } as unknown as ExerciseSource
}

describe("SourceRegistry", () => {
  test("registers and constructs each source once", () => {
    const registry = new SourceRegistry()
      .register({ id: "alpha", label: "Alpha", create: () => fakeSource("alpha") })
      .register({ id: "beta", label: "Beta", create: () => fakeSource("beta") })

    expect(registry.list().map((definition) => definition.id)).toEqual(["alpha", "beta"])
    const sources = registry.createAll(context)
    expect(Object.keys(sources)).toEqual(["alpha", "beta"])
    expect(sources.alpha!.id).toBe("alpha")
    expect(registry.create("missing", context)).toBeUndefined()
  })

  test("rejects duplicate and unsafe ids early", () => {
    const registry = new SourceRegistry().register({ id: "alpha", label: "Alpha", create: () => fakeSource("alpha") })
    expect(() => registry.register({ id: "alpha", label: "Again", create: () => fakeSource("alpha") })).toThrow("already registered")
    expect(() => registry.register({ id: "Bad Id", label: "Bad", create: () => fakeSource("bad") })).toThrow("Invalid source id")
  })

  test("the shipped registry contains the built-in sources", () => {
    expect(createDefaultRegistry().list().map((definition) => definition.id)).toEqual(["exercism", "leetcode", "local", "cses"])
  })
})
