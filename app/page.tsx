'use client';

import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  CircleDot,
  ClipboardCheck,
  Copy,
  FileText,
  GraduationCap,
  HelpCircle,
  Lightbulb,
  ListChecks,
  Map,
  MessageSquareText,
  Play,
  RotateCcw,
  Send,
  Sparkles,
  Target,
  UploadCloud,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress, ProgressLabel } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

type WebMcpTool = {
  name: string;
  title?: string;
  description: string;
  inputSchema: object;
  annotations?: {
    readOnlyHint?: boolean;
    untrustedContentHint?: boolean;
  };
  execute(
    input: unknown,
  ): Record<string, unknown> | Promise<Record<string, unknown>>;
};

declare global {
  interface Document {
    modelContext?: {
      registerTool(
        tool: WebMcpTool,
        options?: { signal?: AbortSignal },
      ): void | Promise<void>;
    };
  }
}

type Stage =
  | 'upload'
  | 'map'
  | 'teach'
  | 'probe'
  | 'result'
  | 'challenge'
  | 'mastered';

type Mode = 'demo' | 'custom';

type NodeStatus =
  | 'not-ready'
  | 'testing'
  | 'developing'
  | 'misconception'
  | 'mastered';

type ChallengeOption = {
  id: string;
  label: string;
  detail: string;
};

type ChallengeItem = {
  id: string;
  focus: string;
  question: string;
  options: ChallengeOption[];
  correctOptionId: string;
};

type ChallengeAnswers = Record<string, string>;

type TeachTurn = {
  id: string;
  role: 'ai' | 'student';
  text: string;
  focus?: string;
  feedback?: string;
};

type FollowUpResponse = {
  question: string;
  focus: string;
  feedback: string;
  source: 'gemini' | 'local_fallback';
  warning?: string;
};

type LearningCase = {
  lectureName: string;
  unit: string;
  concept: string;
  related: [string, string];
  misconception: string;
  missingPiece: string;
  studentExplanation: string;
  probeQuestion: string;
  probeResponse: string;
  challengeQuestion: string;
  challengeOptions: ChallengeOption[];
  correctOptionId: string;
};

type CustomDraft = {
  lectureName: string;
  unit: string;
  concept: string;
  relatedA: string;
  relatedB: string;
  misconception: string;
  correction: string;
  notes: string;
};

type PdfStatus = 'idle' | 'reading' | 'ready' | 'error';

type CopyStatus = 'idle' | 'copied' | 'error';

type AnalysisSource =
  | 'not_run_yet'
  | 'scripted_demo'
  | 'gemini'
  | 'local_fallback';

type AnalyzeResponse = {
  concept: string;
  mastery_score: number;
  misconception: string;
  missing_piece: string;
  probe_question: string;
  challenge_question: string;
  challenge_options: ChallengeOption[];
  correct_option_id: string;
  feedback: string;
  source: 'gemini' | 'local_fallback';
  warning?: string;
};

type PdfIntakeResponse = {
  unit: string;
  concept: string;
  correction: string;
  likely_misconception: string;
  related_concepts: string[];
  summary: string;
  source: 'gemini' | 'local_fallback';
  warning?: string;
};

type StageInfo = {
  id: Stage;
  title: string;
  navLabel: string;
  icon: LucideIcon;
  headline: string;
  supporting: string;
  nextLabel: string;
};

const defaultCase: LearningCase = {
  lectureName: 'Operating Systems Week 7 - Virtual Memory.pdf',
  unit: 'Virtual Memory',
  concept: 'Page Faults',
  related: ['Address Translation', 'TLB'],
  misconception: 'Every page fault means illegal memory access.',
  missingPiece: 'A valid virtual page can be on disk instead of RAM.',
  studentExplanation:
    "A page fault happens when a program accesses memory it isn't allowed to access.",
  probeQuestion:
    'What if the address is valid, but the page is currently on disk instead of RAM?',
  probeResponse:
    'I think it still means the program touched memory that was not allowed, because the page was not in RAM.',
  challengeQuestion:
    'A process accesses a valid virtual address. The page table says the page exists, but it is on disk instead of RAM. What is this?',
  challengeOptions: [
    {
      id: 'illegal',
      label: 'Illegal memory access',
      detail: 'This would mean the address is not allowed for the process.',
    },
    {
      id: 'resident',
      label: 'Recoverable page fault',
      detail:
        'Correct: the address is valid, but the page must be loaded into RAM.',
    },
    {
      id: 'tlb',
      label: 'TLB miss',
      detail:
        'This is about a missing translation cache entry, not a page on disk.',
    },
  ],
  correctOptionId: 'resident',
};

const initialDraft: CustomDraft = {
  lectureName: 'My lecture notes',
  unit: 'My subject',
  concept: '',
  relatedA: '',
  relatedB: '',
  misconception: '',
  correction: '',
  notes: '',
};

const stageRank: Record<Stage, number> = {
  upload: 0,
  map: 1,
  teach: 2,
  probe: 3,
  result: 4,
  challenge: 5,
  mastered: 6,
};

const stageOrder: Stage[] = [
  'upload',
  'map',
  'teach',
  'probe',
  'result',
  'challenge',
  'mastered',
];

const judgeDemoSteps = [
  'Start the polished sample.',
  'Send the prefilled student answer.',
  'Let the AI ask deeper questions.',
  'Reveal the misconception, pass 8/10, and show the red-to-green map.',
];

const ownTopicSteps = [
  'Upload a text-based PDF or paste notes.',
  'Check the auto-filled concept and correct idea.',
  'Teach the AI for a few rounds.',
  'Run diagnosis and take the 10-question mastery check.',
];

