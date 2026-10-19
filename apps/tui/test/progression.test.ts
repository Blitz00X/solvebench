import { test, expect } from "bun:test"
import { fixture } from "./workbench-fixture"

test("submitting a solved task marks it completed AND unlocks the next one in the list", async () => {
  const h = await fixture({ lockedNext: true })
  try {
    await h.exercise.init()
    // The list starts with only the first task available; the next is locked.
    const before = h.exercise.getState().exercises
    expect(before.find(e => e.slug === "answer")!.progress).not.toBe("locked")
    expect(before.find(e => e.slug === "other")!.progress).toBe("locked")

    await h.exercise.open("answer")
    h.exercise.setBuffer("def answer():\n    return 7\n")
    await h.exercise.runTests()
    expect(h.exercise.getState().lastReport?.passed).toBe(1)
    await h.exercise.submit()

    // The regression: after a successful submit the task is completed and the
    // next one is no longer locked, without a restart.
    const after = h.exercise.getState()
    expect(after.lastSubmit?.ok).toBe(true)
    expect(after.exercises.find(e => e.slug === "answer")!.progress).toBe("completed")
    expect(after.exercises.find(e => e.slug === "other")!.progress).not.toBe("locked")
  } finally { await h.cleanup() }
})

test("Next task advances to the freshly unlocked task after a submit", async () => {
  const h = await fixture({ lockedNext: true })
  try {
    await h.exercise.init()
    await h.exercise.open("answer")
    h.exercise.setBuffer("def answer():\n    return 7\n")
    await h.exercise.runTests()
    await h.exercise.submit()
    const next = await h.exercise.nextExercise()
    expect(next).toBe("other")
    expect(h.exercise.getState().activeSlug).toBe("other")
  } finally { await h.cleanup() }
})

test("Next task wraps around to a newly unlocked task that is not below the current row", async () => {
  // The platform unlocked a task ABOVE the current one; nextExercise must find it.
  const h = await fixture({ lockedNext: true })
  try {
    await h.exercise.init()
    await h.exercise.open("third") // a task near the end of the list
    // Nothing unlocked after "third"; it must wrap to the first open task.
    const next = await h.exercise.nextExercise()
    expect(next).toBe("answer")
    expect(h.exercise.getState().error).toBeNull()
  } finally { await h.cleanup() }
})

test("Next task prefers the platform's recommended exercise over list order", async () => {
  const h = await fixture({ recommended: "third" })
  try {
    await h.exercise.init()
    await h.exercise.open("answer")
    h.exercise.setBuffer("def answer():\n    return 7\n")
    await h.exercise.runTests()
    await h.exercise.submit()
    // List order would say "other"; the recommendation wins.
    const next = await h.exercise.nextExercise()
    expect(next).toBe("third")
    expect(h.exercise.getState().activeSlug).toBe("third")
  } finally { await h.cleanup() }
})

test("re-submitting an unchanged solution is treated as submitted, not as an error", async () => {
  const h = await fixture()
  try {
    await h.exercise.init()
    await h.exercise.open("answer")
    h.exercise.setBuffer("def answer():\n    return 7\n")
    await h.exercise.runTests()
    await h.exercise.submit()
    expect(h.exercise.getState().lastSubmit?.ok).toBe(true)
    expect(h.exercise.getState().error).toBeNull()
  } finally { await h.cleanup() }
})
