export const shrinkText = (value: string, max = 180): string => {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (!compact) return '';
  return compact.length > max ? compact.slice(0, max) + '...' : compact;
};

export const CHAT_ATTACHMENT_ACCEPT = 'image/*,application/pdf,.txt,.md,.csv,.json';

export const formatAttachmentSize = (size: number): string => {
  if (!Number.isFinite(size) || size <= 0) return '0 o';
  if (size < 1024) return `${size} o`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} Ko`;
  return `${(size / (1024 * 1024)).toFixed(1)} Mo`;
};

export const readPromCounterValue = (metricsRaw: string, metricName: string): number | null => {
  const pattern = new RegExp(`^${metricName}(?:\\{[^}]*\\})?\\s+(-?\\d+(?:\\.\\d+)?(?:e[+-]?\\d+)?)$`, 'gim');
  let total = 0;
  let found = false;
  let match: RegExpExecArray | null = pattern.exec(metricsRaw);

  while (match) {
    const parsed = Number(match[1]);
    if (Number.isFinite(parsed)) {
      total += parsed;
      found = true;
    }
    match = pattern.exec(metricsRaw);
  }

  return found ? total : null;
};

export const SESSION_STORAGE_KEY = 'mindmesh.session_id';

export const createSessionId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return 'session-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
};

export const readOrCreateSessionId = (): string => {
  if (typeof window === 'undefined') return createSessionId();

  const existing = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (existing) return existing;

  const generated = createSessionId();
  window.localStorage.setItem(SESSION_STORAGE_KEY, generated);
  return generated;
};

export const evaluatePromptSecurity = (prompt: string): number => {
  if (!prompt.trim()) return 99.8;

  const normalizedPrompt = prompt
    .toLocaleLowerCase('fr-FR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  let score = 99.8;
  const penalties = [
    { pattern: /ignore (les )?instructions?/g, value: 35 },
    { pattern: /ignore (all|any|previous) instructions?/g, value: 35 },
    { pattern: /system prompt|developer prompt/g, value: 25 },
    { pattern: /jailbreak|bypass|contourne|desactive la securite/g, value: 25 },
    { pattern: /rm -rf|powershell|cmd\.exe|curl\s+http|wget\s+http/g, value: 15 },
    { pattern: /<script|<\/script>|javascript:/g, value: 20 },
  ];

  for (const rule of penalties) {
    if (rule.pattern.test(normalizedPrompt)) {
      score -= rule.value;
    }
  }

  const suspiciousChars = (normalizedPrompt.match(/[{}<>`$]/g) || []).length;
  if (suspiciousChars > 3) {
    score -= Math.min(20, suspiciousChars * 1.5);
  }

  return Math.max(0, Math.min(100, Number(score.toFixed(1))));
};

export const formatLogTime = (timestamp: number): string =>
  new Date(timestamp).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

export const formatSnapshotTime = (timestamp: number | null): string => {
  if (!timestamp) return '--';
  return new Date(timestamp).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
};

export const formatCounter = (value: number | null): string => {
  if (value === null || !Number.isFinite(value)) return '--';
  return Math.round(value).toLocaleString('fr-FR');
};
