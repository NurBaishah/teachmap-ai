# TeachMap AI

**Teach what you know. Discover what you do not.**

TeachMap AI is a hackathon prototype for a different kind of AI tutor. Instead
of immediately explaining a topic to the student, TeachMap asks the student to
teach the concept first. It then probes their reasoning with real AI follow-up
questions, detects the hidden misconception underneath an incomplete answer,
and updates a visual mastery map.

Live demo: https://teachmap-ai.vercel.app

Project repository: https://github.com/NurBaishah/teachmap-ai

The demo focuses on one memorable loop:

1. Upload or load an operating systems lecture.
2. Generate a virtual memory concept map.
3. Teach the AI about Page Faults in an ongoing interview.
4. Keep answering deeper AI follow-up questions until you are ready for diagnosis.
5. Watch the misconception turn the concept node red.
6. Complete a 10-question mastery check, see the repair queue if answers are
   missed, and finish with a copyable evidence report when the node turns green.

There is also a **Try my own topic** mode. In that mode, you can upload a
text-based PDF or enter a concept, one likely misconception, and the correct
idea. TeachMap reads selectable PDF text in the browser, auto-fills the topic
setup, then runs the same TeachBack -> probe -> misconception -> challenge ->
mastery flow using your own topic. The custom flow uses Gemini-backed
structured AI routes, with a local fallback kept only for reliability.
The mastery status is evidence-based: the concept stays developing/red until
the student submits the 10-question check, moves to developing when the score
shows partial repair, and turns green only after the student reaches 8/10.

## Why It Matters

Students often think they understand a concept because they can recognize the
right answer. TeachMap tests something deeper: whether they can explain the idea
clearly enough to reveal the reasoning behind it.

Most AI tutors answer first. TeachMap listens first.

## Current Prototype

This version is a fully clickable guided demo. The polished sample uses a
prepared diagnosis for a smooth judge walkthrough, while the custom topic flow
can read an uploaded PDF through PDF.js, post the extracted text to
`/api/pdf-intake`, run a multi-round AI teachback interview through
`/api/follow-up`, and post the full transcript to `/api/analyze`. Those routes
run against Gemini and return structured JSON that drives the interface:

```json
{
  "concept": "Page Faults",
  "mastery_score": 42,
  "misconception": "Every page fault means illegal memory access.",
  "missing_piece": "A valid virtual page can be on disk instead of RAM.",
  "teachback_interview": "student answered 3 AI follow-up rounds",
  "challenge_question": "Which answer fixes this misconception?",
  "mastery_check": "8/10 correct required",
  "status_evidence": "10/10 correct meets the 8/10 mastery threshold.",
  "next_action": "targeted_challenge"
}
```

## Built With

- React
- TypeScript
- Vinext
- Tailwind CSS
- shadcn/ui
- Lucide React
- PDF.js
- Gemini API
- Vercel

## Run Locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

To use the Gemini API path, set `GEMINI_API_KEY` before running or deploying.
TeachMap defaults to `gemini-3.6-flash`; you can override it with
`GEMINI_MODEL`.

## Deploy On Vercel

Set the Vercel build command to `npm run build` and the output directory to
`.output`. Add `GEMINI_API_KEY` as an environment variable so the custom-topic
AI routes can run live.

## Test Your Own Topic

1. Run the app locally.
2. Choose **Try my own topic**.
3. Upload a text-based PDF or paste notes into the lecture-notes field.
4. Check the concept and correct idea that TeachMap fills in.
5. Teach the concept in your own words for several rounds.
6. Click **Find what to fix**, then complete the 10-question mastery check.

Scanned/image-only PDFs may not contain selectable text yet. Use OCR or paste
the notes manually for those files.

## Demo Script

Open with:

> Students often do not know what they do not know.

Then show:

- Use the polished sample for the operating systems demo.
- Or choose **Try my own topic** and upload a PDF to auto-fill the setup.
- Follow the guided steps until the concept turns from red to green.
- Send the student's explanation and let TeachMap ask deeper follow-up questions.
- Continue the interview, then choose diagnosis when ready.
- Show the misconception result and red concept node.
- Answer the concept-specific 10-question mastery check and show that 8/10 is required for green.
- If the score misses the threshold, show the repair queue.
- End on the green mastery node and copy the evidence report.

Close with:

> TeachMap AI turns misconceptions into mastery by making students teach first.

## Next Steps

- Add OCR for scanned or image-only PDFs.
- Add classroom accounts and saved learning histories.
- Add voice explanations for spoken TeachBack sessions.
- Save longitudinal mastery maps per student.
- Support more subjects beyond operating systems.
