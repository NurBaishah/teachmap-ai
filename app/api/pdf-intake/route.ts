import {
  generateJsonWithAI,
  type LiveAiSource,
} from '../ai-provider';

type PdfIntakeRequest = {
  fileName?: string;
  text?: string;
};

type PdfIntakeResponse = {
  unit: string;
  concept: string;
  correction: string;
  likely_misconception: string;
  related_concepts: string[];
  summary: string;
  source: LiveAiSource | 'local_fallback';
  warning?: string;
};

const intakeSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    unit: { type: 'string' },
    concept: { type: 'string' },
    correction: { type: 'string' },
    likely_misconception: { type: 'string' },
    related_concepts: {
      type: 'array',
      items: { type: 'string' },
    },
    summary: { type: 'string' },
  },
  required: [
    'unit',
    'concept',
    'correction',
    'likely_misconception',
    'related_concepts',
    'summary',
  ],
};

const stopWords = new Set([
  'about',
  'after',
  'again',
  'also',
  'because',
  'before',
  'being',
  'between',
  'could',
  'currently',
  'during',
  'example',
  'first',
  'from',
  'happens',
  'have',
  'lecture',
  'into',
  'more',
  'notes',
  'operating',
  'other',
  'page',
  'pages',
  'part',
  'review',
  'same',
  'such',
  'system',
  'study',
  'than',
  'that',
  'their',
  'then',
  'there',
  'these',
  'this',
  'those',
  'through',
  'using',
  'when',
  'where',
  'which',
  'with',
  'would',
  'moves',
  'brings',
  'called',
  'means',
  'uses',
  'includes',
  'practice',
  'referenced',
  'update',
  'updates',
]);

const broadSingleWords = new Set([
  'data',
  'disk',
  'memory',
  'mechanism',
  'mechanisms',
  'policy',
  'policies',
  'process',
  'processes',
  'program',
  'programs',
  'reading',
  'slide',
  'slides',
  'student',
  'students',
  'virtual',
]);

function clean(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : fallback;
}