function clean(value: string, fallback: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function buildCustomCase(draft: CustomDraft): LearningCase {
  const concept = clean(draft.concept, 'My Concept');
  const unit = clean(draft.unit, 'My Subject');
  const misconception = clean(
    draft.misconception,
    `${concept} is being explained with an incomplete or mixed-up idea.`,
  );
  const correction = clean(
    draft.correction,
    `The key correction for ${concept} should be stated clearly.`,
  );
  const noteHint = draft.notes.trim().split(/\s+/).slice(0, 5).join(' ');

  return {
    lectureName: clean(draft.lectureName, 'My lecture notes'),
    unit,
    concept,
    related: [
      clean(draft.relatedA, `${concept} basics`),
      clean(draft.relatedB, `${concept} confusion`),
    ],
    misconception,
    missingPiece: correction,
    studentExplanation: `I think ${concept} means ${misconception}`,
    probeQuestion: `How is that different from this key idea: ${correction}`,
    probeResponse:
      noteHint.length > 0
        ? `I am trying to connect it with: ${noteHint}.`
        : `I think the correction is related, but I am not totally sure how.`,
    challengeQuestion: `Which answer best fixes the confusion about ${concept}?`,
    challengeOptions: [
      {
        id: 'misconception',
        label: misconception,
        detail: 'This repeats the confusion instead of fixing it.',
      },
      {
        id: 'correction',
        label: correction,
        detail: 'This directly addresses the missing idea.',
      },
      {
        id: 'memorize',
        label: `Just memorize the definition of ${concept}.`,
        detail: 'This may help recall, but it does not repair the reasoning.',
      },
    ],
    correctOptionId: 'correction',
  };
}

const masteryThresholdRatio = 0.8;

function compactLabel(value: string, fallback: string) {
  const label = clean(value, fallback);

  return label.length > 150 ? `${label.slice(0, 147).trim()}...` : label;
}

function option(id: string, label: string, detail: string): ChallengeOption {
  return {
    id,
    label: compactLabel(label, label),
    detail,
  };
}

function buildMasteryCheck(learningCase: LearningCase): ChallengeItem[] {
  const concept = clean(learningCase.concept, 'this concept');
  const unit = clean(learningCase.unit, 'this unit');
  const [relatedA, relatedB] = learningCase.related;
  const firstRelated = clean(relatedA, `${concept} basics`);
  const secondRelated = clean(relatedB, `${concept} application`);
  const misconception = clean(
    learningCase.misconception,
    `${concept} is being explained with an incomplete idea.`,
  );
  const correction = clean(
    learningCase.missingPiece,
    `A strong answer explains the key condition behind ${concept}.`,
  );
  const primaryOptions =
    learningCase.challengeOptions.length >= 2
      ? learningCase.challengeOptions
      : [
          option('misconception', misconception, 'This repeats the confusion.'),
          option('correction', correction, 'This repairs the reasoning.'),
          option(
            'memorize',
            `Memorize the definition of ${concept}.`,
            'Recall alone does not prove understanding.',
          ),
        ];
  const primaryCorrect = primaryOptions.some(
    (item) => item.id === learningCase.correctOptionId,
  )
    ? learningCase.correctOptionId
    : primaryOptions[0].id;

  return [
    {
      id: 'core-fix',
      focus: 'Core fix',
      question: learningCase.challengeQuestion,
      options: primaryOptions,
      correctOptionId: primaryCorrect,
    },
    {
      id: 'misconception-check',
      focus: 'Misconception',
      question: `Which answer still shows the misconception about ${concept}?`,
      options: [
        option(
          'misconception',
          misconception,
          'This is the weak explanation TeachMap detected.',
        ),
        option(
          'correction',
          correction,
          'This is the repaired idea, not the misconception.',
        ),
        option(
          'related',
          `${firstRelated} and ${secondRelated} are unrelated.`,
          'Nearby ideas usually help explain the concept.',
        ),
      ],
      correctOptionId: 'misconception',
    },
    {
      id: 'missing-piece',
      focus: 'Missing idea',
      question: `What missing idea must the student add to master ${concept}?`,
      options: [
        option(
          'definition-only',
          `Give a shorter definition of ${concept}.`,
          'A shorter answer can still miss the reasoning.',
        ),
        option(
          'correction',
          correction,
          'This is the exact idea the student must connect.',
        ),
        option(
          'ignore-context',
          `Ignore ${unit} and study the term alone.`,
          'Studying the term alone can miss conditions and consequences.',
        ),
      ],
      correctOptionId: 'correction',
    },
    {
      id: 'nearby-concept-a',
      focus: 'Boundary',
      question: `Which explanation best separates ${concept} from ${firstRelated}?`,
      options: [
        option(
          'boundary',
          `${firstRelated} can help set up the situation, but ${concept} depends on this idea: ${correction}`,
          'This distinguishes the concept instead of blending it with a neighbor.',
        ),
        option(
          'replace',
          `${concept} and ${firstRelated} are the same thing.`,
          'This collapses two ideas that should be separated.',
        ),
        option(
          'unrelated',
          `${firstRelated} never matters when explaining ${concept}.`,
          'This throws away useful context instead of explaining the difference.',
        ),
      ],
      correctOptionId: 'boundary',
    },
    {
      id: 'nearby-concept-b',
      focus: 'Cause and effect',
      question: `A student brings up ${secondRelated} while explaining ${concept}. What should they do next?`,
      options: [
        option(
          'separate',
          `List ${secondRelated} as a separate vocabulary word and stop.`,
          'A list is not enough to prove understanding.',
        ),
        option(
          'connect',
          `Explain how ${secondRelated} relates to the cause, timing, or consequence of ${concept}.`,
          'This checks whether the student understands relationships, not just terms.',
        ),
        option(
          'ignore',
          `Ignore ${secondRelated} because the answer only needs one sentence.`,
          'Short answers can still hide the misconception.',
        ),
      ],
      correctOptionId: 'connect',
    },
    {
      id: 'new-example',
      focus: 'Transfer',
      question: `A new example uses ${concept} in a different situation. What should stay true?`,
      options: [
        option(
          'same-reasoning',
          correction,
          'The core reasoning should transfer to new examples.',
        ),
        option(
          'same-words',
          `The student must repeat the exact wording from the notes.`,
          'Exact wording is weaker than transferable reasoning.',
        ),
        option(
          'same-error',
          misconception,
          'Repeating the old error means the concept is not mastered.',
        ),
      ],
      correctOptionId: 'same-reasoning',
    },
    {
      id: 'teachback-quality',
      focus: 'TeachBack',
      question: `Which TeachBack answer best shows mastery of ${concept}?`,
      options: [
        option(
          'connected',
          `It explains ${concept}, names the condition, and connects it to ${firstRelated}.`,
          'Mastery needs explanation plus connection.',
        ),
        option(
          'keyword',
          `It lists keywords from ${unit} without explaining relationships.`,
          'Keywords alone can hide confusion.',
        ),
        option(
          'confidence',
          `It sounds confident even if it repeats: ${misconception}`,
          'Confidence is not evidence of understanding.',
        ),
      ],
      correctOptionId: 'connected',
    },
    {
      id: 'probe-response',
      focus: 'Pressure test',
      question: `TeachMap asks: "When would ${concept} not apply?" Which answer shows deeper understanding?`,
      options: [
        option(
          'condition',
          `It names the boundary condition and still uses the correct idea: ${correction}`,
          'Deep understanding includes when the concept does and does not apply.',
        ),
        option(
          'repeat',
          `It repeats the original answer: ${misconception}`,
          'Repeating the first answer avoids the pressure test.',
        ),
        option(
          'definition',
          `It gives only a memorized definition of ${concept}.`,
          'Definitions help, but boundaries reveal understanding.',
        ),
      ],
      correctOptionId: 'condition',
    },
    {
      id: 'false-confidence',
      focus: 'False confidence',
      question: `Which student answer sounds confident but still misunderstands ${concept}?`,
      options: [
        option(
          'confident-error',
          `I know ${concept}: ${misconception}`,
          'This is confident, but it keeps the same incorrect reasoning.',
        ),
        option(
          'qualified',
          `${concept} depends on the situation, especially this condition: ${correction}`,
          'This answer qualifies the idea with the missing condition.',
        ),
        option(
          'connected',
          `${concept} connects to ${firstRelated} and ${secondRelated} because the conditions matter.`,
          'This uses connected reasoning rather than a confident error.',
        ),
      ],
      correctOptionId: 'confident-error',
    },
    {
      id: 'repair-explanation',
      focus: 'Repair',
      question: `Which final explanation would you want the student to say about ${concept}?`,
      options: [
        option(
          'repaired',
          `${concept} is not just the old idea. A better explanation is: ${correction}`,
          'This directly replaces the misconception with the repaired reasoning.',
        ),
        option(
          'old-error',
          `${concept} basically means ${misconception}`,
          'This keeps the misconception alive.',
        ),
        option(
          'keywords',
          `${concept}, ${firstRelated}, ${secondRelated}.`,
          'Keywords alone do not explain how the concept works.',
        ),
      ],
      correctOptionId: 'repaired',
    },
  ];
}

function countCorrectAnswers(
  answers: ChallengeAnswers,
  challengeItems: ChallengeItem[],
) {
  return challengeItems.filter(
    (item) => answers[item.id] === item.correctOptionId,
  ).length;
}

function challengePercent(correctCount: number, totalCount: number) {
  return totalCount === 0 ? 0 : Math.round((correctCount / totalCount) * 100);
}

function challengePassCount(totalCount: number) {
  return Math.ceil(totalCount * masteryThresholdRatio);
}

function getMissedChallengeItems(
  challengeItems: ChallengeItem[],
  answers: ChallengeAnswers,
) {
  return challengeItems.filter(
    (item) => answers[item.id] !== item.correctOptionId,
  );
}

function buildEvidenceReportText({
  learningCase,
  lectureName,
  correctCount,
  totalCount,
  passCount,
  score,
  status,
  statusReason,
  missedItems,
}: {
  learningCase: LearningCase;
  lectureName: string;
  correctCount: number;
  totalCount: number;
  passCount: number;
  score: number;
  status: NodeStatus;
  statusReason: string;
  missedItems: ChallengeItem[];
}) {
  const missedFocuses =
    missedItems.length > 0
      ? missedItems.map((item) => item.focus).join(', ')
      : 'None';
  const nextStep =
    status === 'mastered'
      ? 'Schedule a short review, then test the concept in a mixed-topic set.'
      : 'Review the missed focus areas, explain the concept again, and retake the mastery check.';

  return [
    'TeachMap AI Evidence Report',
    `Source: ${lectureName}`,
    `Concept: ${learningCase.concept}`,
    `Status: ${statusLabel(status)}`,
    `Mastery check: ${correctCount}/${totalCount} correct (${score}%)`,
    `Green threshold: ${passCount}/${totalCount} correct`,
    `Why: ${statusReason}`,
    `Misconception repaired: ${learningCase.misconception}`,
    `Correct idea: ${learningCase.missingPiece}`,
    `Missed focus areas: ${missedFocuses}`,
    `Next step: ${nextStep}`,
  ].join('\n');
}

function createTurnId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildInitialTeachTurns(learningCase: LearningCase): TeachTurn[] {
  return [
    {
      id: 'ai-opening',
      role: 'ai',
      focus: 'Opening',
      text: `Teach me ${learningCase.concept} from scratch. Start with what it means, when it happens, and one example.`,
    },
  ];
}

function buildTeachbackTranscript(turns: TeachTurn[]) {
  return turns
    .map(
      (turn) =>
        `${turn.role === 'ai' ? 'TeachMap AI' : 'Student'}: ${turn.text}`,
    )
    .join('\n');
}

function buildLocalFollowUp(
  learningCase: LearningCase,
  round: number,
  lastAnswer: string,
): FollowUpResponse {
  const concept = clean(learningCase.concept, 'this concept');
  const [relatedA, relatedB] = learningCase.related;
  const firstRelated = clean(relatedA, `${concept} basics`);
  const secondRelated = clean(relatedB, `${concept} application`);
  const correction = clean(
    learningCase.missingPiece,
    `the key condition behind ${concept}`,
  );
  const misconception = clean(
    learningCase.misconception,
    `an incomplete explanation of ${concept}`,
  );
  const answer = lastAnswer.toLowerCase();
  const correctionKeywords = correction
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 4);
  const mentionsCorrection = correctionKeywords.some((word) =>
    answer.includes(word),
  );

  if (!mentionsCorrection && round === 1) {
    return {
      question: `I heard a possible gap. Can you give one example where ${concept} follows this idea: ${correction}`,
      focus: 'Missing condition',
      feedback:
        'The next answer should connect the concept to the condition, not only the definition.',
      source: 'local_fallback',
    };
  }

  const followUps: Array<Omit<FollowUpResponse, 'source'>> = [
    {
      question: `When would ${concept} not apply? Give a boundary case and explain why.`,
      focus: 'Boundary case',
      feedback:
        'A boundary case shows whether the student knows the limits of the concept.',
    },
    {
      question: `How would you explain the difference between ${concept} and ${firstRelated} to a beginner?`,
      focus: firstRelated,
      feedback:
        'This checks whether the student can separate nearby ideas instead of blending them.',
    },
    {
      question: `What changes in the system when ${concept} happens, and what stays the same?`,
      focus: 'Cause and effect',
      feedback: 'This asks for mechanism, not just recognition of the term.',
    },
    {
      question: `A classmate says, "${misconception}" What exactly would you correct in that sentence?`,
      focus: 'Misconception repair',
      feedback:
        'This asks the student to repair the weak reasoning in their own words.',
    },
    {
      question: `Use ${secondRelated} in your explanation of ${concept}. How are they connected?`,
      focus: secondRelated,
      feedback: 'This tests transfer across related concepts from the lecture.',
    },
  ];
  const selected = followUps[(round - 1) % followUps.length];

  return {
    ...selected,
    source: 'local_fallback',
  };
}

function getStageInfo(
  stage: Stage,
  learningCase: LearningCase,
  mode: Mode,
): StageInfo {
  const custom = mode === 'custom';

  const copy: Record<Stage, StageInfo> = {
    upload: {
      id: 'upload',
      title: custom ? 'Set Up Topic' : 'Load Lecture',
      navLabel: 'Start',
      icon: UploadCloud,
      headline: custom
        ? 'Try TeachMap with your own topic.'
        : 'Start with one lecture.',
      supporting: custom
        ? 'Enter one concept, one likely confusion, and the correct idea you want the student to learn.'
        : 'Use the sample lecture for the polished hackathon flow, or switch to custom mode to test your own concept.',
      nextLabel: custom ? 'Start custom test' : 'Load sample lecture',
    },
    map: {
      id: 'map',
      title: 'Review Map',
      navLabel: 'Map',
      icon: Map,
      headline: `${learningCase.concept} is now on the knowledge map.`,
      supporting: `TeachMap connects ${learningCase.concept} to nearby ideas in ${learningCase.unit}, then asks the student to teach it back.`,
      nextLabel: `Teach ${learningCase.concept}`,
    },
    teach: {
      id: 'teach',
      title: 'TeachBack',
      navLabel: 'Teach',
      icon: MessageSquareText,
      headline: 'TeachMap interviews your understanding.',
      supporting:
        'Keep teaching the concept. TeachMap asks deeper follow-up questions until the student chooses diagnosis.',
      nextLabel: 'Send to AI',
    },
    probe: {
      id: 'probe',
      title: 'Final Probe',
      navLabel: 'Probe',
      icon: HelpCircle,
      headline: 'Answer one final pressure-test question.',
      supporting:
        'This final answer gives TeachMap enough evidence to decide what needs fixing.',
      nextLabel: 'Reveal what to fix',
    },
    result: {
      id: 'result',
      title: 'Misconception Found',
      navLabel: 'Reveal',
      icon: AlertTriangle,
      headline: 'Now the hidden misunderstanding is visible.',
      supporting: `${learningCase.concept} turns red because TeachMap found the misconception in the explanation.`,
      nextLabel: 'Start targeted fix',
    },
    challenge: {
      id: 'challenge',
      title: 'Mastery Check',
      navLabel: 'Fix',
      icon: Target,
      headline: 'A 10-question check tests the whole idea.',
      supporting:
        'TeachMap tests boundaries, examples, corrections, and related ideas before the map turns green.',
      nextLabel: 'Update mastery map',
    },
    mastered: {
      id: 'mastered',
      title: 'Mastery Updated',
      navLabel: 'Mastery',
      icon: GraduationCap,
      headline: `${learningCase.concept} moved from red to green.`,
      supporting:
        'That red-to-green change is the demo moment: the student repaired the reasoning, not just guessed an answer.',
      nextLabel: 'Restart',
    },
  };

  return copy[stage];
}

function statusLabel(status: NodeStatus) {
  return {
    'not-ready': 'Waiting',
    testing: 'Testing',
    developing: 'Developing',
    misconception: 'Misconception',
    mastered: 'Mastered',
  }[status];
}

function statusStyles(status: NodeStatus) {
  return {
    'not-ready': {
      node: 'border-slate-200 bg-white text-slate-500',
      dot: 'bg-slate-300',
      badge: 'border-slate-200 bg-slate-50 text-slate-600',
    },
    testing: {
      node: 'border-sky-300 bg-sky-50 text-sky-950 shadow-[0_18px_42px_rgb(14_165_233/16%)]',
      dot: 'bg-sky-500',
      badge: 'border-sky-200 bg-sky-50 text-sky-800',
    },
    developing: {
      node: 'border-amber-300 bg-amber-50 text-amber-950 shadow-[0_18px_42px_rgb(245_158_11/14%)]',
      dot: 'bg-amber-400',
      badge: 'border-amber-200 bg-amber-50 text-amber-800',
    },
    misconception: {
      node: 'border-rose-300 bg-rose-50 text-rose-950 shadow-[0_18px_42px_rgb(244_63_94/20%)]',
      dot: 'bg-rose-500',
      badge: 'border-rose-200 bg-rose-50 text-rose-800',
    },
    mastered: {
      node: 'border-emerald-300 bg-emerald-50 text-emerald-950 shadow-[0_18px_42px_rgb(16_185_129/18%)]',
      dot: 'bg-emerald-500',
      badge: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    },
  }[status];
}

