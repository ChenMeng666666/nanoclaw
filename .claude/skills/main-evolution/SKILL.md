---
name: main-evolution
description: Enable main NanoClaw process to use evolution system. Use this skill when you need to add evolution capabilities to the main process (not just agents), including submitting main process experiences, querying evolution library, and applying Gene strategies automatically from main process components.
---

# Main Evolution Skill

Enable the main NanoClaw process to use the evolution system just like agents can.

## Phase 1: Pre-flight

### Check if already applied

Read `.nanoclaw/state.yaml`. If `main-evolution` is in `applied_skills`, skip to Phase 3.

### Verify current evolution system

Check that these files exist and have the right content:
- `src/evolution-manager.ts` - should have `EvolutionManager` class
- `src/signal-extractor.ts` - should have `extractSignals` function

## Phase 2: Apply Code Changes

### Initialize skills system (if needed)

If `.nanoclaw/` directory doesn't exist yet:

```bash
npx tsx scripts/apply-skill.ts --init
```

### Apply the skill

```bash
npx tsx scripts/apply-skill.ts .claude/skills/main-evolution
```

This deterministically:
- Adds `src/main-evolution-applier.ts` (main evolution applier)
- Adds `submitMainExperience` method to `src/evolution-manager.ts`
- Adds `extractMainSignals` function to `src/signal-extractor.ts`
- Adds types to `src/types.ts`
- Integrates into `src/index.ts` with auto-initialization

### Validate code changes

```bash
npm run build
```

Build must be clean before proceeding.

## Phase 3: Verify Operation

### Test the integration

Run the development server:

```bash
npm run dev
```

Verify:
- Main process starts without errors
- Main process initializes the evolution system
- Logs show `Main evolution system initialized`

## What this enables

The main process can now:
1. Submit its own experiences to the evolution library
2. Query the evolution library for optimization strategies
3. Automatically apply Gene strategies based on signals from components

Components supported:
- Channel connections (Telegram, WhatsApp, etc.)
- Message routing
- Container runtime
- Database operations
