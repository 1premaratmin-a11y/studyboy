# Design

<!-- impeccable:design-schema 1 -->

## Visual world

Margin is an editorial study canvas in a daylight paper shell. Warm ivory surfaces support long reading sessions; graphite is reserved for active navigation and decisive actions. Amber behaves like a teacher's mark: it identifies the active learning moment and is never ambient decoration.

## Color

| Token | Value | Use |
|---|---|---|
| `--shell` | `#ebe8df` | Navigation rail |
| `--shell-2` | `#e1ddd2` | Secondary chrome |
| `--paper` | `#f4f1e9` | Conversation canvas |
| `--paper-deep` | `#ebe7dc` | Conversation index and grouped controls |
| `--ink` | `#20201d` | Primary paper text |
| `--muted` | `#6f6e66` | Supporting paper text |
| `--amber` | `#e6a42c` | Active learning state and primary action |
| `--amber-strong` | `#c98205` | High-emphasis amber details |

## Typography

Outfit Variable is self-hosted and used throughout the new shell. It replaces the unavailable Satoshi package while preserving the selected wide geometric character. Headings use 540–580 weight and up to `-.04em` tracking. Conversation copy is 14–15px at 1.55–1.72 line-height. Metadata stays at 10px or larger.

## Layout

The desktop operates on a 12-column concept: 72px icon rail, 252px conversation index, fluid reasoning thread, and 326px artifact dock. The thread is always dominant. At 960px the dock folds away; at 800px the index folds away, leaving the thread edge-to-edge beside the persistent icon rail. The composer stays reachable at the bottom while the thread scrolls independently.

## Components

- Navigation uses one Phosphor icon family with consistent 21px sizing.
- Buttons and inputs use 9–16px corner radii according to scale; only compact status controls use pill geometry.
- Student messages use a warm-gray speech surface. Studyboy responses live directly on the paper with an amber author mark.
- The artifact dock contains Sources plus Notes, Quiz, Guide, Podcast, Match, and Map modes.
- Today, Notebook, Flashcards, Focus, Calendar, Tasks, Courses, Progress, and Settings share the same daylight system and operate on existing local data.

## Motion and states

The conversation index and artifact dock enter with a single short spatial transition. New messages fade and move 5px; the model reading state uses a three-dot timing sequence. Every motion collapses under `prefers-reduced-motion`. Inputs and buttons expose visible focus rings, disabled states, and pressed feedback. The local-model badge reports actual checking, warming, ready, offline, and desktop-only states.
