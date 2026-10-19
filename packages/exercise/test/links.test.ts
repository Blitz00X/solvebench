import { describe, expect, test } from "bun:test"
import { resolveReferenceLinks } from "../src/links"

describe("resolveReferenceLinks", () => {
  test("turns reference usages into inline links and drops the definitions", () => {
    const input = ['Say ["Hello, World!"][hello-world].', "", "[hello-world]: https://example.org/hello"].join("\n")
    expect(resolveReferenceLinks(input)).toBe('Say ["Hello, World!"](https://example.org/hello).')
  })

  test("handles collapsed references and case-insensitive names", () => {
    const input = ["See [Docs][].", "", "[DOCS]: https://example.org/docs"].join("\n")
    expect(resolveReferenceLinks(input)).toBe("See [Docs](https://example.org/docs).")
  })

  test("leaves unresolved usages and plain text untouched", () => {
    const input = "array[0][1] and [x][missing]\n\n[used]: https://example.org"
    expect(resolveReferenceLinks(input)).toBe("array[0][1] and [x][missing]")
  })

  test("markdown without definitions is unchanged", () => {
    const input = "# Heading\n\n- one\n- two"
    expect(resolveReferenceLinks(input)).toBe(input)
  })
})
