# Direct chat with a real model — setup

SolveBench works offline out of the box (a deterministic mock provider).
To talk to a real model, point it at an OpenAI-compatible endpoint.

## 1. Start the app once

```bash
cd ~/Documents/GitHub/solvebench
bun run dev
```

Press `Ctrl+L`, type `/config`, press Enter. It prints the current provider
state and the exact steps below.

## Ollama Cloud (verified working)

Ollama Cloud exposes an OpenAI-compatible endpoint, so it works without any
code change:

```json
{
  "provider": {
    "kind": "http",
    "baseUrl": "https://ollama.com/v1",
    "model": "glm-5.3-flash",
    "apiKeyEnv": "SOLVEBENCH_API_KEY",
    "maxTokens": 4096,
    "timeoutMs": 120000
  }
}
```

Get a key from https://ollama.com/settings/keys and list the available models:

```bash
curl https://ollama.com/v1/models -H "authorization: Bearer $SOLVEBENCH_API_KEY"
```

Models seen working: `glm-5.3-flash`, `gpt-oss:20b`, `deepseek-v4.1-flash`,
`nemotron-3-nano:30b`, `gemma4:31b`, `kimi-k2.6`, `minimax-m3`.

### Speed and thinking

Most Ollama Cloud models think before answering. Thinking costs latency and
fills the transcript with internal monologue. Set `reasoningEffort` to turn it
off:

```json
{ "reasoningEffort": "none" }
```

Measured on this machine (3 runs each, same question):

| Model | effort | avg latency | thinking in reply |
|---|---|---|---|
| deepseek-v4.1-flash | none | **~1.0s** | no |
| deepseek-v4.1-flash | low | ~1.4s | yes |
| gemma4:31b | none | ~1.5s | no |
| glm-5.3-flash | low | ~2.1s | no |
| glm-5.3-flash | none | ~7.0s | no |

`reasoningEffort` is optional: when omitted, the request is sent unchanged and
the provider default applies. On models without thinking it is ignored.

Note on token budget: thinking tokens count against `maxTokens`. Keep it at
4096 or higher. If the budget runs out mid-thought, `content` comes back empty;
the app then shows the reasoning with a note and marks the reply degraded
instead of displaying a blank answer.

## 2. Create the config file

Create `solvebench.config.json` in the repository you want to analyze (or in
`~/.config/solvebench/config.json` for all repositories):

```json
{
  "provider": {
    "kind": "http",
    "baseUrl": "https://api.openai.com/v1",
    "model": "gpt-4o-mini",
    "apiKeyEnv": "SOLVEBENCH_API_KEY"
  }
}
```

Notes:

- `apiKeyEnv` is the *name* of the environment variable. The key itself is
  never written to this file.
- `solvebench.config.json` is gitignored.
- `baseUrl` must be an OpenAI-compatible `/chat/completions` endpoint
  (OpenAI, OpenRouter, Groq, a local llama.cpp/Ollama OpenAI shim, ...).

## 3. Provide the key

Either export it in your shell:

```bash
export SOLVEBENCH_API_KEY=sk-...
```

Or put it in `.env` in the repository root (Bun loads `.env` automatically):

```bash
cp .env.example .env
# edit .env, set SOLVEBENCH_API_KEY=sk-...
```

## 4. Use it

```bash
bun run dev          # from the repo
pairs                # from anywhere, analyzes the current directory
pairs --repo ~/other # analyze another repository
pairs --no-index     # skip indexing on start
```

Then press `Ctrl+L`, type a message, and read the answer in the CHAT pane:

```
/chat what does rotateRefreshToken do?
/chat why does verify() fail when the token is empty?
/clear
```

`Ctrl+G` toggles between the NAVIGATOR and CHAT panes.

## Safety

- Chat never modifies files, never creates a transaction and never changes the
  driver. It only appends to the transcript.
- The model is told explicitly that it cannot modify the repository.
- If the provider is unreachable or the key is missing, replies are marked
  `(degraded)` and the app keeps working.
- Keys stay in the environment. `/config` reports whether a key is set, never
  its value.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `(degraded) missing-api-key` | key variable not set | export it, or add `.env` |
| `Cannot find module 'react/jsx-dev-runtime'` | ran `bun <path>/main.tsx` from another cwd | use `bin/pairs`, or `bun run dev` from the repo |
| `(degraded) http-error:401` | wrong key | check the value in `.env` |
| `(degraded) http-error:404` | `baseUrl` missing `/v1` or wrong host | verify the endpoint |
| `(degraded) timeout` | slow/unreachable host | raise `timeoutMs` in the config |
