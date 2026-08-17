# StudyBoy · AI Notes — Feature Context (living doc)

Tracks researched features (from real AI note tools) + implementation status.
Updated each loop iteration. Sources: Turbo AI/TurboLearn, NotebookLM (Gemini Notebook), RemNote, Quizlet, Notta, Otter.

## Done (shipped)

- **BYO API key** — frontend LLM client (`src/aiClient.ts`): Groq, OpenAI, OpenRouter, Anthropic (Messages API + `anthropic-dangerous-direct-browser-access`), custom OpenAI-compatible, local Ollama. Works in browser dev + Tauri desktop. Key in localStorage only.
- **Paste-source generate** — paste any text → notes with your key, no capture needed.
- **Format control** — cornell / outline / qcards.
- **Depth control** — concise / standard / detailed (section count + max_tokens).
- **Quiz mode (Turbo)** — generate MCQs from notes, pick options, check answers, score + explanations.
- **Quiz variety (Turbo)** — `src/aiClient.ts` `generateQuiz(kind, difficulty, focusTopic)`: MCQ / fill-in-the-blank / short-answer (AI-graded) / mixed. `gradeBlank` local fuzzy grader; `gradeShort` LLM grader. Topic focus + basic/std/exam difficulty selectors (`src/pages/AINotes.tsx` QuizView).
- **Study-guide mode (NotebookLM)** — overview + key terms + short-answer + essay Qs + glossary (`generateStudyGuide`, GuideView).
- **Study podcast (Turbo "notes → audio")** — `generatePodcastScript` writes a two-host dialogue; `src/components/PodcastPlayer.tsx` speaks it via Web Speech API (speechSynthesis): play/pause/stop, rate, per-host voice, waveform scrubber, transcript. `PodcastView` tab.
- **Live lecture transcription (Otter/Notta)** — `src/lib/speech.ts` `useTranscriber` wraps `webkitSpeechRecognition` for continuous mic capture + interim transcript; REC button commits transcript to source + logs a `NoteSource`. Browser-only (no Whisper dep).
- **Interactive matching activity (Turbo "interactive activities")** — `src/components/MatchGame.tsx` term↔definition game from Q-cards, timed + scored, pick-pair + lock + shake-on-wrong. `MatchView` tab.
- **Mind-map / key-term graph (NotebookLM)** — `src/components/MindMap.tsx` radial SVG (center=title, ring1=section topics, ring2=cue/qcard leaf). `map` tab.
- **Mastery / progress tracking per session (Turbo)** — live counts of new / learning / learned / due cards sourced from FSRS state; chip strip under tabs.
- **Rich note rendering (Turbo STEM)** — `src/lib/richtext.tsx`: KaTeX math (`$..$` / `$$..$$`), fenced code blocks, markdown tables, bold/italic/inline-code/links. Wired into summary, notes, cues, guide overview/keys/glossary, quiz blanks.
- **File upload extraction (Turbo multi-input)** — `src/lib/extract.ts`: PDF (pdfjs-dist) / DOCX (mammoth browser) / TXT-MD. Drag-drop + upload button append extracted text to source.
- **YouTube URL import (Turbo)** — `src/lib/youtube.ts`: `videoId` parse + `fetchTranscript` best-effort (CORS-limited; embeds player regardless). `LOAD YT` row.
- **Smart folders + search (Turbo)** — sessions grouped by course with color dots; search box filters by title/status/course. `folders` memo in AINotes.
- **Regenerate single section (TurboLearn editor)** — `regenerateSection` re-calls LLM for one topic grounded in existing notes; per-section ↻ button in CornellDoc.
- **Long-source chunking + merge (TurboLearn)** — `generateNotesChunked` splits oversized paste on paragraph boundaries, generates concise per-chunk notes, merges + de-dups by topic. Auto-used when source truncated.
- **Cloze-deletion cards (RemNote)** — `{{c1::term}}` generation toggle; pushed to deck as `kind:"cloze"`.
- **Language selector (Notta)** — output language control (notes, quiz, guide, podcast).
- **Source guard** — `capSource` cap + warn on oversized paste (16k chars).
- **AI chat / Q&A** — grounded tutor chat over the generated notes.
- **Q-cards → Flashcards deck** — push generated Q-cards into the FSRS Flashcards deck (RemNote-style integration).
- **Anki / CSV deck export (RemNote/Anki)** — tab-delim `front,back,kind` importable by Anki; CSV too. `src/pages/Flashcards.tsx`.
- **Copy markdown + export .md**.
- **TEST KEY** probe (Settings) + model presets per provider.
- **Rust no-CORS fallback** when in Tauri (OpenAI-compatible providers).
- **Pop visuals + motion (everywhere)** — color-coded section cards, flip Q-cards, shimmer forge, staggered pop-in, glow engine badge, tab-swap fade, panel-in, gradient accent rail, quiz ok/bad pulse, rec-pulse, podcast reel spin + waveform, mind-map hover scale, input focus glow, match shake. `prefers-reduced-motion` respected globally.

