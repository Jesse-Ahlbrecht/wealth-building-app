# Agent Coding Philosophy

## Prototype stance

This is an **early prototype**. Anything can be scrapped and rewritten.

- Prefer the **fastest, simplest** solution; write clean initial code, not migration layers
- **Never care about backward compatibility** — no deprecation shims, dual code paths, or keeping old APIs working
- Keep the application modular, but do not over-abstract for hypothetical futures

Long-form hosting and encryption plans live in `wealth.plan.md` — not binding for day-to-day implementation.

## 1. Think Before Coding

Before implementing: state assumptions explicitly, ask if uncertain. Present multiple interpretations — dont pick silently. Say if simpler approach exists. If unclear, stop and ask.

## 2. Simplicity First

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked
- No abstractions for single-use code
- No unrequested flexibility or configurability
- No error handling for impossible scenarios
- If 200 lines could be 50, rewrite it

Ask: "Would a senior engineer call this overcomplicated?" If yes, simplify.

## 3. Surgical Changes

Touch only what you must. Clean up only your own mess.

- Dont improve adjacent code, comments, or formatting
- Dont refactor things that arent broken
- Match existing style even if youd do it differently
- Notice unrelated dead code? Mention it, dont delete it
- Remove imports/vars/functions YOUR changes made unused
- Every changed line should trace to the users request

## 4. Goal-Driven Execution

Transform tasks into verifiable goals. For multi-step tasks, state a brief plan:

```
1. [step] → verify: [check]
2. [step] → verify: [check]
```

"Fix the bug" → write a test that reproduces it, then make it pass. Loop until verified.

**Changes must be visible in the running app.** After backend or frontend edits, restart the affected service so the user can review in the browser — do not assume hot reload picked up the change. Use the `run-app` skill: backend `./run_backend.sh` (port 5001), frontend `npm start` in `frontend/` (port 3000). If unsure which service changed, restart both.

**Rule and category changes need a backfill.** Editing `categories_*.json`, `merchants.de_ch.json`, or `bank_category_map.json` only affects new imports. Always run the matching backfill script on the tenant (dry-run first, then apply) and restart the backend so the user sees updated categories in the app.

## 5. Code Style

- No comments unless the WHY is non-obvious (hidden constraint, workaround, subtle invariant)
- No docstrings or multi-line comment blocks
- No trailing summaries in responses — user can read the diff
- Short, concise responses