function scoreFor(
  stage: Stage,
  diagnosisScore: number | null,
  challengeChecked: boolean,
  challengeScore: number,
) {
  if (stage === 'upload') {
    return 0;
  }

  if (stage === 'mastered') {
    return Math.max(91, challengeScore);
  }

  if (stage === 'challenge' && challengeChecked) {
    return challengeScore;
  }

  if (stageRank[stage] >= stageRank.result) {
    return diagnosisScore ?? 42;
  }

  return 58;
}

function conceptStatus(
  stage: Stage,
  challengeChecked: boolean,
  correctCount: number,
  passCount: number,
): NodeStatus {
  if (stage === 'mastered') {
    return 'mastered';
  }

  if (stage === 'challenge' && challengeChecked) {
    if (correctCount >= passCount) {
      return 'mastered';
    }

    if (correctCount >= Math.ceil(passCount * 0.6)) {
      return 'developing';
    }

    return 'misconception';
  }

  if (stageRank[stage] >= stageRank.result) {
    return 'misconception';
  }

  if (stageRank[stage] >= stageRank.teach) {
    return 'testing';
  }

  if (stageRank[stage] >= stageRank.map) {
    return 'developing';
  }

  return 'not-ready';
}

function statusReason(
  stage: Stage,
  challengeChecked: boolean,
  correctCount: number,
  totalCount: number,
  passCount: number,
) {
  if (stage === 'upload') {
    return 'No topic has been assessed yet.';
  }

  if (stageRank[stage] < stageRank.result) {
    return 'The topic is developing until the student explains it and answers the probe.';
  }

  if (stage === 'result') {
    return 'The probe exposed a missing idea, so the concept is marked as a misconception.';
  }

  if (stage === 'challenge' && !challengeChecked) {
    return `The concept stays red until the ${totalCount}-question mastery check is submitted.`;
  }

  if (correctCount >= passCount) {
    return `${correctCount}/${totalCount} correct meets the ${passCount}/${totalCount} mastery threshold.`;
  }

  if (correctCount >= Math.ceil(passCount * 0.6)) {
    return `${correctCount}/${totalCount} correct shows partial repair, so the concept is developing.`;
  }

  return `${correctCount}/${totalCount} correct means the misconception still needs targeted practice.`;
}

function nextStage(stage: Stage): Stage {
  return {
    upload: 'map',
    map: 'teach',
    teach: 'probe',
    probe: 'result',
    result: 'challenge',
    challenge: 'mastered',
    mastered: 'upload',
  }[stage] as Stage;
}

function stepIsAvailable(step: Stage, current: Stage) {
  return stageRank[step] <= stageRank[current] || step === nextStage(current);
}

function analysisSourceLabel(source: AnalysisSource) {
  return {
    not_run_yet: 'Ready to analyze',
    scripted_demo: 'AI demo',
    gemini: 'Gemini AI',
    local_fallback: 'Guided AI flow',
  }[source];
}

function analysisSourceStyles(source: AnalysisSource) {
  return {
    not_run_yet: 'border-slate-200 bg-white text-slate-600',
    scripted_demo: 'border-sky-200 bg-sky-50 text-sky-800',
    gemini: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    local_fallback: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  }[source];
}

function pdfStatusStyles(status: PdfStatus) {
  return {
    idle: 'border-slate-200 bg-slate-50 text-slate-700',
    reading: 'border-sky-200 bg-sky-50 text-sky-900',
    ready: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    error: 'border-rose-200 bg-rose-50 text-rose-900',
  }[status];
}

const maxPdfPagesToRead = 25;
const maxPdfTextChars = 14000;

type PdfExtractionResult = {
  text: string;
  pageCount: number;
  usedPages: number;
  truncated: boolean;
};

function isPdfTextItem(
  item: unknown,
): item is { str: string; hasEOL?: boolean } {
  return (
    !!item &&
    typeof item === 'object' &&
    'str' in item &&
    typeof (item as { str?: unknown }).str === 'string'
  );
}

function normalizePdfText(text: string) {
  return text
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function extractPdfText(file: File): Promise<PdfExtractionResult> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    '/pdf.worker.min.mjs',
    window.location.origin,
  ).toString();

  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({
    data,
    disableFontFace: true,
    isOffscreenCanvasSupported: false,
    useSystemFonts: false,
    useWasm: false,
  });
  const pdf = await loadingTask.promise;
  const pageLimit = Math.min(pdf.numPages, maxPdfPagesToRead);
  const pages: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => {
          if (!isPdfTextItem(item)) {
            return '';
          }

          return item.hasEOL ? `${item.str}\n` : `${item.str} `;
        })
        .join('');

      pages.push(pageText);
      page.cleanup();

      if (pages.join('\n\n').length >= maxPdfTextChars) {
        break;
      }
    }

    const combined = normalizePdfText(pages.join('\n\n'));

    return {
      text: combined.slice(0, maxPdfTextChars),
      pageCount: pdf.numPages,
      usedPages: pages.length,
      truncated:
        pdf.numPages > pages.length || combined.length > maxPdfTextChars,
    };
  } finally {
    await loadingTask.destroy();
  }
}

