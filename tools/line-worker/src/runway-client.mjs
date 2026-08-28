const RUNWAY_API_BASE_URL = 'https://api.dev.runwayml.com';
const RUNWAY_API_VERSION = '2024-11-06';
const PRODUCT_UGC_VERSION = '2026-06';
const PRODUCT_UGC_RATIO = '720:1280';

export class RunwayApiError extends Error {
  constructor(code, status = 0) {
    super(code);
    this.name = 'RunwayApiError';
    this.code = code;
    this.status = status;
  }
}

const integerBetween = (value, minimum, maximum) => Number.isInteger(value)
  && value >= minimum
  && value <= maximum;

export function calculateProductUgcCredits(duration, ratio = PRODUCT_UGC_RATIO) {
  if (!integerBetween(duration, 4, 15)) throw new Error('RUNWAY_DURATION_INVALID');
  if (ratio === '720:1280') return 192 + ((duration - 4) * 36);
  if (ratio === '1080:1920') return 208 + ((duration - 4) * 40);
  throw new Error('RUNWAY_RATIO_INVALID');
}

export function calculateRunwayCredits({ model, duration, ratio = PRODUCT_UGC_RATIO } = {}) {
  if (model === 'product_ugc') return calculateProductUgcCredits(duration, ratio);
  if (model === 'gen4_turbo') {
    if (!Number.isInteger(duration) || duration <= 0) throw new Error('RUNWAY_DURATION_INVALID');
    return duration * 5;
  }
  throw new Error('RUNWAY_MODEL_INVALID');
}

const requiredSecret = (env) => {
  const secret = String(env?.RUNWAYML_API_SECRET || '').trim();
  if (!secret) throw new RunwayApiError('RUNWAY_SECRET_MISSING');
  return secret;
};

const cleanOperation = (value) => String(value || 'REQUEST')
  .toUpperCase()
  .replace(/[^A-Z0-9_]/g, '_')
  .slice(0, 40);

async function runwayRequest(env, fetchImpl, operation, path, { method = 'GET', body } = {}) {
  const safeOperation = cleanOperation(operation);
  const secret = requiredSecret(env);
  const headers = {
    accept: 'application/json',
    authorization: `Bearer ${secret}`,
    'X-Runway-Version': RUNWAY_API_VERSION
  };
  const options = { method, headers, redirect: 'error' };
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  let response;
  try {
    // Generation POSTs deliberately use one fetch call. A caller must reconcile an
    // unknown network result by task/job state instead of automatically reposting.
    response = await fetchImpl(`${RUNWAY_API_BASE_URL}${path}`, options);
  } catch {
    throw new RunwayApiError(`RUNWAY_${safeOperation}_NETWORK`);
  }
  if (!response?.ok) {
    const status = Number.isInteger(response?.status) ? response.status : 0;
    throw new RunwayApiError(`RUNWAY_${safeOperation}_HTTP_${status || 'UNKNOWN'}`, status);
  }
  try {
    return await response.json();
  } catch {
    throw new RunwayApiError(`RUNWAY_${safeOperation}_INVALID_RESPONSE`, response.status);
  }
}

const imageInput = (value, field) => {
  const uri = String(value?.uri || '').trim();
  if (!uri) throw new Error(`RUNWAY_${field}_INVALID`);
  return { uri };
};

export function normalizeProductUgcRequest(input = {}) {
  if (input.version !== undefined && input.version !== PRODUCT_UGC_VERSION) {
    throw new Error('RUNWAY_PRODUCT_UGC_VERSION_INVALID');
  }
  const duration = input.duration ?? 15;
  if (!integerBetween(duration, 4, 15)) throw new Error('RUNWAY_DURATION_INVALID');
  const ratio = input.ratio ?? PRODUCT_UGC_RATIO;
  if (ratio !== PRODUCT_UGC_RATIO) throw new Error('RUNWAY_RATIO_INVALID');
  if (input.audio !== undefined && typeof input.audio !== 'boolean') {
    throw new Error('RUNWAY_AUDIO_INVALID');
  }

  const normalized = {
    characterImage: imageInput(input.characterImage, 'CHARACTER_IMAGE'),
    productImage: imageInput(input.productImage, 'PRODUCT_IMAGE'),
    version: PRODUCT_UGC_VERSION,
    duration,
    ratio
  };
  if (input.audio !== undefined) normalized.audio = input.audio;
  if (input.productInfo !== undefined) normalized.productInfo = String(input.productInfo).trim().slice(0, 2500);
  if (input.userConcept !== undefined) normalized.userConcept = String(input.userConcept).trim().slice(0, 3500);
  return normalized;
}

export function getRunwayOrganization(env, fetchImpl = fetch) {
  return runwayRequest(env, fetchImpl, 'ORGANIZATION', '/v1/organization');
}

export function getRunwayOrganizationUsage(env, query = {}, fetchImpl = fetch) {
  const body = {};
  if (query.startDate !== undefined) body.startDate = String(query.startDate);
  if (query.beforeDate !== undefined) body.beforeDate = String(query.beforeDate);
  return runwayRequest(env, fetchImpl, 'USAGE', '/v1/organization/usage', { method: 'POST', body });
}

export function createRunwayProductUgc(env, input, fetchImpl = fetch) {
  const body = normalizeProductUgcRequest(input);
  return runwayRequest(env, fetchImpl, 'PRODUCT_UGC_CREATE', '/v1/recipes/product_ugc', {
    method: 'POST',
    body
  });
}

export function getRunwayTask(env, taskId, fetchImpl = fetch) {
  const id = String(taskId || '').trim();
  if (!id || id.length > 200) throw new Error('RUNWAY_TASK_ID_INVALID');
  return runwayRequest(env, fetchImpl, 'TASK', `/v1/tasks/${encodeURIComponent(id)}`);
}

export function createRunwayClient(env, fetchImpl = fetch) {
  return {
    getOrganization: () => getRunwayOrganization(env, fetchImpl),
    getOrganizationUsage: (query) => getRunwayOrganizationUsage(env, query, fetchImpl),
    createProductUgc: (input) => createRunwayProductUgc(env, input, fetchImpl),
    getTask: (taskId) => getRunwayTask(env, taskId, fetchImpl)
  };
}

export const RUNWAY_CONSTANTS = Object.freeze({
  apiBaseUrl: RUNWAY_API_BASE_URL,
  apiVersion: RUNWAY_API_VERSION,
  productUgcVersion: PRODUCT_UGC_VERSION,
  productUgcRatio: PRODUCT_UGC_RATIO
});
