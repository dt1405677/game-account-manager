---
description: Fast Coding Mode - Skip planning/verification overhead
---

# Fast Coding Mode ⚡

Use this workflow to maximize speed and token efficiency for routine coding tasks.

## 1. Quick Start 🚀
- **Skip Planning Artifacts**: Do not create `task.md` or `implementation_plan.md` for requests involving < 5 files or simple bug fixes.
- **Analyze Directly**: Identify necessary changes immediately.

## 2. Direct Implementation 🛠️
- **Batch Edits**: Execute all necessary file edits in as few tool calls as possible (prefer `multi_replace_file_content`).
- **Assume Competence**: Assume the user knows their intent. Avoid defensive clarifying questions for standard requests.

## 3. Minimal Verification 🔍
- **Syntax Check Only**: Verify code syntax where feasible.
- **NO Browser/Server Tests**: Do NOT attempt to launch local servers or use browser tools for UI verification.
- **User Verification**: Explicitly state: *"Changes applied. Please verify locally."*

## 4. Documentation 📄
- **Skip Walkthrough**: Do not create `walkthrough.md`.
- **Brief Summary**: Provide a concise list of modified files and a 1-line summary of changes in the final response.

---
**Trigger**: When the user requests speed, token efficiency, or simple bug fixes.
