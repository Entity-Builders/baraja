import {
  toGenerationStreamEvent,
  type GenerationStreamEvent,
} from './generationResponseParsers';

interface ReadGenerationEventStreamOptions {
  onEvent: (event: GenerationStreamEvent) => void;
  onInvalidEvent: () => void;
}

export async function readGenerationEventStream(
  response: Response,
  { onEvent, onInvalidEvent }: ReadGenerationEventStreamOptions,
) {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No se pudo leer el stream de generación.');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() ?? '';

    for (const block of blocks) {
      emitSseBlock(block, onEvent, onInvalidEvent);
    }
  }

  buffer += decoder.decode();

  if (buffer.trim()) {
    emitSseBlock(buffer, onEvent, onInvalidEvent);
  }
}

function emitSseBlock(
  block: string,
  onEvent: (event: GenerationStreamEvent) => void,
  onInvalidEvent: () => void,
) {
  const dataLine = block
    .split('\n')
    .find(line => line.startsWith('data: '));

  if (!dataLine) {
    return;
  }

  const dataStr = dataLine.slice(6).trim();
  if (!dataStr) {
    return;
  }

  try {
    const parsed: unknown = JSON.parse(dataStr);
    const event = toGenerationStreamEvent(parsed);

    if (event) {
      onEvent(event);
    }
  } catch (err: unknown) {
    console.error('[AdminGenerateEdition] Failed to parse SSE block:', err);
    onInvalidEvent();
  }
}
