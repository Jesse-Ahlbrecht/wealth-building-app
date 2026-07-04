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

## 5. Code Style

- No comments unless the WHY is non-obvious (hidden constraint, workaround, subtle invariant)
- No docstrings or multi-line comment blocks
- No trailing summaries in responses — user can read the diff
- Short, concise responses
