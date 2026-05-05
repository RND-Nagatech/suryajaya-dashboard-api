# Errors

## [ERR-20260314-001] node-runtime-missing

**Logged**: 2026-03-14T10:41:48+07:00
**Priority**: medium
**Status**: pending
**Area**: infra

### Summary
Validasi syntax via `node --check` gagal karena binary `node` tidak tersedia di environment terminal.

### Error
```text
zsh:1: command not found: node
```

### Context
- Command attempted: `node --check src/server.js` dan file sumber lain
- Tujuan: validasi syntax JavaScript tanpa menjalankan server
- Environment: workspace lokal Codex tanpa runtime Node pada PATH

### Suggested Fix
Pastikan Node.js tersedia di PATH, atau sediakan langkah fallback untuk validasi statis ketika runtime belum terpasang.

### Metadata
- Reproducible: yes
- Related Files: src/server.js

---

## [ERR-20260422-002] date-flag-incompatible

**Logged**: 2026-04-22T12:57:30+07:00
**Priority**: low
**Status**: pending
**Area**: infra

### Summary
The GNU-style `date --iso-8601=seconds` flag failed on macOS; the local shell expects `date -Iseconds` instead.

### Error
```text
date: illegal option -- -
```

### Context
- Command attempted: `date --iso-8601=seconds`
- Environment: macOS shell in the Codex workspace
- Purpose: capture a timestamp for learnings/todo updates

### Suggested Fix
Use `date -Iseconds` on macOS or branch on platform-specific `date` flags when scripting portable workflows.

### Metadata
- Reproducible: yes
- Related Files: .learnings/LEARNINGS.md

---

## [ERR-20260422-003] node-check-on-jsx

**Logged**: 2026-04-22T13:00:08+07:00
**Priority**: low
**Status**: pending
**Area**: frontend

### Summary
`node -c` cannot validate `.jsx` files directly because Node treats the extension as unknown module syntax in this environment.

### Error
```text
TypeError [ERR_UNKNOWN_FILE_EXTENSION]: Unknown file extension ".jsx"
```

### Context
- Command attempted: `node -c frontend/src/App.jsx && node -c frontend/src/components/AgingPage.jsx && ...`
- Purpose: quick syntax validation for React source files
- Environment: Node 22 in the Codex workspace

### Suggested Fix
Use the bundler build step or a JSX-aware parser/linter instead of `node -c` for React source files.

### Metadata
- Reproducible: yes
- Related Files: frontend/src/App.jsx, frontend/src/components/AgingPage.jsx

---

---