function cleanFileName(fileName: string) {
  return fileName
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleCase(value: string) {
  return value
    .split(' ')
    .map((word) =>
      word.length <= 2
        ? word.toUpperCase()
        : `${word[0].toUpperCase()}${word.slice(1).toLowerCase()}`,
    )
    .join(' ');
}

function normalizeText(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

function sentenceFrom(text: string, fallback: string) {
  const sentence = normalizeText(text)
    .split(/(?<=[.!?])\s+/)
    .find((item) => item.length >= 40 && item.length <= 220);

  return sentence ?? fallback;
}

function scorePhrase(phrase: string, text: string) {
  const normalized = phrase.toLowerCase();
  const words = normalized.split(' ');
  const meaningfulWords = words.filter((word) => !stopWords.has(word));
  const broadSingleWord =
    words.length === 1 && broadSingleWords.has(words[0]);

  if (
    words.length === 0 ||
    words.length > 3 ||
    meaningfulWords.length === 0 ||
    meaningfulWords.some((word) => word.length < 4) ||
    (words.length === 1 && stopWords.has(words[0])) ||
    broadSingleWord
  ) {
    return 0;
  }

  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = text.match(new RegExp(`\\b${escaped}\\b`, 'g'))?.length ?? 0;
  const lengthBonus = words.length === 2 ? 4 : words.length === 1 ? 2 : 0;
  const headingBonus = phrase[0] === phrase[0].toUpperCase() ? 3 : 0;

  return matches * (4 - words.length) + lengthBonus + headingBonus;
}

function extractCandidatePhrases(text: string) {
  const plain = normalizeText(text);
  const lower = plain.toLowerCase();
  const words = lower
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 4 && !stopWords.has(word));
  const candidates = new Set<string>();

  for (let index = 0; index < words.length; index += 1) {
    candidates.add(words[index]);

    if (index + 1 < words.length) {
      candidates.add(`${words[index]} ${words[index + 1]}`);
    }

    if (index + 2 < words.length) {
      candidates.add(`${words[index]} ${words[index + 1]} ${words[index + 2]}`);
    }
  }

  const headingCandidates = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.length >= 5 &&
        line.length <= 72 &&
        /[a-z]/i.test(line) &&
        !/[.?!]$/.test(line) &&
        line.split(/\s+/).length <= 8,
    )
    .slice(0, 20);

  headingCandidates.forEach((line) => candidates.add(line));

  return [...candidates]
    .map((phrase) => ({
      phrase,
      score: scorePhrase(phrase, lower),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((first, second) => second.score - first.score)
    .map((candidate) => titleCase(candidate.phrase))
    .filter((phrase, index, list) => list.indexOf(phrase) === index);
}

function chooseConcept(fileLabel: string, candidates: string[]) {
  const fileWords = fileLabel
    .toLowerCase()
    .split(/\s+/)
    .filter(
      (word) =>
        /^[a-z]/.test(word) && word.length >= 4 && !stopWords.has(word),
    );

  for (const word of fileWords) {
    const match = candidates.find(
      (candidate) => candidate.toLowerCase() === word,
    );

    if (match) {
      return match;
    }
  }

  if (fileWords[0]) {
    return titleCase(fileWords[0]);
  }

  return candidates[0] ?? fileLabel;
}

function selectRelatedConcepts(candidates: string[], concept: string) {
  const conceptLower = concept.toLowerCase();
  const useful = candidates.filter((candidate) => {
    const normalized = candidate.toLowerCase();

    return (
      normalized !== conceptLower &&
      !normalized.includes(conceptLower) &&
      !conceptLower.includes(normalized)
    );
  });
  const multiWord = useful.filter((candidate) => /\s/.test(candidate.trim()));
  const ordered = [...multiWord, ...useful].filter(
    (candidate, index, list) => list.indexOf(candidate) === index,
  );

  return ordered.slice(0, 2);
}

function buildFallbackIntake(body: PdfIntakeRequest): PdfIntakeResponse {
  const fileLabel = cleanFileName(clean(body.fileName, 'Uploaded lecture'));
  const text = clean(body.text, '');
  const candidates = extractCandidatePhrases(text);
  const concept = chooseConcept(fileLabel, candidates);
  const related = selectRelatedConcepts(candidates, concept);
  const relatedConcepts =
    related.length >= 2 ? related : [`${concept} Basics`, `${concept} Practice`];

  return {
    unit: fileLabel || 'Uploaded Lecture',
    concept,
    correction: `A strong explanation of ${concept} should connect what it is, when it applies, and why it matters in the lecture.`,
    likely_misconception: `${concept} may be treated as a memorized definition instead of a connected idea with conditions and consequences.`,
    related_concepts: relatedConcepts,
    summary: sentenceFrom(
      text,
      `TeachMap extracted readable text from ${fileLabel} and selected ${concept} as the first concept to test.`,
    ),
    source: 'local_fallback',
  };
}

function normalizeStringArray(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const items = value
    .map((item) => clean(item, ''))
    .filter((item) => item.length > 0)
    .slice(0, 4);

  return items.length >= 2 ? items : fallback;
}

function normalizeIntake(
  raw: unknown,
  fallback: PdfIntakeResponse,
  source: LiveAiSource,
): PdfIntakeResponse {
  if (!raw || typeof raw !== 'object') {
    return fallback;
  }

  const record = raw as Record<string, unknown>;

  return {
    unit: clean(record.unit, fallback.unit),
    concept: clean(record.concept, fallback.concept),
    correction: clean(record.correction, fallback.correction),
    likely_misconception: clean(
      record.likely_misconception,
      fallback.likely_misconception,
    ),
    related_concepts: normalizeStringArray(
      record.related_concepts,
      fallback.related_concepts,
    ),
    summary: clean(record.summary, fallback.summary),
    source,
  };
}

export async function POST(request: Request) {
  let body: PdfIntakeRequest;

  try {
    body = (await request.json()) as PdfIntakeRequest;
  } catch {
    body = {};
  }

  const fallback = buildFallbackIntake(body);

  const aiResult = await generateJsonWithAI({
    schemaName: 'teachmap_pdf_intake',
    schema: intakeSchema,
    system:
      'You are TeachMap AI. Read lecture text and choose one teachable concept for a misconception-diagnosis activity. Return a concise structured setup only.',
    user: {
      task: 'Create the first TeachMap setup from this uploaded PDF text.',
      file_name: body.fileName,
      lecture_text: body.text,
      constraints: [
        'Choose a specific concept, not the whole lecture.',
        'Write the correction as the idea a student should understand.',
        'Write a plausible misconception students often have.',
        'Return two to four related concepts.',
      ],
    },
  });

  if (aiResult.ok) {
    return Response.json(
      normalizeIntake(aiResult.data, fallback, aiResult.source),
    );
  }

  if (aiResult.attempted) {
    return Response.json({
      ...fallback,
      warning:
        'Live AI PDF intake was unavailable, so TeachMap used guided local intake.',
    });
  }

  return Response.json(fallback);
}
