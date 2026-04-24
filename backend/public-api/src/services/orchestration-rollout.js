const hashString = (value) => {
  const input = String(value || '');
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return hash;
};

const toRolloutBucket = (seed) => hashString(seed) % 100;

export const decideOrchestrationPath = ({ mode, requestId, userSub, crewaiPercent = 100 }) => {
  if (mode === 'legacy') {
    return { target: 'legacy', reason: 'mode_legacy' };
  }

  if (mode === 'crewai') {
    return { target: 'orchestrator', reason: 'mode_crewai' };
  }

  if (crewaiPercent >= 100) {
    return { target: 'orchestrator', reason: 'rollout_100' };
  }

  if (crewaiPercent <= 0) {
    return { target: 'legacy', reason: 'rollout_0' };
  }

  const seed = userSub || requestId || `${Date.now()}-${Math.random()}`;
  const bucket = toRolloutBucket(seed);
  const target = bucket < crewaiPercent ? 'orchestrator' : 'legacy';
  return {
    target,
    reason: 'rollout_percent',
    bucket,
  };
};
