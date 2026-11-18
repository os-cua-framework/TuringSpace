# Tasks

The puzzle pages of TuringSpace-Bench. `run.html` loads one instance from its URL, draws it, and judges the first press
of **Verify**.

```
tasks/
├── run.html                       the page: run.html?task=<task>&seed=<seed>
├── core/                          the page runtime: the registry of the 125 tasks, seeding, the card, the frame clock
├── common/                        modules the tasks share: scenes, ray tracing, geometry, drawing
├── skins/                         the drawing style
├── A_spatial_relation/            one module per task, 25 per category
├── B_closed_loop_manipulation/
├── C_multi_step_planning/
├── D_mental_transformation/
├── E_spatiotemporal_reasoning/
└── assets/                        the photos, textures, fonts and icons of the 375 test instances (ATTRIBUTION.md)
```

## A task

Each module exports one task, which the page calls through

| Member | Role |
|---|---|
| `meta` | the task's name, category and card layout |
| `generate(rng, level, index, knobs)` | the instance of a seed: the scene, the question and the answer |
| `init(instance)` | the starting state |
| `drawBoard`, `drawPrompt`, `mount` | the picture and the instruction on the card (`mount` for 3D scenes) |
| `applyAction(state, action, instance, env)` | how a click, drag or key changes the state |
| `verify(state, instance)` | the verdict on the submitted state |
| `frames(instance)` | category E: the frames that **Next frame** steps through |

The random stream of an instance is seeded with `taskSeed(task, 1, seed)` (`core/rng.js`), so a URL always gives the same
puzzle. `char_click/mirror` is the variant `cue=mirror` of `char_click`.

## The page

`window.TuringSpace.getResult()` returns the verdict after the first press of Verify, and the instance then locks. In
category E the scene moves only when the player presses **Next frame** or one of the task's own buttons.
