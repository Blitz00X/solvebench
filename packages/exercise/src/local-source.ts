import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { Err, Ok, type Result } from "@solvebench/shared"
import { sourceError, type ExerciseSource, type ExerciseSourceError } from "./source"
import { importLocalPackages, readLocalPackage, LocalExerciseManifest, type ImportedExercise, type LocalPackage } from "./local-package"
import { runLocalTests } from "./local-runner"
import type { ExerciseSummary, LocalExercise, Problem, TestReport, Track } from "./types"

export class LocalExerciseSource implements ExerciseSource {
  readonly id = "local"
  readonly label = "Local"
  readonly submit = undefined
  private importing = false
  constructor(readonly root: string) {}
  async isConfigured() { return true }
  private async attempt<T>(operation: () => Promise<T>): Promise<Result<T, ExerciseSourceError>> {
    try { return Ok(await operation()) } catch (error) { return Err(sourceError("failed", error instanceof Error ? error.message : String(error))) }
  }
  async importExercises(directory: string) {
    if (this.importing) return Err(sourceError("failed", "An import is already running"))
    this.importing = true
    try { return await this.attempt<ImportedExercise[]>(() => importLocalPackages(directory, this.root)) }
    finally { this.importing = false }
  }
  private async packages(): Promise<LocalPackage[]> {
    let languages
    try { languages = await readdir(this.root, { withFileTypes: true }) } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
      throw error
    }
    const packages: LocalPackage[] = []
    for (const language of languages.filter(entry => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      for (const entry of (await readdir(join(this.root, language.name), { withFileTypes: true })).filter(entry => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
        packages.push(await readLocalPackage(join(this.root, language.name, entry.name), entry.name, false))
      }
    }
    return packages
  }
  private async find(track: string, slug: string) {
    LocalExerciseManifest.shape.language.parse(track)
    LocalExerciseManifest.shape.slug.unwrap().parse(slug)
    const item = await readLocalPackage(join(this.root, track, slug), slug, false)
    if (item.manifest.language !== track) throw new Error(`Local exercise not found: ${track}/${slug}`)
    return item
  }
  listTracks() { return this.attempt<Track[]>(async () => {
    const packages = await this.packages(), languages = [...new Set(packages.map(item => item.manifest.language))]
    return languages.map(language => ({ sourceId: this.id, slug: language, title: language, language, numExercises: packages.filter(item => item.manifest.language === language).length }))
  }) }
  listExercises(track: string) { return this.attempt<ExerciseSummary[]>(async () => (await this.packages()).filter(item => item.manifest.language === track).map(item => ({
    sourceId: this.id, trackSlug: track, slug: item.slug, title: item.manifest.title, difficulty: item.manifest.difficulty, progress: "available", blurb: "Local exercise",
  }))) }
  getProblem(track: string, slug: string) { return this.attempt<Problem>(async () => {
    const item = await this.find(track, slug), manifest = item.manifest
    return { sourceId: this.id, trackSlug: track, slug, title: manifest.title, difficulty: manifest.difficulty, body: await readFile(join(item.directory, manifest.statement), "utf8"), solutionFiles: manifest.solutionFiles, testFiles: manifest.testFiles ?? [] }
  }) }
  download(track: string, slug: string) { return this.attempt<LocalExercise>(async () => ({ sourceId: this.id, trackSlug: track, slug, directory: (await this.find(track, slug)).directory, files: [] })) }
  async isDownloaded(track: string, slug: string) { return (await this.download(track, slug)).ok }
  runTests(track: string, slug: string) { return this.attempt<TestReport>(async () => runLocalTests(await this.find(track, slug))) }
}
