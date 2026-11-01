# Connect a real model (optional)

SolveBench works without a model. The default assistant is a deterministic
offline mock, and the UI labels it **Offline demo · no AI model connected**.
Connecting a real model is optional.

The assistant uses an OpenAI-compatible `/chat/completions` endpoint. It sends
the opened exercise, current solution buffers, loaded test files and the latest
test output. See [PRIVACY.md](../PRIVACY.md) before sending private material.

## 1. Create a provider configuration

Create `solvebench.config.json` in the workspace you open with `--repo`, or
create `~/.config/solvebench/config.json` to apply it to every workspace. The
workspace file takes precedence.

```json
{
  "provider": {
    "kind": "http",
    "baseUrl": "https://api.openai.com/v1",
    "model": "gpt-4o-mini",
    "apiKeyEnv": "SOLVEBENCH_API_KEY",
    "maxTokens": 4096,
    "temperature": 0,
    "timeoutMs": 60000
  }
}
```

- `baseUrl` is the API root, without `/chat/completions`.
- `apiKeyEnv` is the **name** of an environment variable, never the key itself.
- `maxTokens`, `temperature` and `timeoutMs` are optional.
- `reasoningEffort` (`none`, `low`, `medium`, `high`) is optional and is sent as
  `reasoning_effort` for models that support it.

A local OpenAI-compatible server works the same way:

```json
{
  "provider": {
    "kind": "http",
    "baseUrl": "http://localhost:11434/v1",
    "model": "your-installed-model",
    "apiKeyEnv": "SOLVEBENCH_API_KEY"
  }
}
```

The HTTP provider always sends a bearer token. If your local server ignores
authentication, still set the named variable to any non-empty value.

There is no `/config` command in the UI. Edit the file and restart SolveBench.
The header shows the active connection (`http:<model>`) or the offline demo
label.

## 2. Provide the key

Export the variable in the shell that starts SolveBench:

```sh
export SOLVEBENCH_API_KEY='your-key'
solvebench --sample
```

During `bun run dev`, Bun also loads `.env` from the source root:

```sh
cp .env.example .env
# edit .env and set SOLVEBENCH_API_KEY=...
bun run dev
```

The installed launcher runs from its release directory, so an exported variable
is the reliable path there. Do not put the key value in `solvebench.config.json`.
Configuration files and `.env` are gitignored.

## 3. Ask from the assistant pane

Press **Ctrl+L**, type a message and press Enter. Ordinary text sends a message;
no slash command is required. The assistant automatically receives the opened
exercise, the code on screen and the latest test result.

- **Esc** leaves the input for the assistant reading pane.
- **f** toggles fullscreen while reading.
- Switching the opened task clears the previous task's chat.
- The model returns text only; it cannot edit files or run commands.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `(provider unavailable: missing-api-key)` | The named variable is empty | Export it before launching, or set it in `.env` for `bun run dev` |
| `(provider unavailable: http-error:401)` | Wrong key or endpoint | Check the variable and the provider account |
| `(provider unavailable: http-error:404)` | `baseUrl` is wrong | Include the API version root, for example `/v1` |
| `(provider unavailable: timeout)` | Slow or unreachable host | Raise `timeoutMs` or check the network |
| `(the model ran out of output budget while reasoning; raise maxTokens)` | Reasoning used the whole budget | Raise `maxTokens` |
| The header still says **Offline demo** | Configuration was not found or `kind` is not `http` | Check the workspace and global paths, then restart |

Malformed configuration is reported on stderr at startup and falls back to the
offline mock. The key value is never printed.
