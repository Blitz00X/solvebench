import { bootstrapApp } from "../apps/tui/src/bootstrap"

// A live read/run/ask check. No submission, no user solution edits.
const app = await bootstrapApp({ repoRoot: process.cwd() })
await app.exercise.init()
await app.exercise.selectTrack("python")
await app.exercise.open("hello-world")
if (app.exercise.getState().error) throw new Error(app.exercise.getState().error!)
await app.exercise.runTests()
const state = app.exercise.getState()
console.log(`Task ${state.openedTrack}/${state.openedSlug}; current solution revision ${state.revision.slice(0, 10)}; tests ${state.lastReport?.passed}/${state.lastReport?.total}`)
const started = Date.now()
await app.controller.ask("yardım et — mevcut görev ve çözümüm için tek kısa sonraki adımı söyle")
const reply = app.controller.state.chat.at(-1)
if (!reply || reply.degraded) throw new Error(reply?.text ?? "No tutor response")
console.log(`Tutor response in ${Date.now() - started}ms: ${reply.text}`)
