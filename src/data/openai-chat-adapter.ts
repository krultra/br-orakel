import OpenAI from 'openai';
import type { Response, ResponseCreateParamsNonStreaming } from 'openai/resources/responses/responses';
import type { ChatAdapter, ChatContext } from '../domain/adapters.js';
import type { ChatAnswer, Source } from '../domain/types.js';

export const DEFAULT_OPENAI_MODEL = 'gpt-5.6-luna';
export const DEFAULT_MAX_OUTPUT_TOKENS = 12_000;
export const DEFAULT_MAX_CONTEXT_CHARS = 1_000_000;
export const DEFAULT_OPENAI_TIMEOUT_MS = 60_000;

export interface OpenAIResponseClient {
  responses: {
    create(body: ResponseCreateParamsNonStreaming, options?: { signal?: AbortSignal }): Promise<Response>;
  };
}

export interface OpenAIChatAdapterOptions {
  apiKey?: string;
  model?: string;
  maxOutputTokens?: number;
  maxContextChars?: number;
  timeoutMs?: number;
  storeResponses?: boolean;
  client?: OpenAIResponseClient;
}

export class OpenAIChatConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpenAIChatConfigurationError';
  }
}

export class OpenAIChatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpenAIChatError';
  }
}

const responseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    answer: { type: 'string' },
    uncertainty: { type: 'string' },
    sourceIds: { type: 'array', items: { type: 'string' } },
    followUpQuestions: { type: 'array', items: { type: 'string' } },
  },
  required: ['answer', 'uncertainty', 'sourceIds', 'followUpQuestions'],
} as const;

const instructions = `Du er Rapporteringsløsen, en norsk KI-assistent for virksomheters rapporteringsarbeid.

Regler:
- Forklar og foreslå; ikke konkluder juridisk på egen hånd.
- Bruk bare opplysningene og kildene i EVIDENCE-delen. Ikke finn på hjemler, frister eller kilder.
- Skill alltid mellom OFFICIAL, OFFICIAL_GUIDANCE, USER_REPORTED og AI_SUGGESTION/UNDER_REVIEW.
- Behandle userInputs som brukeropplysninger, ikke som offisielle registerdata. Si fra når de påvirker svaret.
- Hvis informasjonen er utilstrekkelig, motstridende eller bare et brukerinnspill, si det tydelig i uncertainty.
- sourceIds skal bare inneholde ID-er fra sources i EVIDENCE-delen.
- Svar på norsk, konkret og handlingsrettet. Foreslå oppfølgingsspørsmål når virksomhetens faktiske forhold mangler.
- Ikke opprett eller endre offisielle oppgaver. Gi kun forklaring og forslag.`;

export class OpenAIChatAdapter implements ChatAdapter {
  private readonly client: OpenAIResponseClient;
  private readonly model: string;
  private readonly maxOutputTokens: number;
  private readonly maxContextChars: number;
  private readonly timeoutMs: number;
  private readonly storeResponses: boolean;

  constructor(options: OpenAIChatAdapterOptions = {}) {
    if (!options.client && !options.apiKey) {
      throw new OpenAIChatConfigurationError('OPENAI_API_KEY mangler når AI_PROVIDER=openai.');
    }

    this.client = options.client ?? new OpenAI({ apiKey: options.apiKey });
    this.model = options.model ?? DEFAULT_OPENAI_MODEL;
    this.maxOutputTokens = options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
    this.maxContextChars = options.maxContextChars ?? DEFAULT_MAX_CONTEXT_CHARS;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_OPENAI_TIMEOUT_MS;
    this.storeResponses = options.storeResponses ?? false;
  }

  async answer(question: string, context: ChatContext): Promise<ChatAnswer> {
    const evidence = JSON.stringify({
      organization: context.organization,
      obligations: context.obligations,
      sources: context.sources,
      reportedRequirements: context.reportedRequirements ?? [],
      userInputs: context.userInputs ?? [],
      additionalContext: context.additionalContext ?? [],
    });

    if (evidence.length > this.maxContextChars) {
      throw new OpenAIChatError(
        `Konteksten er større enn grensen på ${this.maxContextChars} tegn. Bruk retrieval for å velge relevant kontekst før modellen kalles.`,
      );
    }

    const body: ResponseCreateParamsNonStreaming = {
      model: this.model,
      instructions,
      input: `QUESTION:\n${question}\n\nEVIDENCE (JSON):\n${evidence}`,
      max_output_tokens: this.maxOutputTokens,
      store: this.storeResponses,
      text: {
        format: {
          type: 'json_schema',
          name: 'rapporteringslos_chat_answer',
          strict: true,
          schema: responseSchema,
        },
      },
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.client.responses.create(body, { signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new OpenAIChatError('Tidsavbrudd ved kall til KI-tjenesten.');
      }
      throw new OpenAIChatError('KI-tjenesten kunne ikke svare akkurat nå.');
    } finally {
      clearTimeout(timeout);
    }

    if (response.status !== 'completed' || !response.output_text) {
      throw new OpenAIChatError('KI-tjenesten returnerte ikke et komplett svar.');
    }

    return this.parseAnswer(response.output_text, context.sources);
  }

  private parseAnswer(raw: string, sources: Source[]): ChatAnswer {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new OpenAIChatError('KI-tjenesten returnerte et ugyldig strukturert svar.');
    }

    if (!isChatAnswer(parsed)) {
      throw new OpenAIChatError('KI-tjenesten returnerte et svar med uventet format.');
    }

    const allowedSourceIds = new Set(sources.map((source) => source.id));
    const sourceIds = parsed.sourceIds.filter((sourceId) => allowedSourceIds.has(sourceId));
    const uncertainty = sourceIds.length === parsed.sourceIds.length
      ? parsed.uncertainty
      : `${parsed.uncertainty} Ett eller flere kilde-ID-er kunne ikke verifiseres av applikasjonen.`;

    return { ...parsed, sourceIds, uncertainty };
  }
}

function isChatAnswer(value: unknown): value is ChatAnswer {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.answer === 'string'
    && typeof candidate.uncertainty === 'string'
    && Array.isArray(candidate.sourceIds)
    && candidate.sourceIds.every((item) => typeof item === 'string')
    && Array.isArray(candidate.followUpQuestions)
    && candidate.followUpQuestions.every((item) => typeof item === 'string');
}
