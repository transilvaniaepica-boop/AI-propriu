import { streamChat } from './openrouter.js';
import { executeTool, schemasFor } from './tools.js';

function parseArgs(raw) {
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

/**
 * Bucla clasica de agent:
 *  1. trimite mesajele catre model (cu schemile tool-urilor)
 *  2. daca modelul cere tool_calls -> executa local, adauga rezultatele in istoric
 *  3. repeta pana cand modelul raspunde fara tool-uri sau se atinge maxSteps
 *
 * settings = { baseUrl, apiKey } — vezi openrouter.js
 *
 * Evenimente emise (onEvent):
 *  { type: 'delta', text }
 *  { type: 'toolCall', call }
 *  { type: 'toolResult', call, result }
 *  { type: 'done', message, history }
 *  { type: 'maxSteps', message, history }
 *  { type: 'error', error }
 */
export async function runAgentTurn({
  settings,
  model,
  messages,
  toolNames,
  temperature = 0.7,
  maxSteps = 8,
  signal,
  onEvent = () => {},
}) {
  const history = messages.map((m) => ({ ...m }));
  const tools = schemasFor(toolNames);

  for (let step = 0; step < maxSteps; step++) {
    let assistant;
    try {
      assistant = await streamChat({
        settings,
        model,
        messages: history,
        tools: tools.length ? tools : undefined,
        temperature,
        signal,
        onDelta: (text) => onEvent({ type: 'delta', text }),
      });
    } catch (e) {
      if (e?.name === 'AbortError') throw e;
      onEvent({ type: 'error', error: e });
      return { history };
    }

    history.push(assistant);

    if (!assistant.tool_calls?.length) {
      onEvent({ type: 'done', message: assistant, history });
      return { history };
    }

    for (const call of assistant.tool_calls) {
      onEvent({ type: 'toolCall', call });
      const args = parseArgs(call.function.arguments);
      const result = await executeTool(call.function.name, args);
      history.push({
        role: 'tool',
        tool_call_id: call.id,
        name: call.function.name,
        content: result,
      });
      onEvent({ type: 'toolResult', call, result });
    }
  }

  const last = history[history.length - 1];
  onEvent({ type: 'maxSteps', message: last, history });
  return { history };
}
