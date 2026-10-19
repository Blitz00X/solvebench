import type { SessionState } from "@solvebench/shared"
import type { AppController } from "./controller"
import type { ExerciseController } from "./exercise-controller"
import { Workbench } from "./components/workbench"

export interface AppProps {
  state: SessionState
  controller: AppController
  /** Provider description for the chat empty state. */
  providerLabel?: string
  /** Exercise workflow controller. */
  exercise: ExerciseController
  onExit?: () => void
}

/**
 * The shell. The workbench is the product: exercise browser, problem, editor,
 * tests and the AI assistant, all driven by the same session operations.
 */
export function App(props: AppProps) {
  return (
    <Workbench
      state={props.state}
      controller={props.controller}
      exercise={props.exercise}
      providerLabel={props.providerLabel}
      onExit={props.onExit}
    />
  )
}
