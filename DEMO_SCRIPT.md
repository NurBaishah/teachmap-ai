# TeachMap AI Demo Script

## 90-Second Version

**0:00-0:10 - Problem**

Students often do not know what they do not know. They may recognize the right
answer, but still explain the concept with the wrong reasoning.

**0:10-0:20 - Product**

TeachMap AI flips tutoring around. The student teaches first, and AI listens for
the misconception underneath the explanation.

**0:20-0:45 - Live Walkthrough**

Load the sample operating systems lecture. The app creates a concept map for
Virtual Memory and starts with Page Faults. Send the prefilled student answer:
"A page fault happens when a program accesses memory it is not allowed to
access." TeachMap asks a follow-up instead of immediately giving the answer.

**0:45-1:05 - Reveal**

Run diagnosis. TeachMap detects the misconception: the student is treating every
page fault as illegal memory access. The Page Faults node turns red and the app
shows the missing idea: a valid page can be on disk instead of RAM.

**1:05-1:25 - Repair**

Start the 10-question mastery check. The questions test boundaries, examples,
related concepts, and the corrected idea. Green requires 8 out of 10, so mastery
is evidence-based.

**1:25-1:30 - Close**

TeachMap AI: teach what you know, discover what you do not.

## Custom Topic Backup Demo

Use this if a judge asks whether it works beyond the sample.

1. Choose **Try my own topic**.
2. Upload a text-based PDF or paste notes.
3. Confirm the concept TeachMap auto-fills.
4. Give a flawed explanation on purpose.
5. Let Gemini ask one or two follow-up questions.
6. Run diagnosis and show that the response is specific to the uploaded topic.

## Devpost Media Checklist

- First screen with "Polished sample" and "Try my own topic".
- Knowledge map after loading the sample.
- TeachBack interview with an AI follow-up question.
- Red misconception result.
- 10-question mastery check.
- Green mastery map with the evidence report.