export default function Home() {
  const [stage, setStage] = useState<Stage>('upload');
  const [mode, setMode] = useState<Mode>('demo');
  const [draft, setDraft] = useState<CustomDraft>(initialDraft);
  const [learningCase, setLearningCase] = useState<LearningCase>(defaultCase);
  const [lectureName, setLectureName] = useState('No lecture loaded yet');
  const [teachingAnswer, setTeachingAnswer] = useState(
    defaultCase.studentExplanation,
  );
  const [teachTurns, setTeachTurns] = useState<TeachTurn[]>(
    buildInitialTeachTurns(defaultCase),
  );
  const [probeAnswer, setProbeAnswer] = useState(defaultCase.probeResponse);
  const [challengeAnswers, setChallengeAnswers] = useState<ChallengeAnswers>(
    {},
  );
  const [challengeChecked, setChallengeChecked] = useState(false);
  const [diagnosisScore, setDiagnosisScore] = useState<number | null>(null);
  const [analysisSource, setAnalysisSource] =
    useState<AnalysisSource>('not_run_yet');
  const [analysisError, setAnalysisError] = useState('');
  const [analysisFeedback, setAnalysisFeedback] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isAskingFollowUp, setIsAskingFollowUp] = useState(false);
  const [pdfStatus, setPdfStatus] = useState<PdfStatus>('idle');
  const [pdfMessage, setPdfMessage] = useState(
    'Upload a text-based PDF. TeachMap reads the text and fills the topic setup.',
  );
  const [reportCopyStatus, setReportCopyStatus] = useState<CopyStatus>('idle');

  const current = getStageInfo(stage, learningCase, mode);
  const currentIndex = stageOrder.indexOf(stage);
  const rank = stageRank[stage];
  const challengeItems = useMemo(
    () => buildMasteryCheck(learningCase),
    [learningCase],
  );
  const challengeAnswerCount = challengeItems.filter(
    (item) => !!challengeAnswers[item.id],
  ).length;
  const challengeCorrectCount = countCorrectAnswers(
    challengeAnswers,
    challengeItems,
  );
  const challengeTotal = challengeItems.length;
  const challengeScore = challengePercent(
    challengeCorrectCount,
    challengeTotal,
  );
  const challengePassTarget = challengePassCount(challengeTotal);
  const challengePassed =
    challengeChecked && challengeCorrectCount >= challengePassTarget;
  const missedChallengeItems = useMemo(
    () =>
      challengeChecked
        ? getMissedChallengeItems(challengeItems, challengeAnswers)
        : [],
    [challengeAnswers, challengeChecked, challengeItems],
  );
  const teachStudentTurnCount = teachTurns.filter(
    (turn) => turn.role === 'student',
  ).length;
  const teachbackTranscript = useMemo(
    () => buildTeachbackTranscript(teachTurns),
    [teachTurns],
  );
  const masteryScore = scoreFor(
    stage,
    diagnosisScore,
    challengeChecked,
    challengeScore,
  );
  const activeStatus = conceptStatus(
    stage,
    challengeChecked,
    challengeCorrectCount,
    challengePassTarget,
  );
  const activeStatusReason = statusReason(
    stage,
    challengeChecked,
    challengeCorrectCount,
    challengeTotal,
    challengePassTarget,
  );
  const evidenceReportText = useMemo(
    () =>
      buildEvidenceReportText({
        learningCase,
        lectureName,
        correctCount: challengeCorrectCount,
        totalCount: challengeTotal,
        passCount: challengePassTarget,
        score: challengeScore,
        status: activeStatus,
        statusReason: activeStatusReason,
        missedItems: missedChallengeItems,
      }),
    [
      activeStatus,
      activeStatusReason,
      challengeCorrectCount,
      challengePassTarget,
      challengeScore,
      challengeTotal,
      learningCase,
      lectureName,
      missedChallengeItems,
    ],
  );
  const CurrentIcon = current.icon;
  const unansweredChallengeCount = challengeTotal - challengeAnswerCount;
  const canStartCustom =
    mode === 'demo' ||
    (pdfStatus !== 'reading' &&
      draft.concept.trim().length > 0 &&
      draft.correction.trim().length > 0);
  const canUsePrimary =
    (stage !== 'upload' || canStartCustom) &&
    (stage !== 'teach' ||
      teachingAnswer.trim().length > 0 ||
      teachStudentTurnCount > 0) &&
    (stage !== 'challenge' ||
      challengeChecked ||
      unansweredChallengeCount === 0) &&
    (stage !== 'probe' || probeAnswer.trim().length > 0) &&
    !isAnalyzing &&
    !isAskingFollowUp;
  const primaryLabel = (() => {
    if (isAskingFollowUp) {
      return 'AI is asking next...';
    }

    if (isAnalyzing) {
      return 'Analyzing answer...';
    }

    if (stage === 'teach') {
      if (teachingAnswer.trim()) {
        return 'Send to AI';
      }

      return teachStudentTurnCount > 0
        ? 'Find what to fix'
        : 'Type your explanation';
    }

    if (stage === 'probe' && !probeAnswer.trim()) {
      return 'Answer probe first';
    }

    if (stage === 'challenge' && challengeChecked && challengePassed) {
      return 'Update mastery map';
    }

    if (stage === 'challenge' && challengeChecked) {
      return 'Revise answers';
    }

    if (stage === 'challenge' && unansweredChallengeCount > 0) {
      return `Answer ${unansweredChallengeCount} more`;
    }

    if (stage === 'challenge') {
      return `Check ${challengeTotal} answers`;
    }

    return current.nextLabel;
  })();

  const mapNodes = useMemo<
    Array<{
      id: string;
      label: string;
      status: NodeStatus;
      x: number;
      y: number;
    }>
  >(
    () => [
      {
        id: 'unit',
        label: learningCase.unit,
        status: rank >= stageRank.map ? 'testing' : 'not-ready',
        x: 50,
        y: 20,
      },
      {
        id: 'related-a',
        label: learningCase.related[0],
        status: rank >= stageRank.map ? 'mastered' : 'not-ready',
        x: 24,
        y: 50,
      },
      {
        id: 'related-b',
        label: learningCase.related[1],
        status: rank >= stageRank.map ? 'developing' : 'not-ready',
        x: 76,
        y: 50,
      },
      {
        id: 'concept',
        label: learningCase.concept,
        status: activeStatus,
        x: 50,
        y: 78,
      },
    ],
    [activeStatus, learningCase, rank],
  );

  const analysisPayload = useMemo(
    () => ({
      concept: learningCase.concept,
      mastery_score: masteryScore,
      misconception:
        rank >= stageRank.result && stage !== 'mastered'
          ? learningCase.misconception
          : null,
      missing_piece: stage === 'mastered' ? null : learningCase.missingPiece,
      analysis_mode:
        rank >= stageRank.result
          ? analysisSource === 'gemini'
            ? analysisSource
            : analysisSource === 'scripted_demo'
              ? 'scripted_demo'
              : 'guided'
          : 'not_run_yet',
      feedback:
        rank >= stageRank.result && analysisFeedback.length > 0
          ? analysisFeedback
          : null,
      teachback_interview:
        rank >= stageRank.teach
          ? {
              student_answers: teachStudentTurnCount,
              latest_question:
                [...teachTurns].reverse().find((turn) => turn.role === 'ai')
                  ?.text ?? null,
            }
          : null,
      warning:
        rank >= stageRank.result && analysisError.length > 0
          ? analysisError
          : null,
      mastery_check:
        stageRank[stage] >= stageRank.challenge
          ? {
              answered: challengeAnswerCount,
              correct: challengeChecked ? challengeCorrectCount : null,
              total: challengeTotal,
              threshold: challengePassTarget,
              status: statusLabel(activeStatus),
              missed_focuses: challengeChecked
                ? missedChallengeItems.map((item) => item.focus)
                : [],
            }
          : null,
      status_evidence: activeStatusReason,
      next_action:
        stage === 'mastered'
          ? 'schedule_review'
          : stage === 'challenge'
            ? 'check_targeted_challenge'
            : current.nextLabel.toLowerCase(),
    }),
    [
      analysisError,
      analysisFeedback,
      analysisSource,
      activeStatus,
      activeStatusReason,
      challengeAnswerCount,
      challengeChecked,
      challengeCorrectCount,
      challengePassTarget,
      challengeTotal,
      missedChallengeItems,
      current.nextLabel,
      learningCase,
      masteryScore,
      rank,
      stage,
      teachStudentTurnCount,
      teachTurns,
    ],
  );

  function loadDemoCase(name = defaultCase.lectureName) {
    const sample = { ...defaultCase, lectureName: name };
    setMode('demo');
    setLearningCase(sample);
    setLectureName(name);
    setTeachingAnswer(sample.studentExplanation);
    setTeachTurns(buildInitialTeachTurns(sample));
    setProbeAnswer(sample.probeResponse);
    setChallengeAnswers({});
    setChallengeChecked(false);
    setDiagnosisScore(null);
    setAnalysisSource('scripted_demo');
    setAnalysisError('');
    setAnalysisFeedback('');
    setIsAskingFollowUp(false);
    setReportCopyStatus('idle');
    setStage('map');
  }

  function startCustomCase() {
    const customCase = buildCustomCase(draft);
    setMode('custom');
    setLearningCase(customCase);
    setLectureName(customCase.lectureName);
    setTeachingAnswer(customCase.studentExplanation);
    setTeachTurns(buildInitialTeachTurns(customCase));
    setProbeAnswer(customCase.probeResponse);
    setChallengeAnswers({});
    setChallengeChecked(false);
    setDiagnosisScore(null);
    setAnalysisSource('not_run_yet');
    setAnalysisError('');
    setAnalysisFeedback('');
    setIsAskingFollowUp(false);
    setReportCopyStatus('idle');
    setStage('map');
  }

  function resetApp() {
    setStage('upload');
    setMode('demo');
    setDraft(initialDraft);
    setLearningCase(defaultCase);
    setLectureName('No lecture loaded yet');
    setTeachingAnswer(defaultCase.studentExplanation);
    setTeachTurns(buildInitialTeachTurns(defaultCase));
    setProbeAnswer(defaultCase.probeResponse);
    setChallengeAnswers({});
    setChallengeChecked(false);
    setDiagnosisScore(null);
    setAnalysisSource('not_run_yet');
    setAnalysisError('');
    setAnalysisFeedback('');
    setIsAnalyzing(false);
    setIsAskingFollowUp(false);
    setPdfStatus('idle');
    setPdfMessage(
      'Upload a text-based PDF. TeachMap reads the text and fills the topic setup.',
    );
    setReportCopyStatus('idle');
  }

  async function handleFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setMode('custom');
    setPdfStatus('reading');
    setPdfMessage(`Reading ${file.name}...`);
    setDraft((currentDraft) => ({
      ...currentDraft,
      lectureName: file.name,
    }));

    try {
      const extraction = await extractPdfText(file);

      if (extraction.text.length < 80) {
        throw new Error('No readable text found');
      }

      const response = await fetch('/api/pdf-intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          text: extraction.text,
        }),
      });

      if (!response.ok) {
        throw new Error('PDF intake failed');
      }

      const intake = (await response.json()) as PdfIntakeResponse;
      const relatedConcepts = Array.isArray(intake.related_concepts)
        ? intake.related_concepts
        : [];
      const [relatedA = '', relatedB = ''] = relatedConcepts;
      const pageMessage = extraction.truncated
        ? `read the first ${extraction.usedPages} of ${extraction.pageCount} pages`
        : `read ${extraction.usedPages} of ${extraction.pageCount} pages`;

      setDraft((currentDraft) => ({
        ...currentDraft,
        lectureName: file.name,
        unit: intake.unit || currentDraft.unit,
        concept: intake.concept || currentDraft.concept,
        relatedA: relatedA || currentDraft.relatedA,
        relatedB: relatedB || currentDraft.relatedB,
        misconception:
          intake.likely_misconception || currentDraft.misconception,
        correction: intake.correction || currentDraft.correction,
        notes: extraction.text,
      }));
      setPdfStatus('ready');
      setPdfMessage(
        `${intake.source === 'gemini' ? 'Gemini selected a concept from' : 'TeachMap read'} ${file.name}: ${pageMessage} and filled the topic fields.`,
      );
      setAnalysisSource(intake.source);
      setAnalysisError('');
      setReportCopyStatus('idle');
    } catch (error) {
      console.error('TeachMap PDF upload failed', error);
      setPdfStatus('error');
      setPdfMessage(
        'I could not read enough selectable text from that PDF. Try a text-based PDF, paste notes, or use OCR for scanned pages.',
      );
    } finally {
      event.target.value = '';
    }
  }

  function applyDiagnosis(diagnosis: AnalyzeResponse) {
    const challengeOptions =
      diagnosis.challenge_options.length >= 2
        ? diagnosis.challenge_options
        : learningCase.challengeOptions;
    const correctOptionId = challengeOptions.some(
      (option) => option.id === diagnosis.correct_option_id,
    )
      ? diagnosis.correct_option_id
      : challengeOptions[0].id;

    setLearningCase((currentCase) => ({
      ...currentCase,
      concept: diagnosis.concept || currentCase.concept,
      misconception: diagnosis.misconception || currentCase.misconception,
      missingPiece: diagnosis.missing_piece || currentCase.missingPiece,
      probeQuestion: diagnosis.probe_question || currentCase.probeQuestion,
      challengeQuestion:
        diagnosis.challenge_question || currentCase.challengeQuestion,
      challengeOptions,
      correctOptionId,
    }));
    setDiagnosisScore(diagnosis.mastery_score);
    setAnalysisSource(diagnosis.source);
    setAnalysisError(diagnosis.warning ?? '');
    setAnalysisFeedback(diagnosis.feedback ?? '');
    setChallengeAnswers({});
    setChallengeChecked(false);
    setReportCopyStatus('idle');
    setStage('result');
  }

  async function copyEvidenceReport() {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard unavailable');
      }

      await navigator.clipboard.writeText(evidenceReportText);
      setReportCopyStatus('copied');
    } catch {
      setReportCopyStatus('error');
    }
  }

  async function sendTeachAnswer({
    moveToProbe = false,
  }: { moveToProbe?: boolean } = {}) {
    const answer = teachingAnswer.trim();

    if (!answer || isAskingFollowUp) {
      return;
    }

    const studentTurn: TeachTurn = {
      id: createTurnId('student'),
      role: 'student',
      text: answer,
    };
    const conversation = [...teachTurns, studentTurn];
    const round = teachStudentTurnCount + 1;

    setTeachTurns(conversation);
    setTeachingAnswer('');
    setIsAskingFollowUp(true);
    setAnalysisError('');

    try {
      const response = await fetch('/api/follow-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lectureName,
          unit: learningCase.unit,
          concept: learningCase.concept,
          related: learningCase.related,
          notes: draft.notes,
          misconception: learningCase.misconception,
          correction: learningCase.missingPiece,
          conversation,
          round,
        }),
      });

      if (!response.ok) {
        throw new Error('Follow-up request failed');
      }

      const followUp = (await response.json()) as FollowUpResponse;
      const aiTurn: TeachTurn = {
        id: createTurnId('ai'),
        role: 'ai',
        text: followUp.question,
        focus: followUp.focus,
        feedback: followUp.feedback,
      };

      setTeachTurns([...conversation, aiTurn]);
      setLearningCase({
        ...learningCase,
        probeQuestion: followUp.question,
      });

      if (followUp.source === 'gemini') {
        setAnalysisSource(followUp.source);
      } else if (analysisSource === 'not_run_yet') {
        setAnalysisSource('local_fallback');
      }

      if (moveToProbe) {
        setProbeAnswer('');
        setStage('probe');
      }
    } catch {
      const fallbackFollowUp = buildLocalFollowUp(learningCase, round, answer);
      const fallbackAiTurn: TeachTurn = {
        id: createTurnId('ai'),
        role: 'ai',
        text: fallbackFollowUp.question,
        focus: fallbackFollowUp.focus,
        feedback: fallbackFollowUp.feedback,
      };

      setTeachTurns([...conversation, fallbackAiTurn]);
      setLearningCase({
        ...learningCase,
        probeQuestion: fallbackFollowUp.question,
      });

      if (analysisSource === 'not_run_yet') {
        setAnalysisSource('local_fallback');
      }

      if (moveToProbe) {
        setProbeAnswer('');
        setStage('probe');
      }
    } finally {
      setIsAskingFollowUp(false);
    }
  }

  async function finishTeachBack() {
    if (teachingAnswer.trim().length > 0) {
      await sendTeachAnswer({ moveToProbe: true });
      return;
    }

    if (teachStudentTurnCount > 0) {
      setProbeAnswer('');
      setStage('probe');
    }
  }

  async function runDiagnosis() {
    if (mode === 'demo') {
      setDiagnosisScore(42);
      setAnalysisSource('scripted_demo');
      setAnalysisError('');
      setAnalysisFeedback(
        'TeachMap read the interview and found the page-fault misconception.',
      );
      setStage('result');
      return;
    }

    setIsAnalyzing(true);
    setAnalysisError('');

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          lectureName,
          unit: learningCase.unit,
          concept: learningCase.concept,
          related: learningCase.related,
          notes: draft.notes,
          expectedMisconception: draft.misconception,
          expectedCorrection: draft.correction,
          teachingAnswer: teachbackTranscript,
          probeAnswer,
        }),
      });

      if (!response.ok) {
        throw new Error('Diagnosis request failed');
      }

      const diagnosis = (await response.json()) as AnalyzeResponse;
      applyDiagnosis(diagnosis);
    } catch {
      const fallback = buildCustomCase(draft);

      applyDiagnosis({
        concept: fallback.concept,
        mastery_score: 44,
        misconception: fallback.misconception,
        missing_piece: fallback.missingPiece,
        probe_question: fallback.probeQuestion,
        challenge_question: fallback.challengeQuestion,
        challenge_options: fallback.challengeOptions,
        correct_option_id: fallback.correctOptionId,
        feedback:
          'TeachMap used your custom setup to build a guided diagnosis for this run.',
        source: 'local_fallback',
        warning: 'Live analysis was unavailable for this run.',
      });
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function handlePrimaryAction() {
    if (stage === 'upload') {
      if (mode === 'custom') {
        startCustomCase();
      } else {
        loadDemoCase();
      }
      return;
    }

    if (stage === 'mastered') {
      resetApp();
      return;
    }

    if (stage === 'challenge') {
      if (challengeChecked) {
        if (challengePassed) {
          setStage('mastered');
        } else {
          setChallengeChecked(false);
          setReportCopyStatus('idle');
        }

        return;
      }

      setChallengeChecked(true);
      setDiagnosisScore(challengeScore);
      setReportCopyStatus('idle');

      return;
    }

    if (stage === 'teach') {
      if (teachingAnswer.trim().length > 0) {
        await sendTeachAnswer();
      } else {
        await finishTeachBack();
      }
      return;
    }

    if (stage === 'probe') {
      await runDiagnosis();
      return;
    }

    setStage(nextStage(stage));
  }

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [stage]);

  useEffect(() => {
    const context =
      typeof document === 'undefined' ? undefined : document.modelContext;

    if (!context?.registerTool) {
      return;
    }

    const lifecycle = new AbortController();
    const registerTool = context.registerTool.bind(context);

    function register(tool: WebMcpTool) {
      try {
        void Promise.resolve(
          registerTool(tool, { signal: lifecycle.signal }),
        ).catch((error) => {
          console.error('TeachMap WebMCP registration failed', error);
        });
      } catch (error) {
        console.error('TeachMap WebMCP registration failed', error);
      }
    }

    register({
      name: 'teachmap_load_sample_lecture',
      title: 'Load sample lecture',
      description:
        'Load the sample operating systems lecture and show the generated concept map.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute() {
        loadDemoCase();

        return {
          stage: 'map',
          lecture: defaultCase.lectureName,
          selected_concept: defaultCase.concept,
        };
      },
    });

    register({
      name: 'teachmap_reveal_misconception',
      title: 'Reveal misconception',
      description:
        'Run the guided TeachBack diagnosis and reveal the sample misconception.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute() {
        loadDemoCase();
        setDiagnosisScore(42);
        setAnalysisSource('scripted_demo');
        setAnalysisError('');
        setAnalysisFeedback(
          'TeachMap read the interview and found the page-fault misconception.',
        );
        setStage('result');

        return {
          stage: 'result',
          concept: defaultCase.concept,
          misconception: defaultCase.misconception,
          mastery_score: 42,
        };
      },
    });

    register({
      name: 'teachmap_complete_targeted_challenge',
      title: 'Complete mastery check',
      description:
        'Answer the sample 10-question mastery check correctly and update the mastery map.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute() {
        loadDemoCase();
        setChallengeAnswers(
          Object.fromEntries(
            buildMasteryCheck(defaultCase).map((item) => [
              item.id,
              item.correctOptionId,
            ]),
          ),
        );
        setChallengeChecked(true);
        setDiagnosisScore(100);
        setAnalysisSource('scripted_demo');
        setAnalysisError('');
        setAnalysisFeedback(
          'The sample mastery check repairs the target misconception.',
        );
        setStage('mastered');

        return {
          stage: 'mastered',
          concept: defaultCase.concept,
          mastery_score: 100,
          map_update: `${defaultCase.concept} changed from red to green.`,
        };
      },
    });

    return () => lifecycle.abort();
  }, []);

  return (
    <main className="min-h-screen bg-[var(--background)] text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-white">
              <BrainCircuit className="size-6" />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-500">
                TeachMap AI
              </p>
              <h1 className="text-2xl font-semibold text-slate-950 sm:text-3xl">
                Teach it. Reveal it. Master it.
              </h1>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
                Students teach first. AI probes the explanation, finds the
                missing idea, and updates a visual mastery map.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge
              variant="outline"
              className="h-8 rounded-md border-emerald-200 bg-emerald-50 px-3 text-emerald-800"
            >
              <Sparkles className="size-3.5" />
              Gemini AI connected
            </Badge>
            <Badge
              variant="outline"
              className={cn(
                'h-8 rounded-md px-3',
                analysisSourceStyles(analysisSource),
              )}
            >
              <BrainCircuit className="size-3.5" />
              {analysisSourceLabel(analysisSource)}
            </Badge>
            <Button
              variant="outline"
              className="rounded-lg"
              onClick={resetApp}
              aria-label="Restart TeachMap"
            >
              <RotateCcw className="size-4" />
              Restart
            </Button>
          </div>
        </div>
      </header>

      <section className="border-b border-slate-200 bg-[#f7f9fb]">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-2 px-4 py-3 sm:grid-cols-4 sm:px-6 lg:grid-cols-7">
          {stageOrder.map((step, index) => {
            const info = getStageInfo(step, learningCase, mode);
            const Icon = info.icon;
            const isCurrent = step === stage;
            const isComplete = stageRank[step] < rank;
            const canEnterProbe =
              step !== 'probe' ||
              stageRank[stage] >= stageRank.probe ||
              teachStudentTurnCount > 0;
            const available =
              canEnterProbe &&
              stepIsAvailable(step, stage) &&
              (step !== 'mastered' || stage === 'mastered' || challengePassed);

            return (
              <button
                type="button"
                key={step}
                disabled={!available}
                onClick={() => setStage(step)}
                className={cn(
                  'flex h-14 min-w-0 items-center gap-2 rounded-lg border px-2.5 text-left text-sm transition-colors disabled:cursor-not-allowed',
                  isComplete
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                    : isCurrent
                      ? 'border-sky-300 bg-white text-sky-950 shadow-sm'
                      : available
                        ? 'border-slate-200 bg-white text-slate-600 hover:border-sky-200'
                        : 'border-slate-200 bg-white/55 text-slate-400',
                )}
              >
                <span
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-md',
                    isComplete
                      ? 'bg-emerald-600 text-white'
                      : isCurrent
                        ? 'bg-sky-600 text-white'
                        : 'bg-slate-100 text-slate-500',
                  )}
                >
                  {isComplete ? (
                    <CheckCircle2 className="size-4" />
                  ) : (
                    <Icon className="size-4" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-semibold uppercase text-current">
                    {index + 1}
                  </span>
                  <span className="block truncate font-semibold">
                    {info.navLabel}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div
            className={cn(
              'border-b p-5',
              activeStatus === 'misconception'
                ? 'border-rose-200 bg-rose-50'
                : activeStatus === 'mastered'
                  ? 'border-emerald-200 bg-emerald-50'
                  : 'border-slate-200 bg-white',
            )}
          >
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <Badge
                  variant="outline"
                  className={cn(
                    'mb-3 h-7 rounded-md px-2.5',
                    statusStyles(activeStatus).badge,
                  )}
                >
                  <CurrentIcon className="size-3.5" />
                  Step {currentIndex + 1}: {current.title}
                </Badge>
                <h2 className="text-3xl font-semibold text-slate-950 sm:text-4xl">
                  {current.headline}
                </h2>
                <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
                  {current.supporting}
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-sm">
                <p className="font-semibold text-slate-950">Concept</p>
                <p className="mt-1 text-slate-500">{learningCase.concept}</p>
                <p className="mt-3 font-semibold text-slate-950">Source</p>
                <p className="mt-1 max-w-48 truncate text-slate-500">
                  {lectureName}
                </p>
                <p className="mt-3 font-semibold text-slate-950">State</p>
                <span
                  className={cn(
                    'mt-1 inline-flex h-7 items-center gap-2 rounded-md border px-2 text-xs font-semibold',
                    statusStyles(activeStatus).badge,
                  )}
                >
                  <span
                    className={cn(
                      'size-2 rounded-full',
                      statusStyles(activeStatus).dot,
                    )}
                  />
                  {statusLabel(activeStatus)}
                </span>
              </div>
            </div>

            <Button
              className={cn(
                'h-11 rounded-lg px-4 text-base text-white',
                activeStatus === 'misconception'
                  ? 'bg-rose-600 hover:bg-rose-700'
                  : activeStatus === 'mastered'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-slate-950 hover:bg-slate-800',
              )}
              disabled={!canUsePrimary}
              onClick={() => void handlePrimaryAction()}
            >
              {isAnalyzing || isAskingFollowUp ? (
                <Sparkles className="size-4 animate-pulse" />
              ) : stage === 'teach' ? (
                <Send className="size-4" />
              ) : stage === 'mastered' ? (
                <RotateCcw className="size-4" />
              ) : (
                <ArrowRight className="size-4" />
              )}
              {primaryLabel}
            </Button>
          </div>

          <div className="p-5">
            <StagePanel
              stage={stage}
              mode={mode}
              draft={draft}
              learningCase={learningCase}
              teachTurns={teachTurns}
              teachStudentTurnCount={teachStudentTurnCount}
              teachingAnswer={teachingAnswer}
              probeAnswer={probeAnswer}
              challengeItems={challengeItems}
              challengeAnswers={challengeAnswers}
              challengeAnswerCount={challengeAnswerCount}
              challengeCorrectCount={challengeCorrectCount}
              challengePassTarget={challengePassTarget}
              challengeScore={challengeScore}
              challengePassed={challengePassed}
              challengeChecked={challengeChecked}
              missedChallengeItems={missedChallengeItems}
              activeStatus={activeStatus}
              activeStatusReason={activeStatusReason}
              reportCopyStatus={reportCopyStatus}
              isAnalyzing={isAnalyzing}
              isAskingFollowUp={isAskingFollowUp}
              analysisSource={analysisSource}
              analysisError={analysisError}
              analysisFeedback={analysisFeedback}
              pdfStatus={pdfStatus}
              pdfMessage={pdfMessage}
              onModeChange={setMode}
              onDraftChange={setDraft}
              onFileUpload={handleFileUpload}
              onLoadDemo={() => loadDemoCase()}
              onStartCustom={startCustomCase}
              onTeachingChange={setTeachingAnswer}
              onProbeChange={setProbeAnswer}
              onSendTeachAnswer={sendTeachAnswer}
              onFinishTeachBack={finishTeachBack}
              onReturnToTeach={() => setStage('teach')}
              onCopyEvidenceReport={copyEvidenceReport}
              onChallengeChange={(questionId, optionId) => {
                setChallengeAnswers((currentAnswers) => ({
                  ...currentAnswers,
                  [questionId]: optionId,
                }));
                setChallengeChecked(false);
                setReportCopyStatus('idle');
              }}
            />
          </div>
        </section>

        <aside className="space-y-5">
          <KnowledgeMap
            nodes={mapNodes}
            stage={stage}
            masteryScore={masteryScore}
            learningCase={learningCase}
            statusReason={activeStatusReason}
          />

          <DemoGuide
            stage={stage}
            mode={mode}
            source={analysisSource}
            teachStudentTurnCount={teachStudentTurnCount}
            challengeAnswerCount={challengeAnswerCount}
            challengeTotal={challengeTotal}
            challengePassTarget={challengePassTarget}
            challengeChecked={challengeChecked}
            challengePassed={challengePassed}
          />

          <TechnicalDetails payload={analysisPayload} source={analysisSource} />
        </aside>
      </div>
    </main>
  );
}

function StagePanel({
  stage,
  mode,
  draft,
  learningCase,
  teachTurns,
  teachStudentTurnCount,
  teachingAnswer,
  probeAnswer,
  challengeItems,
  challengeAnswers,
  challengeAnswerCount,
  challengeCorrectCount,
  challengePassTarget,
  challengeScore,
  challengePassed,
  challengeChecked,
  missedChallengeItems,
  activeStatus,
  activeStatusReason,
  reportCopyStatus,
  isAnalyzing,
  isAskingFollowUp,
  analysisSource,
  analysisError,
  analysisFeedback,
  pdfStatus,
  pdfMessage,
  onModeChange,
  onDraftChange,
  onFileUpload,
  onLoadDemo,
  onStartCustom,
  onTeachingChange,
  onProbeChange,
  onSendTeachAnswer,
  onFinishTeachBack,
  onReturnToTeach,
  onCopyEvidenceReport,
  onChallengeChange,
}: {
  stage: Stage;
  mode: Mode;
  draft: CustomDraft;
  learningCase: LearningCase;
  teachTurns: TeachTurn[];
  teachStudentTurnCount: number;
  teachingAnswer: string;
  probeAnswer: string;
  challengeItems: ChallengeItem[];
  challengeAnswers: ChallengeAnswers;
  challengeAnswerCount: number;
  challengeCorrectCount: number;
  challengePassTarget: number;
  challengeScore: number;
  challengePassed: boolean;
  challengeChecked: boolean;
  missedChallengeItems: ChallengeItem[];
  activeStatus: NodeStatus;
  activeStatusReason: string;
  reportCopyStatus: CopyStatus;
  isAnalyzing: boolean;
  isAskingFollowUp: boolean;
  analysisSource: AnalysisSource;
  analysisError: string;
  analysisFeedback: string;
  pdfStatus: PdfStatus;
  pdfMessage: string;
  onModeChange: (mode: Mode) => void;
  onDraftChange: React.Dispatch<React.SetStateAction<CustomDraft>>;
  onFileUpload: (event: ChangeEvent<HTMLInputElement>) => void | Promise<void>;
  onLoadDemo: () => void;
  onStartCustom: () => void;
  onTeachingChange: (value: string) => void;
  onProbeChange: (value: string) => void;
  onSendTeachAnswer: () => void | Promise<void>;
  onFinishTeachBack: () => void | Promise<void>;
  onReturnToTeach: () => void;
  onCopyEvidenceReport: () => void | Promise<void>;
  onChallengeChange: (questionId: string, optionId: string) => void;
}) {
  if (stage === 'upload') {
    const customReady =
      pdfStatus !== 'reading' &&
      draft.concept.trim().length > 0 &&
      draft.correction.trim().length > 0;

    return (
      <div className="space-y-5">
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500">
                Start here
              </p>
              <h3 className="mt-1 text-xl font-semibold text-slate-950">
                Pick the judge walkthrough or test your own notes.
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                The sample is fastest for a 2-minute demo. Custom mode uses the
                live Gemini route to read your PDF text and build a concept
                interview.
              </p>
            </div>
            <Badge
              variant="outline"
              className="h-7 self-start rounded-md border-emerald-200 bg-emerald-50 px-2.5 text-emerald-800"
            >
              <Sparkles className="size-3.5" />
              Real AI for custom topics
            </Badge>
          </div>
        </section>

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => onModeChange('demo')}
            className={cn(
              'rounded-lg border p-4 text-left transition-colors',
              mode === 'demo'
                ? 'border-sky-300 bg-sky-50'
                : 'border-slate-200 bg-white hover:border-sky-200',
            )}
          >
            <Play className="size-8 text-sky-700" />
            <span className="mt-4 block text-lg font-semibold text-slate-950">
              Polished sample
            </span>
            <span className="mt-2 block text-sm leading-6 text-slate-600">
              Best for the hackathon video and judging walkthrough.
            </span>
          </button>

          <button
            type="button"
            onClick={() => onModeChange('custom')}
            className={cn(
              'rounded-lg border p-4 text-left transition-colors',
              mode === 'custom'
                ? 'border-emerald-300 bg-emerald-50'
                : 'border-slate-200 bg-white hover:border-emerald-200',
            )}
          >
            <Target className="size-8 text-emerald-700" />
            <span className="mt-4 block text-lg font-semibold text-slate-950">
              Try my own topic
            </span>
            <span className="mt-2 block text-sm leading-6 text-slate-600">
              Upload notes or enter a topic, then run the same mastery loop.
            </span>
          </button>
        </div>

        {mode === 'demo' ? (
          <div className="rounded-lg border border-sky-200 bg-sky-50 p-5">
            <p className="font-semibold text-sky-950">
              Sample lecture: {defaultCase.lectureName}
            </p>
            <p className="mt-2 text-sm leading-6 text-sky-800">
              The sample shows the full red-to-green misconception loop for Page
              Faults.
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {judgeDemoSteps.map((step, index) => (
                <div
                  key={step}
                  className="flex items-start gap-2 text-sm text-sky-900"
                >
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-sky-600 text-xs font-semibold text-white">
                    {index + 1}
                  </span>
                  <span className="leading-6">{step}</span>
                </div>
              ))}
            </div>
            <Button
              className="mt-4 rounded-lg bg-slate-950 text-white hover:bg-slate-800"
              onClick={onLoadDemo}
            >
              <Play className="size-4" />
              Start sample
            </Button>
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-5">
            <div className="mb-4 border-b border-slate-200 pb-4">
              <p className="font-semibold text-slate-950">
                How to test with your own material
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {ownTopicSteps.map((step, index) => (
                  <div
                    key={step}
                    className="flex items-start gap-2 text-sm text-slate-700"
                  >
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-emerald-600 text-xs font-semibold text-white">
                      {index + 1}
                    </span>
                    <span className="leading-6">{step}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Lecture or topic name" htmlFor="custom-lecture">
                <Input
                  id="custom-lecture"
                  value={draft.lectureName}
                  onChange={(event) =>
                    onDraftChange((current) => ({
                      ...current,
                      lectureName: event.target.value,
                    }))
                  }
                  className="h-10 bg-white"
                />
              </Field>
              <Field label="Subject area" htmlFor="custom-unit">
                <Input
                  id="custom-unit"
                  value={draft.unit}
                  onChange={(event) =>
                    onDraftChange((current) => ({
                      ...current,
                      unit: event.target.value,
                    }))
                  }
                  className="h-10 bg-white"
                />
              </Field>
              <Field label="Concept to test" htmlFor="custom-concept">
                <Input
                  id="custom-concept"
                  value={draft.concept}
                  placeholder="Example: recursion"
                  onChange={(event) =>
                    onDraftChange((current) => ({
                      ...current,
                      concept: event.target.value,
                    }))
                  }
                  className="h-10 bg-white"
                />
              </Field>
              <Field label="Correct idea" htmlFor="custom-correction">
                <Input
                  id="custom-correction"
                  value={draft.correction}
                  placeholder="Example: a function can call itself with a smaller subproblem"
                  onChange={(event) =>
                    onDraftChange((current) => ({
                      ...current,
                      correction: event.target.value,
                    }))
                  }
                  className="h-10 bg-white"
                />
              </Field>
              <Field label="Related concept 1" htmlFor="custom-related-a">
                <Input
                  id="custom-related-a"
                  value={draft.relatedA}
                  placeholder="Example: functions"
                  onChange={(event) =>
                    onDraftChange((current) => ({
                      ...current,
                      relatedA: event.target.value,
                    }))
                  }
                  className="h-10 bg-white"
                />
              </Field>
              <Field label="Related concept 2" htmlFor="custom-related-b">
                <Input
                  id="custom-related-b"
                  value={draft.relatedB}
                  placeholder="Example: call stack"
                  onChange={(event) =>
                    onDraftChange((current) => ({
                      ...current,
                      relatedB: event.target.value,
                    }))
                  }
                  className="h-10 bg-white"
                />
              </Field>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
              <Field label="Likely confusion" htmlFor="custom-misconception">
                <Textarea
                  id="custom-misconception"
                  value={draft.misconception}
                  placeholder="Example: recursion is just a loop"
                  onChange={(event) =>
                    onDraftChange((current) => ({
                      ...current,
                      misconception: event.target.value,
                    }))
                  }
                  className="min-h-24 resize-none bg-white"
                />
              </Field>
              <Field label="Lecture notes" htmlFor="custom-notes">
                <Textarea
                  id="custom-notes"
                  value={draft.notes}
                  placeholder="Paste a few lines from your notes"
                  onChange={(event) =>
                    onDraftChange((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                  className="min-h-24 resize-none bg-white"
                />
              </Field>
            </div>

            <div
              className={cn(
                'mt-4 flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between',
                pdfStatusStyles(pdfStatus),
              )}
            >
              <p className="text-sm leading-6">{pdfMessage}</p>
              <label
                htmlFor="lecture-upload"
                className={cn(
                  'inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border bg-white px-3 text-sm font-medium',
                  pdfStatus === 'reading'
                    ? 'pointer-events-none border-slate-200 text-slate-400'
                    : 'border-slate-300 text-slate-950',
                )}
              >
                <UploadCloud
                  className={cn(
                    'size-4',
                    pdfStatus === 'reading' && 'animate-pulse',
                  )}
                />
                {pdfStatus === 'reading' ? 'Reading PDF' : 'Upload PDF'}
              </label>
              <input
                id="lecture-upload"
                type="file"
                accept=".pdf"
                className="sr-only"
                disabled={pdfStatus === 'reading'}
                onChange={onFileUpload}
              />
            </div>

            <Button
              className="mt-4 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
              disabled={!customReady}
              onClick={onStartCustom}
            >
              <ArrowRight className="size-4" />
              {pdfStatus === 'reading' ? 'Reading PDF...' : 'Start custom test'}
            </Button>
          </div>
        )}
      </div>
    );
  }

  if (stage === 'map') {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {[
          ['1', 'Concept chosen', learningCase.concept],
          [
            '2',
            'Map created',
            `${learningCase.unit} -> ${learningCase.concept}`,
          ],
          ['3', 'Weak spot ready', learningCase.misconception],
        ].map(([number, title, body]) => (
          <div
            key={title}
            className="rounded-lg border border-slate-200 bg-slate-50 p-4"
          >
            <span className="flex size-8 items-center justify-center rounded-md bg-slate-950 text-sm font-semibold text-white">
              {number}
            </span>
            <h3 className="mt-4 font-semibold text-slate-950">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
          </div>
        ))}
      </div>
    );
  }

  if (stage === 'teach') {
    const readyForDiagnosis =
      teachStudentTurnCount > 0 || teachingAnswer.trim().length > 0;

    return (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
        <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500">
                AI teachback interview
              </p>
              <h3 className="mt-1 text-lg font-semibold text-slate-950">
                Round {Math.max(1, teachStudentTurnCount + 1)}
              </h3>
            </div>
            <Badge
              variant="outline"
              className="h-7 rounded-md border-sky-200 bg-sky-50 px-2.5 text-sky-800"
            >
              {teachStudentTurnCount} answers sent
            </Badge>
          </div>

          <div className="max-h-[420px] space-y-3 overflow-auto pr-1">
            {teachTurns.map((turn) => (
              <TeachTurnBubble key={turn.id} turn={turn} />
            ))}
            {isAskingFollowUp && (
              <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm font-semibold text-sky-800">
                TeachMap is reading your explanation and asking a deeper
                question...
              </div>
            )}
          </div>

          <label
            htmlFor="teach-answer"
            className="mt-4 block text-sm font-semibold text-slate-700"
          >
            Student answer
          </label>
          <Textarea
            id="teach-answer"
            value={teachingAnswer}
            placeholder={`Explain ${learningCase.concept} in your own words.`}
            onChange={(event) => onTeachingChange(event.target.value)}
            className="mt-2 min-h-28 resize-none rounded-lg bg-white text-base leading-7"
          />

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Button
              className="rounded-lg bg-slate-950 text-white hover:bg-slate-800"
              disabled={!teachingAnswer.trim() || isAskingFollowUp}
              onClick={() => void onSendTeachAnswer()}
            >
              <Send className="size-4" />
              Send to AI
            </Button>
            <Button
              variant="outline"
              className="rounded-lg bg-white"
              disabled={!readyForDiagnosis || isAskingFollowUp}
              onClick={() => void onFinishTeachBack()}
            >
              <ArrowRight className="size-4" />
              Find what to fix
            </Button>
          </div>
        </section>

        <aside className="rounded-lg border border-sky-200 bg-sky-50 p-4">
          <BrainCircuit className="size-8 text-sky-700" />
          <h3 className="mt-4 font-semibold text-sky-950">
            What TeachMap listens for
          </h3>
          <div className="mt-4 space-y-3">
            {[
              ['Meaning', `Can the student define ${learningCase.concept}?`],
              [
                'Boundary',
                'Do they know when it applies and when it does not?',
              ],
              ['Mechanism', 'Can they explain cause and effect?'],
              [
                'Transfer',
                `Can they connect it to ${learningCase.related[0]}?`,
              ],
            ].map(([label, body]) => (
              <div key={label} className="rounded-lg bg-white/75 p-3">
                <p className="text-xs font-semibold uppercase text-sky-700">
                  {label}
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-700">{body}</p>
              </div>
            ))}
          </div>
        </aside>
      </div>
    );
  }

  if (stage === 'probe') {
    const latestStudentTurn = [...teachTurns]
      .reverse()
      .find((turn) => turn.role === 'student');

    return (
      <div className="grid gap-4">
        {latestStudentTurn && (
          <ConversationBubble speaker="Latest student answer" tone="neutral">
            {latestStudentTurn.text}
          </ConversationBubble>
        )}
        <ConversationBubble speaker="TeachMap AI" tone="sky">
          {learningCase.probeQuestion}
        </ConversationBubble>
        <div>
          <label
            htmlFor="probe-answer"
            className="text-sm font-semibold text-slate-700"
          >
            Final student answer
          </label>
          <Textarea
            id="probe-answer"
            value={probeAnswer}
            placeholder="Answer the AI's pressure-test question."
            onChange={(event) => onProbeChange(event.target.value)}
            className="mt-2 min-h-28 resize-none rounded-lg bg-white text-base leading-7"
          />
        </div>
        <Button
          variant="outline"
          className="w-fit rounded-lg bg-white"
          onClick={onReturnToTeach}
        >
          <MessageSquareText className="size-4" />
          Ask another follow-up first
        </Button>
        {mode === 'custom' && (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">
            {isAnalyzing
              ? 'TeachMap is reading the full interview and building a concept-specific mastery check.'
              : 'Next, TeachMap will analyze the full interview, not just one answer.'}
          </p>
        )}
      </div>
    );
  }

  if (stage === 'result') {
    return (
      <div className="grid gap-4">
        <AnalysisNotice
          source={analysisSource}
          warning={analysisError}
          feedback={analysisFeedback}
        />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-5">
            <div className="flex items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-lg bg-rose-600 text-white">
                <AlertTriangle className="size-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-rose-700">
                  Misconception detected
                </p>
                <h3 className="text-xl font-semibold text-rose-950">
                  {learningCase.misconception}
                </h3>
              </div>
            </div>
            <p className="mt-4 text-sm leading-7 text-rose-900">
              The missing idea is: {learningCase.missingPiece} That is why the
              {` ${learningCase.concept} `} node turns red.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <p className="text-sm font-semibold text-slate-950">
              Target for the fix
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Separate these two ideas:
            </p>
            <div className="mt-4 space-y-2">
              <StatusLine color="rose" label={learningCase.misconception} />
              <StatusLine color="emerald" label={learningCase.missingPiece} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (stage === 'challenge') {
    const answerProgress = challengeItems.length
      ? Math.round((challengeAnswerCount / challengeItems.length) * 100)
      : 0;
    const resultTone = challengePassed
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
      : challengeChecked
        ? 'border-amber-200 bg-amber-50 text-amber-950'
        : 'border-slate-200 bg-slate-50 text-slate-700';

    return (
      <div className="grid gap-4">
        <div className={cn('rounded-lg border p-4', resultTone)}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold">10-question mastery check</p>
              <p className="mt-2 text-sm leading-6">
                {challengeChecked
                  ? `${challengeCorrectCount}/${challengeItems.length} correct. ${challengePassTarget}/${challengeItems.length} correct is mastered.`
                  : `${challengeAnswerCount}/${challengeItems.length} answered. The map turns green at ${challengePassTarget}/${challengeItems.length} correct.`}
              </p>
            </div>
            <div className="min-w-24 rounded-lg border border-current/20 bg-white/70 p-3 text-center">
              <p className="text-2xl font-semibold tabular-nums">
                {challengeChecked ? challengeScore : answerProgress}%
              </p>
              <p className="text-xs font-semibold uppercase">
                {challengeChecked ? 'score' : 'answered'}
              </p>
            </div>
          </div>
          <Progress
            value={challengeChecked ? challengeScore : answerProgress}
            className="mt-4"
          >
            <ProgressLabel>
              {challengeChecked ? 'Mastery score' : 'Answer progress'}
            </ProgressLabel>
            <span className="ml-auto text-sm tabular-nums">
              {challengeChecked
                ? `${challengeCorrectCount}/${challengeItems.length}`
                : `${challengeAnswerCount}/${challengeItems.length}`}
            </span>
          </Progress>
        </div>

        <div className="grid gap-4">
          {challengeItems.map((item, index) => {
            const selectedAnswer = challengeAnswers[item.id] ?? '';
            const correctOption = item.options.find(
              (optionItem) => optionItem.id === item.correctOptionId,
            );

            return (
              <section
                key={item.id}
                className="rounded-lg border border-slate-200 bg-white p-4"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase text-slate-500">
                      Check {index + 1}
                    </p>
                    <h3 className="mt-1 text-base font-semibold text-slate-950">
                      {item.question}
                    </h3>
                  </div>
                  <Badge
                    variant="outline"
                    className="h-7 self-start rounded-md border-slate-200 bg-slate-50 px-2.5 text-slate-600"
                  >
                    {item.focus}
                  </Badge>
                </div>

                <div className="mt-3 grid gap-2">
                  {item.options.map((optionItem) => {
                    const selected = selectedAnswer === optionItem.id;
                    const correct =
                      challengeChecked &&
                      optionItem.id === item.correctOptionId;
                    const wrong =
                      challengeChecked &&
                      selected &&
                      optionItem.id !== item.correctOptionId;

                    return (
                      <button
                        type="button"
                        key={optionItem.id}
                        data-question-id={item.id}
                        data-option-id={optionItem.id}
                        aria-pressed={selected}
                        onClick={() =>
                          onChallengeChange(item.id, optionItem.id)
                        }
                        className={cn(
                          'rounded-lg border p-3 text-left transition-colors',
                          correct
                            ? 'border-emerald-300 bg-emerald-50'
                            : wrong
                              ? 'border-rose-300 bg-rose-50'
                              : selected
                                ? 'border-sky-300 bg-sky-50'
                                : 'border-slate-200 bg-white hover:border-sky-200 hover:bg-slate-50',
                        )}
                      >
                        <span className="flex items-start gap-3 font-semibold text-slate-950">
                          <span
                            className={cn(
                              'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border',
                              selected
                                ? 'border-sky-600 bg-sky-600'
                                : 'border-slate-300',
                              correct && 'border-emerald-600 bg-emerald-600',
                              wrong && 'border-rose-600 bg-rose-600',
                            )}
                          >
                            {(selected || correct) && (
                              <span className="size-2 rounded-full bg-white" />
                            )}
                          </span>
                          <span>{optionItem.label}</span>
                        </span>
                        <span className="mt-2 block pl-8 text-sm leading-6 text-slate-600">
                          {optionItem.detail}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {challengeChecked &&
                  selectedAnswer !== item.correctOptionId && (
                    <p
                      className={cn(
                        'mt-3 rounded-lg border p-3 text-sm leading-6',
                        selectedAnswer
                          ? 'border-rose-200 bg-rose-50 text-rose-900'
                          : 'border-amber-200 bg-amber-50 text-amber-950',
                      )}
                    >
                      Correct idea:{' '}
                      {correctOption?.label ?? 'Review the missing idea.'}
                    </p>
                  )}
              </section>
            );
          })}
        </div>

        {challengeChecked && !challengePassed && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-white">
                <ListChecks className="size-5" />
              </span>
              <div>
                <p className="font-semibold">Repair queue</p>
                <p className="mt-1 text-sm leading-6">
                  This is still developing. The map turns green after
                  {` ${challengePassTarget}/${challengeItems.length} `}
                  correct answers, so TeachMap keeps the missed ideas visible.
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {missedChallengeItems.slice(0, 4).map((item) => {
                const correctOption = item.options.find(
                  (optionItem) => optionItem.id === item.correctOptionId,
                );

                return (
                  <div
                    key={item.id}
                    className="rounded-lg border border-amber-200 bg-white/75 p-3"
                  >
                    <p className="text-xs font-semibold uppercase text-amber-700">
                      {item.focus}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-slate-700">
                      {correctOption?.label ?? 'Review the correct idea.'}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {challengeChecked && challengePassed && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white">
                <ClipboardCheck className="size-5" />
              </span>
              <div>
                <p className="font-semibold">Ready to update the map</p>
                <p className="mt-1 text-sm leading-6">
                  {challengeCorrectCount}/{challengeItems.length} correct meets
                  the evidence rule. The next click turns {learningCase.concept}{' '}
                  green and creates the final report.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white">
            <CheckCircle2 className="size-7" />
          </span>
          <div>
            <p className="text-sm font-semibold text-emerald-700">
              Mastery map updated
            </p>
            <h3 className="text-2xl font-semibold text-emerald-950">
              {learningCase.concept} changed from red to green.
            </h3>
            <p className="mt-2 text-sm leading-6 text-emerald-900">
              {activeStatusReason}
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            [
              'Score',
              `${challengeCorrectCount}/${challengeItems.length}`,
              `${challengeScore}% correct`,
            ],
            [
              'Green rule',
              `${challengePassTarget}/${challengeItems.length}`,
              'required for mastery',
            ],
            ['Current status', statusLabel(activeStatus), 'map node is green'],
          ].map(([label, value, detail]) => (
            <div
              key={label}
              className="rounded-lg border border-emerald-200 bg-white/80 p-3"
            >
              <p className="text-xs font-semibold uppercase text-emerald-700">
                {label}
              </p>
              <p className="mt-1 text-xl font-semibold text-slate-950">
                {value}
              </p>
              <p className="mt-1 text-sm leading-5 text-slate-600">{detail}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="size-5 text-emerald-600" />
            <h3 className="font-semibold text-slate-950">
              What TeachMap proved
            </h3>
          </div>
          <div className="mt-4 grid gap-3">
            {[
              ['Misconception repaired', learningCase.misconception],
              ['Correct idea applied', learningCase.missingPiece],
              [
                'Related concepts checked',
                `${learningCase.related[0]} and ${learningCase.related[1]}`,
              ],
              [
                'Evidence threshold met',
                `${challengeCorrectCount}/${challengeItems.length} correct across the targeted check`,
              ],
            ].map(([title, body]) => (
              <div key={title} className="flex items-start gap-3">
                <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <CheckCircle2 className="size-3.5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-950">
                    {title}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    {body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-slate-50 p-5">
          <div className="flex items-center gap-2">
            <FileText className="size-5 text-slate-700" />
            <h3 className="font-semibold text-slate-950">Evidence report</h3>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Use this short report in a demo, teacher handoff, or hackathon
            explanation.
          </p>
          <div className="mt-4 space-y-2">
            <ReportRow
              label="Result"
              value={`${statusLabel(activeStatus)} with ${challengeCorrectCount}/${challengeItems.length} correct`}
            />
            <ReportRow label="Why" value={activeStatusReason} />
            <ReportRow
              label="Next step"
              value="Review again later, then try a mixed-topic check."
            />
          </div>
          <Button
            variant="outline"
            className="mt-3 w-full rounded-lg bg-white"
            onClick={() => void onCopyEvidenceReport()}
          >
            <Copy className="size-4" />
            {reportCopyStatus === 'copied'
              ? 'Copied'
              : reportCopyStatus === 'error'
                ? 'Copy unavailable'
                : 'Copy report'}
          </Button>
        </section>
      </div>
    </div>
  );
}

function ReportRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2.5">
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-sm leading-6 text-slate-700">{value}</p>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block" htmlFor={htmlFor}>
      <span className="mb-2 block text-sm font-semibold text-slate-700">
        {label}
      </span>
      {children}
    </label>
  );
}

function ConversationBubble({
  speaker,
  tone,
  children,
}: {
  speaker: string;
  tone: 'neutral' | 'sky';
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border p-4',
        tone === 'sky'
          ? 'border-sky-200 bg-sky-50'
          : 'border-slate-200 bg-slate-50',
      )}
    >
      <p className="mb-1 text-xs font-semibold uppercase text-slate-500">
        {speaker}
      </p>
      <p className="text-sm leading-7 text-slate-800">{children}</p>
    </div>
  );
}

function TeachTurnBubble({ turn }: { turn: TeachTurn }) {
  const aiTurn = turn.role === 'ai';

  return (
    <div
      className={cn(
        'rounded-lg border p-4',
        aiTurn
          ? 'border-sky-200 bg-white text-slate-800'
          : 'border-emerald-200 bg-emerald-50 text-emerald-950',
      )}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span
          className={cn(
            'inline-flex size-7 items-center justify-center rounded-md text-white',
            aiTurn ? 'bg-sky-600' : 'bg-emerald-600',
          )}
        >
          {aiTurn ? (
            <BrainCircuit className="size-4" />
          ) : (
            <MessageSquareText className="size-4" />
          )}
        </span>
        <p className="text-xs font-semibold uppercase text-slate-500">
          {aiTurn ? 'TeachMap AI asks' : 'Student teaches'}
        </p>
        {turn.focus && (
          <Badge
            variant="outline"
            className="h-6 rounded-md border-slate-200 bg-slate-50 px-2 text-slate-600"
          >
            {turn.focus}
          </Badge>
        )}
      </div>
      <p className="text-sm leading-7">{turn.text}</p>
      {turn.feedback && (
        <p className="mt-3 rounded-lg border border-sky-100 bg-sky-50 p-3 text-sm leading-6 text-sky-900">
          {turn.feedback}
        </p>
      )}
    </div>
  );
}

function AnalysisNotice({
  source,
  warning,
  feedback,
}: {
  source: AnalysisSource;
  warning: string;
  feedback: string;
}) {
  const connected = source === 'gemini';
  const sample = source === 'scripted_demo';
  const title =
    source === 'gemini'
      ? 'Gemini diagnosis complete'
      : sample
        ? 'Sample diagnosis complete'
        : 'Analysis complete';

  return (
    <div
      className={cn(
        'rounded-lg border p-4',
        connected
          ? 'border-emerald-200 bg-emerald-50'
          : sample
            ? 'border-sky-200 bg-sky-50'
            : 'border-sky-200 bg-sky-50',
      )}
    >
      <p
        className={cn(
          'text-sm font-semibold',
          connected
            ? 'text-emerald-800'
            : sample
              ? 'text-sky-800'
              : 'text-sky-800',
        )}
      >
        {title}
      </p>
      <p
        className={cn(
          'mt-2 text-sm leading-6',
          connected
            ? 'text-emerald-900'
            : sample
              ? 'text-sky-900'
              : 'text-sky-900',
        )}
      >
        {warning ||
          feedback ||
          'TeachMap found the missing idea and prepared a mastery check.'}
      </p>
    </div>
  );
}

function StatusLine({
  color,
  label,
}: {
  color: 'rose' | 'emerald';
  label: string;
}) {
  return (
    <div className="flex items-start gap-2 text-sm text-slate-700">
      <span
        className={cn(
          'mt-1.5 size-2.5 shrink-0 rounded-full',
          color === 'rose' ? 'bg-rose-500' : 'bg-emerald-500',
        )}
      />
      <span>{label}</span>
    </div>
  );
}

function KnowledgeMap({
  nodes,
  stage,
  masteryScore,
  learningCase,
  statusReason,
}: {
  nodes: Array<{
    id: string;
    label: string;
    status: NodeStatus;
    x: number;
    y: number;
  }>;
  stage: Stage;
  masteryScore: number;
  learningCase: LearningCase;
  statusReason: string;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">
              Knowledge map
            </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-950">
              {learningCase.unit}
            </h2>
          </div>
          <Badge
            variant="outline"
            className={cn(
              'h-7 rounded-md px-2.5',
              stage === 'mastered'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : stageRank[stage] >= stageRank.result
                  ? 'border-rose-200 bg-rose-50 text-rose-800'
                  : 'border-sky-200 bg-sky-50 text-sky-800',
            )}
          >
            {masteryScore}% score
          </Badge>
        </div>
        <Progress value={masteryScore} className="mt-4">
          <ProgressLabel>{learningCase.concept} mastery</ProgressLabel>
          <span className="ml-auto text-sm tabular-nums text-slate-500">
            {masteryScore}%
          </span>
        </Progress>
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase text-slate-500">
            Status evidence
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-700">
            {statusReason}
          </p>
        </div>
      </div>

      <div className="relative h-[360px] bg-[#f7f9fb]">
        <svg
          className="absolute inset-0 size-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {[
            ['unit', 'related-a'],
            ['unit', 'related-b'],
            ['unit', 'concept'],
          ].map(([from, to]) => {
            const start = nodes.find((item) => item.id === from)!;
            const end = nodes.find((item) => item.id === to)!;
            const alertLine =
              stageRank[stage] >= stageRank.result && stage !== 'mastered';

            return (
              <line
                key={`${from}-${to}`}
                x1={start.x}
                y1={start.y}
                x2={end.x}
                y2={end.y}
                stroke={alertLine && to === 'concept' ? '#fb7185' : '#94a3b8'}
                strokeWidth={alertLine && to === 'concept' ? 0.85 : 0.5}
                strokeDasharray={
                  alertLine && to === 'concept' ? '1.6 1.6' : undefined
                }
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </svg>

        {nodes.map((node) => (
          <div
            key={node.id}
            className={cn(
              'absolute flex h-[72px] w-[146px] -translate-x-1/2 -translate-y-1/2 flex-col justify-center rounded-lg border px-3 text-left transition-all duration-500',
              statusStyles(node.status).node,
              node.id === 'concept' && 'h-[84px] w-[170px]',
              node.id === 'concept' && stage === 'mastered' && 'scale-105',
            )}
            style={{ left: `${node.x}%`, top: `${node.y}%` }}
          >
            <span className="mb-1 flex items-center gap-2 text-xs font-semibold">
              {node.status === 'mastered' ? (
                <CheckCircle2 className="size-3.5 text-emerald-600" />
              ) : node.status === 'misconception' ? (
                <AlertTriangle className="size-3.5 text-rose-600" />
              ) : (
                <CircleDot className="size-3.5 text-slate-400" />
              )}
              {statusLabel(node.status)}
            </span>
            <span className="truncate text-sm font-semibold">{node.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function DemoGuide({
  stage,
  mode,
  source,
  teachStudentTurnCount,
  challengeAnswerCount,
  challengeTotal,
  challengePassTarget,
  challengeChecked,
  challengePassed,
}: {
  stage: Stage;
  mode: Mode;
  source: AnalysisSource;
  teachStudentTurnCount: number;
  challengeAnswerCount: number;
  challengeTotal: number;
  challengePassTarget: number;
  challengeChecked: boolean;
  challengePassed: boolean;
}) {
  const nextMove = (() => {
    if (stage === 'upload') {
      return mode === 'custom'
        ? 'Upload a text-based PDF, then check the auto-filled fields.'
        : 'Click Start sample for the fastest judge walkthrough.';
    }

    if (stage === 'map') {
      return 'Click Teach to start the student explanation.';
    }

    if (stage === 'teach') {
      return teachStudentTurnCount === 0
        ? 'Send the first student explanation so AI can ask a deeper question.'
        : 'Keep answering, or click Find what to fix when you have enough evidence.';
    }

    if (stage === 'probe') {
      return 'Answer the pressure-test question, then reveal the misconception.';
    }

    if (stage === 'result') {
      return 'Show the red node, then start the targeted mastery check.';
    }

    if (stage === 'challenge') {
      if (!challengeChecked) {
        return `Answer all ${challengeTotal} checks. Green needs ${challengePassTarget}/${challengeTotal}.`;
      }

      return challengePassed
        ? 'Click Update mastery map to show the red-to-green moment.'
        : 'Use the repair queue, revise answers, and retake the check.';
    }

    return 'Copy the evidence report for the submission or demo narration.';
  })();

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-slate-500">
            Demo guide
          </p>
          <h2 className="mt-1 text-lg font-semibold text-slate-950">
            What to do next
          </h2>
        </div>
        <Badge
          variant="outline"
          className={cn('h-7 rounded-md px-2.5', analysisSourceStyles(source))}
        >
          {analysisSourceLabel(source)}
        </Badge>
      </div>

      <p className="mt-3 text-sm leading-6 text-slate-700">{nextMove}</p>

      <div className="mt-4 border-t border-slate-200 pt-4">
        <p className="text-xs font-semibold uppercase text-slate-500">
          Judge story
        </p>
        <div className="mt-3 space-y-2">
          {[
            'Student teaches first.',
            'AI probes reasoning.',
            'Misconception turns the node red.',
            `Mastery turns green at ${challengePassTarget}/${challengeTotal}.`,
          ].map((item) => (
            <div
              key={item}
              className="flex items-start gap-2 text-sm text-slate-700"
            >
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              <span className="leading-6">{item}</span>
            </div>
          ))}
        </div>
      </div>

      {stage === 'challenge' && !challengeChecked && (
        <div className="mt-4 border-t border-slate-200 pt-4">
          <p className="text-xs font-semibold uppercase text-slate-500">
            Progress
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            {challengeAnswerCount}/{challengeTotal} answers selected.
          </p>
        </div>
      )}
    </section>
  );
}

function TechnicalDetails({
  payload,
  source,
}: {
  payload: Record<string, unknown>;
  source: AnalysisSource;
}) {
  return (
    <details className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-left">
        <span>
          <span className="block text-xs font-semibold uppercase text-slate-500">
            Optional judge view
          </span>
          <span className="mt-1 block text-lg font-semibold text-slate-950">
            AI evidence JSON
          </span>
        </span>
        <Lightbulb className="size-5 text-amber-500" />
      </summary>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        {source === 'gemini'
          ? 'This structured AI output drives the map, challenge, and evidence report. Students can ignore this panel.'
          : 'This structured output shows how TeachMap drives the map, challenge, and mastery update. Students can ignore this panel.'}
      </p>
      <pre className="mt-3 max-h-56 overflow-auto rounded-lg bg-slate-950 p-3 text-xs leading-5 text-slate-100">
        {JSON.stringify(payload, null, 2)}
      </pre>
    </details>
  );
}
