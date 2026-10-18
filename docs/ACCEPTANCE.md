# Engineering Proxy v0.1 — Acceptance & evidence

## Implemented and unit-testable

| ID | Requirement | Current evidence |
|---|---|---|
| AC01 | Never register Ponytail command names or overwrite Ponytail mode | Extension test |
| AC02 | Add policy under `engineering-proxy`, preserve `ponytail` section | Extension test |
| AC03 | Avoid duplicate policy injection in structured/array/string prompts | Extension test |
| AC04 | Work when Ponytail is not installed | Extension test |
| AC05 | Per-repo disable; missing/invalid config never crashes OMP | Extension test |
| AC06 | Return spacing skips first-statement guard clauses | ESLint-rule test |
| AC07 | Return spacing reports missing/excess blank lines | ESLint-rule test |
| AC08 | Function spacing recognizes declarations, exported and arrow functions | ESLint-rule test |
| AC09 | Nested-if preference is WARN only and does not auto-rewrite | ESLint-rule test |
| AC10 | Review launches only on explicit command | Extension test |

## NOT VERIFIED — live environment required

- OMP 18.x extension module load and marketplace installation on macOS and WSL.
- Live Ponytail lite/full/ultra/off coexistence across session switching and subagents.
- Existing ESLint (and TS parser) integration in each target repository; source mocks are not ESLint integration evidence.
- Compatibility with all other installed extensions, project-specific rules, and runtime performance.
- Diff-scoped post-write style diagnostics and protected critical-flow code review are not implemented in v0.1.

The plugin does not hold approval authority or change Git/production state. Keep human review and repository CI authoritative.
