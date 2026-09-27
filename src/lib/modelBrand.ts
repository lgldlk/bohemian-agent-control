export type ModelBrand = {
  raw: string;
  short: string;
  iconId: string | null;
};

const ICON_RULES: Array<[RegExp, string]> = [
  [/claude|anthropic|\bopus\b|\bsonnet\b|\bhaiku\b/, 'anthropic'],
  [/\bgpt\b|openai|\bo[1-4]\b|\bcodex\b/, 'openai'],
  [/grok|\bxai\b/, 'grok'],
  [/gemini|gemma|\bgoogle\b/, 'google'],
  [/deepseek/, 'deepseek'],
  [/qwen|tongyi|dashscope/, 'qwen'],
  [/\bglm\b|zhipu|chatglm|\bzai\b/, 'zhipu'],
  [/kimi|moonshot/, 'kimi'],
  [/minimax|\babab\b/, 'minimax'],
  [/mistral|mixtral|codestral/, 'mistral'],
  [/nemotron|\bnvidia\b/, 'nvidia'],
  [/perplexity|sonar/, 'perplexity'],
  [/huggingface|hf-/, 'huggingface'],
  [/opencode/, 'opencode'],
];

const FAMILY: Array<[RegExp, string]> = [
  [/\bopus\b/i, 'Opus'],
  [/\bsonnet\b/i, 'Sonnet'],
  [/\bhaiku\b/i, 'Haiku'],
  [/\bgpt\b/i, 'GPT'],
  [/\bgrok\b/i, 'Grok'],
  [/\bglm\b/i, 'GLM'],
  [/\bspark\b/i, 'Spark'],
  [/\bmuse\b/i, 'Muse'],
  [/\bflash\b/i, 'Flash'],
  [/\bsol\b/i, 'Sol'],
  [/\bterra\b/i, 'Terra'],
  [/\bgemini\b/i, 'Gemini'],
  [/\bqwen\b/i, 'Qwen'],
  [/\bkimi\b/i, 'Kimi'],
  [/\bdeepseek\b/i, 'DeepSeek'],
];

export function parseModel(model?: string, provider?: string): ModelBrand {
  const rawFull = (model ?? '').trim();
  if (!rawFull || rawFull === 'unknown') {
    return { raw: '', short: '未知模型', iconId: null };
  }
  const raw = rawFull.split('/').pop() || rawFull;
  const hay = `${rawFull} ${raw} ${provider ?? ''}`.toLowerCase();
  const iconId = ICON_RULES.find(([re]) => re.test(hay))?.[1] ?? null;
  return { raw, short: prettyModel(raw), iconId };
}

function prettyModel(id: string): string {
  let s = id
    .replace(/^claude-/i, '')
    .replace(/-contributor-free$/i, '')
    .replace(/-free$/i, '')
    .replace(/(\d)-(\d)(?=-|$)/g, '$1.$2')
    .replace(/-/g, ' ');
  for (const [re, label] of FAMILY) s = s.replace(re, label);
  return s.replace(/\s+/g, ' ').trim();
}
