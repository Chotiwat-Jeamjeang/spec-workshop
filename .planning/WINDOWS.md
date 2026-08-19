---
schema_version: 1
open_count: 1
waived_count: 0
fixed_count: 0
total_count: 1
last_updated: 2026-08-19T17:45:19.898Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 01 | stub | views/report.ejs |  | dropdown/error render branches left as marked empty HTML-comment regions for plan 01-02 to fill | open |  | 2026-08-19T17:45:19.898Z |  |

````json
[
  {
    "id": 1,
    "kind": "stub",
    "phase": "01",
    "file": "views/report.ejs",
    "line": null,
    "description": "dropdown/error render branches left as marked empty HTML-comment regions for plan 01-02 to fill",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-19T17:45:19.898Z",
    "resolved_at": null
  }
]
````
