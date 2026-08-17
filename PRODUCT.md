# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Tauri 2 (Rust backend) + React 19 + TypeScript + Vite 8 + Tailwind CSS 3 + Dexie (IndexedDB). Desktop app targeting 1280x820 minimum. Ollama for local LLM (llama3.2).

## Users

University students studying for exams. They paste lecture notes, upload PDFs/DOCX, import YouTube transcripts, or record live lectures, then generate study materials: Cornell notes, quizzes, study guides, flashcards, podcasts, mind maps, and AI chat tutoring. They also track focus sessions with pomodoro + app blocking, manage todos, sync Canvas LMS assignments, and review FSRS-scheduled flashcards.

## Purpose

Replace 5-6 separate study tools (NotebookLM, TurboLearn, Quizlet, Otter, Forest, Todoist) with one offline-first desktop app that runs LLM inference locally via Ollama — no API keys, no cloud, no subscription.

## Mechanism

Local-first: all data in IndexedDB, all LLM inference via Ollama on localhost. The app auto-starts llama3.2 on boot. Study materials are generated from source text using structured JSON prompts, with chunking for long sources, prompt-injection guards, and format/depth/language controls.

## Constraints

- Must work offline (no cloud dependency required)
- Must run at 1280x820 resolution without scrolling horizontally
- Tauri desktop app (not a website) — window chrome, native menus
- Warm amber accent (#f59e0b), dark mode, balanced density
- Single-panel layout (content fills the main area edge-to-edge)
- All features preserved: Study Chat (7 tabs), Flashcards, Focus, Calendar, Progress, Courses, Todos, Notebook, Settings, Canvas LMS

## Voice

Direct, practical, student-facing. Controls name their action. Errors name the problem and the recovery. No marketing tone.