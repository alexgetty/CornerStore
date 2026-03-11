# Pre-commit hook: LLM doc review

## Goal

Automate documentation freshness checks. A pre-commit hook runs an LLM review of staged changes against existing docs and flags potential stale references before they ship.

## Approach

- Pre-commit hook triggers on staged changes to `src/**` files
- Sends the diff + relevant doc files (SETUP.md, any referenced guides) to an LLM
- LLM checks: do these code changes invalidate or contradict anything in the docs?
- If yes, block the commit with a list of suspected stale sections
- If no, pass silently

## Open Questions

- Which LLM endpoint? Local model, API call, or Claude Code hook?
- How to scope which docs are "relevant" to a given diff without sending everything?
- Performance — acceptable latency for a pre-commit hook?
- False positive tolerance — too aggressive blocks will get the hook disabled

## Status

Todo — not started. Process rule added to CLAUDE.md in the meantime as a manual safeguard.
