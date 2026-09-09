export type LiveAiSource = 'gemini';

type GenerateJsonArgs = {
  schemaName: string;
  schema: Record<string, unknown>;
  system: string;
  user: unknown;
};

type GenerateJsonResult =
  | {
      ok: true;
      source: LiveAiSource;
      data: unknown;
    }
  | {
      ok: false;
      attempted: boolean;
    };

function shouldUseGemini() {
  const provider = process.env.AI_PROVIDER?.trim().toLowerCase();

  return !provider || provider === 'gemini';
}

function parseJsonText(text: string) {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const objectStart = trimmed.indexOf('{');
    const objectEnd = trimmed.lastIndexOf('}');

    if (objectStart >= 0 && objectEnd > objectStart) {
      return JSON.parse(trimmed.slice(objectStart, objectEnd + 1)) as unknown;
    }

    throw new Error('AI response did not contain JSON');
  }
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function retryDelayMs(response: Response, body: string) {
  const retryAfter = response.headers.get('retry-after');
  const retryAfterSeconds = retryAfter ? Number.parseFloat(retryAfter) : NaN;

  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.min(12000, retryAfterSeconds * 1000);
  }

  const retryInMatch = body.match(/retry in ([0-9.]+)s/i);
  const retryInSeconds = retryInMatch
    ? Number.parseFloat(retryInMatch[1])
    : NaN;

  if (Number.isFinite(retryInSeconds) && retryInSeconds > 0) {
    return Math.min(12000, retryInSeconds * 1000);
  }

  return 2500;
}

function readGeminiText(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return '';
  }

  const record = payload as Record<string, unknown>;

  if (typeof record.output_text === 'string') {
    return record.output_text;
  }

  const steps = record.steps;

  if (Array.isArray(steps)) {
    return steps
      .flatMap((step) => {
        if (!step || typeof step !== 'object') {
          return [];
        }

        const stepRecord = step as Record<string, unknown>;

        if (typeof stepRecord.output_text === 'string') {
          return [stepRecord.output_text];
        }

        const content = stepRecord.content;

        if (Array.isArray(content)) {
          return content.map((part) => {
            if (!part || typeof part !== 'object') {
              return '';
            }

            const partRecord = part as Record<string, unknown>;
            return typeof partRecord.text === 'string' ? partRecord.text : '';
          });
        }

        if (
          content &&
          typeof content === 'object' &&
          typeof (content as Record<string, unknown>).text === 'string'
        ) {
          return [(content as Record<string, unknown>).text as string];
        }

        return [];
      })
      .join('\n')
      .trim();
  }

  const candidates = record.candidates;

  if (!Array.isArray(candidates)) {
    return '';
  }

  return candidates
    .flatMap((candidate) => {
      if (!candidate || typeof candidate !== 'object') {
        return [];
      }

      const content = (candidate as Record<string, unknown>).content;

      if (!content || typeof content !== 'object') {
        return [];
      }

      const parts = (content as Record<string, unknown>).parts;

      if (!Array.isArray(parts)) {
        return [];
      }

      return parts.map((part) => {
        if (!part || typeof part !== 'object') {
          return '';
        }

        const partRecord = part as Record<string, unknown>;
        return typeof partRecord.text === 'string' ? partRecord.text : '';
      });
    })
    .join('\n')
    .trim();
}

async function callGeminiJson(args: GenerateJsonArgs) {
  const apiKey = process.env.GEMINI_API_KEY ?? '';
  const requestBody = JSON.stringify({
    model: process.env.GEMINI_MODEL ?? 'gemini-3.6-flash',
    system_instruction: args.system,
    input: JSON.stringify(args.user),
    generation_config: {
      temperature: 0.25,
    },
    response_format: {
      type: 'text',
      mime_type: 'application/json',
      schema: args.schema,
    },
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/interactions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: requestBody,
      },
    );

    if (response.ok) {
      const payload = await response.json();
      return parseJsonText(readGeminiText(payload));
    }

    const errorBody = await response.text();

    if (attempt < 2 && (response.status === 429 || response.status === 503)) {
      await sleep(retryDelayMs(response, errorBody));
      continue;
    }

    throw new Error(`Gemini request failed with ${response.status}`);
  }

  throw new Error('Gemini request failed after retries');
}

export async function generateJsonWithAI(
  args: GenerateJsonArgs,
): Promise<GenerateJsonResult> {
  if (shouldUseGemini() && process.env.GEMINI_API_KEY) {
    try {
      const data = await callGeminiJson(args);

      return {
        ok: true,
        source: 'gemini',
        data,
      };
    } catch (error) {
      console.error('Gemini AI request failed', error);
    }
  }

  return {
    ok: false,
    attempted: Boolean(process.env.GEMINI_API_KEY),
  };
}
