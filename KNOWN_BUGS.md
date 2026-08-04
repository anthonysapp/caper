# Known Bugs — packages/core

**No known open defects.** The 2026-08-02 audit backlog (≈50 defects) and every follow-up finding through 2026-08-04 are fixed — each test-first in its own conventional commit. (One reported item — a UICanvas lifecycle double-registration — was investigated and disproved: UICanvas composes `WithSignals(Factory())` directly and never touches the lifecycle mixin.)

CI guards the state on every push and PR: lint (`--max-warnings 0`), core + kitchen-sink typechecks, 373 tests, framework/plugin/demo builds, and a blocking headless boot smoke test.

Process: when a defect is found, add it here with severity + file:line; when fixed, remove it and update any matching wiki gotcha.
