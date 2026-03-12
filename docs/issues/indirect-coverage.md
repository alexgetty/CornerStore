# Indirect test coverage can mask bugs

## The problem

V8 coverage tracks which lines execute, not whether their behavior is directly asserted. A function tested only through a caller can show 100% coverage while its actual return values go unverified.

If the intermediate code changes to compensate for a broken inner function — a later guard catches bad data, a default value papers over a null — the coverage number stays green but the bug is hidden.

## Current state

`extractProductData` in `listings.ts` is tested entirely through `getListings()`. All 17 lines are covered, and the `getListings` tests do assert on outputs that trace back to specific branches (null image, metadata alt text, price handling). At this scale and complexity, the risk is low.

## The pattern risk

As the project grows, more internal helpers will emerge. If the default is "the pipeline test covers it," indirect coverage compounds. Functions get further from their assertions. Intermediate layers multiply. The gap between "line executed" and "behavior verified" widens.

## When to revisit

- When a bug slips past tests that showed 100% coverage
- When new internal helpers emerge with branching logic deeper than one call from the tested surface
- During the export audit — any function important enough to export deserves direct tests
