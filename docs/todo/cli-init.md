# CLI Init Flow

Design the `cornerstore init` prompted setup experience. The user should be able to go from `npm create` to a running site without manually editing source files.

## Requirements

- Interactive prompts for essential project configuration (store name, Stripe API key, etc.)
- Generates `theme/theme.css` with all token defaults using palette references (see `docs/todo/theming-system.md`, Phase 7)
- No theme selection prompt — theming is a separate concern handled post-init
- Output: a project that builds and runs immediately after init completes

## Open Questions

- What configuration values does init need to collect?
- Where does collected config get written? (env file, config file, astro config, etc.)
- What validation happens during init vs. at build time?
- What does the post-init success message look like?
