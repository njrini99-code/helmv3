# 2026-10-25 — Ask: a validated, interactive strokes gained visual

## 2026-10-25 — The chat can show one scene it built from reads it already made

```text
Design package: design/handoff v3 (unchanged); owner brief "Agentic Golf Intelligence and Generative Visual Workspace", 2026-10-25, phase 1
PR/commit:      branch agent/coachhelm-ask
Contract IDs:   CH-13853 (new)
Actions:        none (show_visual is display only; it writes to the stream, never to the domain)
Data impact:    none
Held items:     none
```

### Changed

- Flag `coachhelm_visual_artifacts_v1` (release; production off, preview and development on). Off: the `show_visual`
  tool is not registered and the thread draws its generic evidence exactly as before.
- Every read tool now returns an `evidence_ref` the model can name. `show_visual` takes a scene (`sg_anatomy`), a title,
  those refs and optional words about a leg; trusted code (`visuals/compile.ts`) resolves the reads, refuses anything it
  cannot draw honestly (another player, another window, two values for one leg, fewer than two legs, a failed read, a note
  with a figure in it) and returns a hashed artifact. The figures are stored in the message as `data-visual-artifact`,
  and `restore.ts` replays it, so a reload draws the same chart.
- The thread draws it as `CoachVisualArtifact`: each part of the game is a button that opens its sample, arrow keys move
  between them, View as table shows the same figures, and the total says whether the four parts add up to it. Choosing a
  leg moves opacity only, on the base beat; nothing animates on first paint and no model call is made.
- The generic evidence blocks for the reads an artifact was built from are not drawn beside it.
- Preview: `/clubhouse-preview/coachhelm-ask?state=visual`.
