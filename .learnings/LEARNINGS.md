# Learnings

## [LRN-20260314-001] best_practice

**Logged**: 2026-03-14T10:41:48+07:00
**Priority**: low
**Status**: pending
**Area**: infra

### Summary
Cek ketersediaan runtime dasar lebih awal sebelum menjadwalkan validasi CLI berbasis language runtime.

### Details
Saat analisis repo backend Node.js, upaya verifikasi syntax dengan `node --check` langsung gagal karena `node` tidak ada di PATH. Untuk workflow berulang, lebih efisien melakukan probe awal seperti `which node` atau `node -v` sebelum merencanakan validasi berbasis runtime.

### Suggested Action
Tambahkan kebiasaan probe runtime lebih awal pada analisis repo agar langkah validasi bisa disesuaikan sejak awal.

### Metadata
- Source: error
- Related Files: src/server.js
- Tags: workflow, validation, nodejs
- Pattern-Key: validate.runtime-availability
- Recurrence-Count: 1
- First-Seen: 2026-03-14
- Last-Seen: 2026-03-14

---

## [LRN-20260422-002] correction

**Logged**: 2026-04-22T12:57:30+07:00
**Priority**: medium
**Status**: pending
**Area**: frontend

### Summary
Inline settings panels on a TV dashboard can crowd the main analysis area; dialog-based settings preserve the primary drilldown viewport.

### Details
For the aging dashboard, showing the aging settings block inline caused the bucket list and item list to fall below the visible area on a large screen. Moving the configuration UI into a modal dialog keeps the analysis surface readable while still allowing edits on demand.

### Suggested Action
Prefer dialog or inspector-style settings for long configuration forms on TV-first dashboards, and keep the default viewport focused on analysis content.

### Metadata
- Source: user_feedback
- Related Files: frontend/src/components/AgingPage.jsx, frontend/src/styles.css
- Tags: frontend, dashboard, tv-ui, modal, layout
- Pattern-Key: dashboard.settings.dialog-default
- Recurrence-Count: 1
- First-Seen: 2026-04-22
- Last-Seen: 2026-04-22

---

## [LRN-20260423-001] best_practice

**Logged**: 2026-04-23T15:52:18+07:00
**Priority**: medium
**Status**: pending
**Area**: frontend

### Summary
TV dashboards work better when long configuration surfaces are moved into modal dialogs and the modal chrome is intentionally higher-contrast than the background.

### Details
In the aging analysis page, keeping settings inline made the analysis viewport feel cramped and buried the bucket/item lists. Moving settings into a modal preserves the operational view. A darker backdrop and solid white dialog make the dialog more legible against the dashboard atmosphere.

### Suggested Action
Default to compact summary headers plus modal/inspector-style configuration for secondary controls on command-center dashboards.

### Metadata
- Source: user_feedback
- Related Files: frontend/src/components/AgingPage.jsx, frontend/src/styles.css
- Tags: frontend, ui, dashboard, modal, accessibility
- Pattern-Key: dashboard.settings.modal-contrast
- Recurrence-Count: 1
- First-Seen: 2026-04-23
- Last-Seen: 2026-04-23

---

## [LRN-20260423-002] best_practice

**Logged**: 2026-04-23T16:07:04+07:00
**Priority**: medium
**Status**: pending
**Area**: frontend

### Summary
Manual refresh works better than background polling for completed aging jobs on a TV dashboard.

### Details
The aging page is easier to read when it does not keep re-requesting job state after completion. Users can focus on the grouped results and only refresh when they explicitly want a new snapshot.

### Suggested Action
Use explicit refresh actions for long-running analytical jobs on command-center screens, and reserve background polling for actively running jobs only when the user needs live progress.

### Metadata
- Source: user_feedback
- Related Files: frontend/src/hooks/useAgingStocks.js, frontend/src/components/AgingPage.jsx
- Tags: frontend, polling, dashboard, ux, tv-ui
- Pattern-Key: dashboard.refresh.manual-after-complete
- Recurrence-Count: 1
- First-Seen: 2026-04-23
- Last-Seen: 2026-04-23

---
