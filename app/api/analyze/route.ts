import {
  generateJsonWithAI,
  type LiveAiSource,
} from '../ai-provider';

type ChallengeOption = {
  id: string;
  label: string;
  detail: string;
};

type AnalyzeRequest = {
  mode?: 'demo' | 'custom';
  lectureName?: string;
  unit?: string;
  concept?: string;
  related?: string[];
  notes?: string;
  expectedMisconception?: string;
  expectedCorrection?: string;
  teachingAnswer?: string;
  probeAnswer?: string;
};

type DiagnosisResponse = {
  concept: string;
  mastery_score: number;
  misconception: string;
  missing_piece: string;
  probe_question: string;
  challenge_question: string;
  challenge_options: ChallengeOption[];
  correct_option_id: string;
  feedback: string;
  source: LiveAiSource | 'local_fallback';
  warning?: string;
};

const diagnosisSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    concept: { type: 'string' },
    mastery_score: { type: 'number' },
    misconception: { type: 'string' },
    missing_piece: { type: 'string' },
    probe_question: { type: 'string' },
    challenge_question: { type: 'string' },
    challenge_options: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          label: { type: 'string' },
          detail: { type: 'string' },
        },
        required: ['id', 'label', 'detail'],
      },
    },
    correct_option_id: { type: 'string' },
    feedback: { type: 'string' },
  },
  required: [
    'concept',
    'mastery_score',
    'misconception',
    'missing_piece',
    'probe_question',
    'challenge_question',
    'challenge_options',
    'correct_option_id',
    'feedback',
  ],
};

function clean(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : fallback;
}

function clampScore(value: unknown, fallback: number) {
  const score = typeof value === 'number' ? value : fallback;
  return Math.min(100, Math.max(0, Math.round(score)));
}

function makeOptions(concept: string, misconception: string, correction: string) {
  return [
    {
      id: 'repeat-confusion',
      label: misconception,
      detail: 'This repeats the same misunderstanding.',
    },
    {
      id: 'target-correction',
      label: correction,
      detail: `Correct: this fixes the reasoning about ${concept}.`,
    },
    {
      id: 'definition-only',
      label: `Memorize a short definition of ${concept}.`,
      detail: 'This may help recall, but it does not repair the reasoning.',
    },
  ];
}

function buildFallbackDiagnosis(body: AnalyzeRequest): DiagnosisResponse {
  const concept = clean(body.concept, 'this concept');
  const unit = clean(body.unit, 'this subject');
  const misconception = clean(
    body.expectedMisconception,
    `The explanation mixes up ${concept} with a nearby idea in ${unit}.`,
  );
  const correction = clean(
    body.expectedCorrection,
    `The student should explain the key condition that makes ${concept} work.`,
  );
  const teachingAnswer = clean(body.teachingAnswer, '');
  const probeAnswer = clean(body.probeAnswer, '');
  const answerText = `${teachingAnswer} ${probeAnswer}`.toLowerCase();
  const correctionTokens = correction
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 4);
  const matchedTokens = correctionTokens.filter((token) =>
    answerText.includes(token),
  ).length;
  const score = clampScore(
    38 +
      Math.min(26, matchedTokens * 7) +
      (teachingAnswer.length > 90 ? 8 : 0) +
      (probeAnswer.length > 60 ? 8 : 0),
    46,
  );

  return {
    concept,
    mastery_score: score,
    misconception,
    missing_piece: correction,
    probe_question: `Can you explain how ${concept} changes when this is true: ${correction}`,
    challenge_question: `Which answer best fixes the confusion about ${concept}?`,
    challenge_options: makeOptions(concept, misconception, correction),
    correct_option_id: 'target-correction',
    feedback:
      'TeachMap used the custom inputs and the student answers to find the likely missing idea.',
    source: 'local_fallback',
  };
}

function normalizeOptions(
  options: unknown,
  fallback: ChallengeOption[],
): ChallengeOption[] {
  if (!Array.isArray(options)) {
    return fallback;
  }

  const normalized = options
    .map((option, index) => {
      if (!option || typeof option !== 'object') {
        return null;
      }

      const record = option as Record<string, unknown>;
      const id = clean(record.id, `option-${index + 1}`)
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '');

      return {
        id: id || `option-${index + 1}`,
        label: clean(record.label, fallback[index]?.label ?? 'Answer option'),
        detail: clean(record.detail, fallback[index]?.detail ?? ''),
      };
    })
    .filter((option): option is ChallengeOption => option !== null)
    .slice(0, 4);

  return normalized.length >= 2 ? normalized : fallback;
}

function normalizeDiagnosis(
  raw: unknown,
  fallback: DiagnosisResponse,
  source: LiveAiSource,
): DiagnosisResponse {
  if (!raw || typeof raw !== 'object') {
    return fallback;
  }

  const record = raw as Record<string, unknown>;
  const challengeOptions = normalizeOptions(
    record.challenge_options,
    fallback.challenge_options,
  );
  const requestedCorrectId = clean(
    record.correct_option_id,
    fallback.correct_option_id,
  );
  const correctOptionId = challengeOptions.some(
    (option) => option.id === requestedCorrectId,
  )
    ? requestedCorrectId
    : challengeOptions[0].id;

  return {
    concept: clean(record.concept, fallback.concept),
    mastery_score: clampScore(record.mastery_score, fallback.mastery_score),
    misconception: clean(record.misconception, fallback.misconception),
    missing_piece: clean(record.missing_piece, fallback.missing_piece),
    probe_question: clean(record.probe_question, fallback.probe_question),
    challenge_question: clean(
      record.challenge_question,
      fallback.challenge_question,
    ),
    challenge_options: challengeOptions,
    correct_option_id: correctOptionId,
    feedback: clean(record.feedback, fallback.feedback),
    source,
  };
}

export async function POST(request: Request) {
  let body: AnalyzeRequest;

  try {
    body = (await request.json()) as AnalyzeRequest;
  } catch {
    body = {};
  }

  const fallback = buildFallbackDiagnosis(body);

  const aiResult = await generateJsonWithAI({
    schemaName: 'teachmap_diagnosis',
    schema: diagnosisSchema,
    system:
      'You are TeachMap AI, a careful learning-science tutor. Diagnose the misconception behind a teachback interview transcript, name the missing idea, and create one concept-specific multiple-choice challenge. Test understanding of the concept itself, not the app UI, mastery map, scores, or buttons. Be specific, concise, and supportive.',
    user: {
      task: 'Diagnose this TeachBack attempt.',
      lecture: body.lectureName,
      unit: body.unit,
      concept: body.concept,
      related_concepts: body.related,
      lecture_notes: body.notes,
      expected_correction: body.expectedCorrection,
      likely_confusion: body.expectedMisconception,
      teachback_interview_transcript: body.teachingAnswer,
      final_probe_answer: body.probeAnswer,
    },
  });

  if (aiResult.ok) {
    return Response.json(
      normalizeDiagnosis(aiResult.data, fallback, aiResult.source),
    );
  }

  if (aiResult.attempted) {
    return Response.json({
      ...fallback,
      warning:
        'Live AI analysis was unavailable, so TeachMap used guided local analysis.',
    });
  }

  return Response.json(fallback);
}
