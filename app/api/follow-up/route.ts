import {
  generateJsonWithAI,
  type LiveAiSource,
} from '../ai-provider';

type TeachTurn = {
  role?: 'ai' | 'student';
  text?: string;
  focus?: string;
};

type FollowUpRequest = {
  lectureName?: string;
  unit?: string;
  concept?: string;
  related?: string[];
  notes?: string;
  misconception?: string;
  correction?: string;
  conversation?: TeachTurn[];
  round?: number;
};

type FollowUpResponse = {
  question: string;
  focus: string;
  feedback: string;
  source: LiveAiSource | 'local_fallback';
  warning?: string;
};

const followUpSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    question: { type: 'string' },
    focus: { type: 'string' },
    feedback: { type: 'string' },
  },
  required: ['question', 'focus', 'feedback'],
};

function clean(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : fallback;
}

function cleanRound(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(1, Math.round(value))
    : 1;
}

function normalizedRelated(value: unknown, concept: string) {
  if (!Array.isArray(value)) {
    return [`${concept} basics`, `${concept} application`];
  }

  const items = value
    .map((item) => clean(item, ''))
    .filter((item) => item.length > 0);

  return items.length >= 2
    ? items.slice(0, 2)
    : [`${concept} basics`, `${concept} application`];
}

function lastStudentAnswer(conversation: unknown) {
  if (!Array.isArray(conversation)) {
    return '';
  }

  const studentTurn = [...conversation]
    .reverse()
    .find(
      (turn) =>
        turn &&
        typeof turn === 'object' &&
        (turn as TeachTurn).role === 'student',
    ) as TeachTurn | undefined;

  return clean(studentTurn?.text, '');
}

function buildFallbackFollowUp(body: FollowUpRequest): FollowUpResponse {
  const concept = clean(body.concept, 'this concept');
  const [firstRelated, secondRelated] = normalizedRelated(body.related, concept);
  const correction = clean(
    body.correction,
    `the key condition that makes ${concept} work`,
  );
  const misconception = clean(
    body.misconception,
    `an incomplete explanation of ${concept}`,
  );
  const answer = lastStudentAnswer(body.conversation).toLowerCase();
  const round = cleanRound(body.round);
  const correctionKeywords = correction
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 4);
  const mentionsCorrection = correctionKeywords.some((word) =>
    answer.includes(word),
  );

  if (!mentionsCorrection && round <= 2) {
    return {
      question: `I heard a possible gap. Can you give one example where ${concept} follows this idea: ${correction}`,
      focus: 'Missing condition',
      feedback:
        'The next answer should connect the concept to the condition, not only the definition.',
      source: 'local_fallback',
    };
  }

  const questions: Array<Omit<FollowUpResponse, 'source'>> = [
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
      feedback:
        'This asks for mechanism, not just recognition of the term.',
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
      feedback:
        'This tests transfer across related concepts from the lecture.',
    },
  ];
  const selected = questions[(round - 1) % questions.length];

  return {
    ...selected,
    source: 'local_fallback',
  };
}

function normalizeFollowUp(
  raw: unknown,
  fallback: FollowUpResponse,
  source: LiveAiSource,
): FollowUpResponse {
  if (!raw || typeof raw !== 'object') {
    return fallback;
  }

  const record = raw as Record<string, unknown>;

  return {
    question: clean(record.question, fallback.question),
    focus: clean(record.focus, fallback.focus),
    feedback: clean(record.feedback, fallback.feedback),
    source,
  };
}

export async function POST(request: Request) {
  let body: FollowUpRequest;

  try {
    body = (await request.json()) as FollowUpRequest;
  } catch {
    body = {};
  }

  const fallback = buildFallbackFollowUp(body);

  const aiResult = await generateJsonWithAI({
    schemaName: 'teachmap_follow_up',
    schema: followUpSchema,
    system:
      'You are TeachMap AI, a Socratic tutor. Ask exactly one deep follow-up question that tests concept understanding. Do not mention app UI, mastery maps, scores, or buttons. Do not give away the answer.',
    user: {
      task: 'Ask the next teachback interview question.',
      lecture: body.lectureName,
      unit: body.unit,
      concept: body.concept,
      related_concepts: body.related,
      lecture_notes: body.notes,
      likely_misconception: body.misconception,
      correct_idea: body.correction,
      round: body.round,
      conversation: body.conversation,
      constraints: [
        'Ask one question only.',
        'Pressure-test boundaries, examples, mechanisms, or misconceptions.',
        'Make the question answerable by a student in two to five sentences.',
        'Return a short focus label and a short private feedback note about what the question tests.',
      ],
    },
  });

  if (aiResult.ok) {
    return Response.json(
      normalizeFollowUp(aiResult.data, fallback, aiResult.source),
    );
  }

  if (aiResult.attempted) {
    return Response.json({
      ...fallback,
      warning:
        'Live AI follow-up was unavailable, so TeachMap used guided local questioning.',
    });
  }

  return Response.json(fallback);
}
