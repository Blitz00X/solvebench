import { test, expect } from "bun:test"
import { cleanCliMessage } from "../src/exercism-source"

test("cleanCliMessage strips the raw Error: label and removes repeated lines", () => {
  const raw = "Error: No files you submitted have changed since your last submission\nError: No files you submitted have changed since your last submission"
  expect(cleanCliMessage(raw)).toBe("No files you submitted have changed since your last submission")
})

test("cleanCliMessage keeps a single clean sentence", () => {
  expect(cleanCliMessage("https://exercism.org/tracks/python/exercises/hello-world")).toBe(
    "https://exercism.org/tracks/python/exercises/hello-world",
  )
})

test("cleanCliMessage returns an empty string for blank output", () => {
  expect(cleanCliMessage("\n\n   \n")).toBe("")
})
