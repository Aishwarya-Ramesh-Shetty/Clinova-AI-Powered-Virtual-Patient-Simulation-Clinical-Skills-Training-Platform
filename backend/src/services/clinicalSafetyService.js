const EMERGENCY_PATTERNS = [
  {
    flag: 'severe breathing difficulty',
    pattern: /\b(?:severe|extreme)\s+(?:difficulty|trouble)\s+breathing\b|\b(?:cannot|can't|unable to|struggling to)\s+breathe\b|\b(?:severe|extreme)\s+shortness of breath\b/i,
    reason: 'Patient explicitly reported severe difficulty breathing.'
  },
  {
    flag: 'severe chest pain',
    pattern: /\bsevere\s+chest\s+(?:pain|pressure|tightness)\b/i,
    reason: 'Patient explicitly reported severe chest pain.'
  },
  {
    flag: 'loss of consciousness',
    pattern: /\b(?:loss of consciousness|lost consciousness|passed out|unconscious)\b/i,
    reason: 'Patient explicitly reported loss of consciousness.'
  },
  {
    flag: 'fainting with concerning symptoms',
    pattern: /\b(?:fainted|fainting)\b.{0,80}\b(?:chest pain|difficulty breathing|shortness of breath|confusion|one-sided weakness)\b|\b(?:chest pain|difficulty breathing|shortness of breath|confusion|one-sided weakness)\b.{0,80}\b(?:fainted|fainting)\b/i,
    reason: 'Patient explicitly reported fainting with another concerning symptom.'
  },
  {
    flag: 'sudden severe neurological symptom',
    pattern: /\bsudden(?:ly)?\s+(?:severe\s+)?(?:weakness|numbness)\s+(?:on\s+)?(?:one side|one side of (?:the )?body|face|arm|leg)\b|\bsudden(?:ly)?\s+(?:difficulty|trouble|inability)\s+(?:speaking|talking|seeing)\b/i,
    reason: 'Patient explicitly reported a sudden severe neurological symptom.'
  },
  {
    flag: 'seizure',
    pattern: /\b(?:had|having|experienced|experiencing)?\s*(?:a\s+)?seizure\b/i,
    reason: 'Patient explicitly reported a seizure.'
  },
  {
    flag: 'severe uncontrolled bleeding',
    pattern: /\b(?:severe|uncontrolled|heavy|won't stop|cannot stop|can't stop)\b.{0,40}\bbleeding\b|\bbleeding\b.{0,40}\b(?:won't stop|cannot stop|can't stop|uncontrolled)\b/i,
    reason: 'Patient explicitly reported severe or uncontrolled bleeding.'
  },
  {
    flag: 'suicidal thoughts or self-harm intent',
    pattern: /\b(?:suicidal thoughts?|thoughts? of suicide|want to kill myself|planning to (?:hurt|kill) myself|intend to (?:hurt|harm|kill) myself|self[- ]harm intent)\b/i,
    reason: 'Patient explicitly reported suicidal thoughts or intent to self-harm.'
  },
  {
    flag: 'severe allergic reaction with breathing difficulty',
    pattern: /\b(?:allergic reaction|anaphylaxis)\b.{0,100}\b(?:difficulty breathing|trouble breathing|shortness of breath|can't breathe|cannot breathe|throat swelling)\b|\b(?:difficulty breathing|trouble breathing|shortness of breath|can't breathe|cannot breathe|throat swelling)\b.{0,100}\b(?:allergic reaction|anaphylaxis)\b/i,
    reason: 'Patient explicitly reported an allergic reaction with breathing difficulty or throat swelling.'
  }
];

function isNegated(text, matchIndex) {
  let context = text.slice(Math.max(0, matchIndex - 90), matchIndex);
  context = context.split(/\b(?:but|however|although)\b/i).pop();
  return /\b(?:no|not|never|without|denies|deny|don't|do not|doesn't|does not|didn't|did not|haven't|have not|hasn't|has not)\b(?:\W+\w+){0,5}\W*$/i.test(context);
}

function evaluateClinicalSafety(patientReportedTexts) {
  const texts = (Array.isArray(patientReportedTexts) ? patientReportedTexts : [patientReportedTexts])
    .filter((text) => typeof text === 'string' && text.trim());
  const flags = [];

  for (const rule of EMERGENCY_PATTERNS) {
    for (const text of texts) {
      const match = rule.pattern.exec(text);
      if (!match || isNegated(text, match.index)) continue;
      flags.push({ flag: rule.flag, detected: true, reason: rule.reason });
      break;
    }
  }

  return {
    override: flags.length > 0,
    level: flags.length > 0 ? 'emergency' : null,
    flags
  };
}

module.exports = { evaluateClinicalSafety };