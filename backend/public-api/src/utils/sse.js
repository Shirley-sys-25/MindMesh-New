const serializeSseBlock = (payload) =>
  payload
    .split(/\r?\n/)
    .map((line) => `data: ${line}`)
    .join('\n');

export const initSse = (res, requestId) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (requestId) {
    res.setHeader('X-Request-Id', requestId);
  }
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }
};

export const writeSseData = (res, payload) => {
  if (!payload) return;
  res.write(`${serializeSseBlock(payload)}\n\n`);
};

export const writeSseEvent = (res, eventName, payload) => {
  const safeEvent = eventName || 'message';
  const safePayload = payload ?? '';
  const serialized = serializeSseBlock(String(safePayload));
  res.write(`event: ${safeEvent}\n${serialized}\n\n`);
};

export const closeSseWithDone = (res) => {
  writeSseEvent(res, 'done', '[DONE]');
  res.end();
};
