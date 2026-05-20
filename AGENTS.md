## Implementation discipline

- Prefer the smallest correct change that matches the existing repository style.
- Do not add defensive code unless there is a concrete failure mode observed in this repository.
- Do not add generic try/catch, retries, silent fallbacks, null guards, or wrapper layers just to be “safe”.
- If a guard is added, explain exactly which real input, state, or historical bug it protects against.
- Do not duplicate logic from another feature just because it looks similar.
- When asked to "reference X", first separate:
  - reusable shared logic
  - business-specific differences
- If reusable logic appears in 2+ places or clearly belongs to existing shared layers, extract or extend shared helpers instead of copy-pasting.
- Before creating a new helper/module, check whether the repository already has the right abstraction in:
  - shared/*
  - utils/*
  - cloudfunctions/_shared-src/*
- For this repository, always trace the chain:
  - page -> wx.cloud.callFunction -> cloud function -> database collection
- Frontend must not directly access database logic.
- If touching poster or poem-pancake related logic, check both frontend re-exports and backend shared helpers together.
- If adding/changing content types or shared poster/poem-pancake logic, follow ENGINEERING_CHECKLIST.md and run:
  - npm run sync:cloud-shared
  - npm run verify:engineering

## Output requirements before coding

Before writing code, always output:
1. requirement understanding
2. affected chain
3. reuse/extraction decision
4. minimal file change plan
5. risks and validation plan

Do not start patching until the above is clear.