## Backlog (not built — infeasible for personal-use demo)

| Feature | Source | Why skipped |
|---|---|---|
| Real-time collaboration / share | TurboLearn | needs multi-tenant backend; personal-use demo |
| Books / study-guide library | TurboLearn | needs curated content library + licensing |
| Cross-device cloud sync | TurboLearn | needs backend; Tauri desktop + browser dev both supported, no cloud sync |
| Audio overview via hosted TTS | NotebookLM | Web Speech API used instead (local, no upload) |
| Hosted Whisper audio-file STT | Otter/Notta | browser Web Speech used for live mic; file STT would need a model |

## Turbo AI feature parity (this iteration)

| Turbo feature | Status |
|---|---|
| AI lecture notes from audio/PDF/YouTube/text | ✅ live mic + PDF/DOCX/text upload + paste; YouTube best-effort |
| Rich formatted notes (tables/equations/code) | ✅ KaTeX + tables + code + inline fmt |
| Auto flashcards + spaced repetition | ✅ FSRS-lite + deck + progress tracking |
| Practice quizzes (MCQ / fill / short) + difficulty + topic focus | ✅ |
| Study podcasts (notes → audio) | ✅ Web Speech TTS, length + voices |
| AI chat / tutor | ✅ |
| Interactive activities | ✅ matching game |
| Smart folders + search | ✅ |
| Single-section regenerate | ✅ |
| Long-source handling | ✅ chunk + merge |
| Inline editor | ✅ editable title + per-section regen (rich editable inline pending) |
| Mind-map | ✅ radial SVG |
| Collaboration | ❌ (no backend) |
| Books library | ❌ (no content) |

## Loop log

- iter 1: shipped core BYO-key AI notes + quiz + chat + qcards→deck + pop visuals. Build + lint clean.
- iter 2: research → study guide + cloze + language + source guard + CSV export. (in progress)
- iter 3: turbo.ai feature parity sweep — rich render (KaTeX/code/tables), quiz variety (fill/short/mixed + difficulty + topic), PDF/DOCX/text upload, YouTube import, smart folders + search, section regen, long-source chunk+merge, study podcast (TTS), live lecture transcription (Web Speech), matching activity, mastery tracking, mind-map, full motion + color polish. Build + lint clean. /code-review pending.
- iter 4: /code-review workflow (29 agents, 23 confirmed findings) → all patched. Correctness: persistDoc reuses doc id (no stale duplicates), toggleRecord awaits onend (no truncation), PodcastPlayer onvoiceschanged + refs (no stale rate/voice), PDF join spacing, saveAiConfig persists key/local* , MatchGame effect fix. Security: `<source>` prompt-injection delimiters across all generators, richtext javascript:/data: link sanitization. A11y: aria-live (toast/chat/match), role=alert (genError), role=math+aria-label (KaTeX), role=img+title (mind-map), aria-current (session list/sidebar/mindmap), radiogroup (SegGroup), aria-pressed (match cells). Study-method tabs moved UPFRONT (visible on session select, not gated behind generated doc). Visual: Balatro-style `.btn3d` 3D button system (raised lip + sink-on-press, 8 accent lips) across PixelButton/nav/seg/quiz/podcast/REC/cloze/d-pad/footer/palette; sidebar reskinned to solarized white (base2). WebView2 cache-clear + build-stamp footer to defeat stale-window confusion. Build clean.