"use strict";

// Small, versioned creative vocabulary. Aliases are retrieval hints, not a
// semantic model. In particular, monochrome is NOT equated with black-and-white.
const RETRIEVAL_VERSION = "creative-lexical-v7";
// Vocabulary and filler changed: account-scoped lazy rebuild must use v4 terms.
const TOKENIZER_VERSION = "creative-lexical-v4";
const CONCEPTS = [
  { id: "negative-space", aliases: ["负空间", "留白", "negative space", "negative-space"] },
  { id: "full-bleed", aliases: ["满版", "full bleed", "full-bleed"] },
  { id: "ink-wash", aliases: ["水墨", "ink wash"] },
  { id: "slow-motion", aliases: ["慢动作", "慢镜头", "slow motion", "slow-motion"] },
  { id: "shallow-depth", group: "depth", aliases: ["浅景深", "shallow depth of field"] },
  { id: "deep-depth", group: "depth", aliases: ["全景深", "深景深", "deep depth of field"] },
  { id: "high-contrast", group: "contrast", aliases: ["高对比度", "高对比", "强反差", "high contrast", "high-contrast"] },
  { id: "low-contrast", group: "contrast", aliases: ["低对比度", "低对比", "弱反差", "low contrast", "low-contrast"] },
  { id: "film-trailer", group: "artifact", aliases: ["电影预告", "电影预告片", "movie trailer", "film trailer", "cinematic teaser"] },
  { id: "classroom-handout", group: "artifact", aliases: ["课堂讲义", "课程讲义", "classroom handout", "classroom handouts", "course handout", "course handouts"] },
  { id: "exhibition-poster", group: "artifact", aliases: ["展览海报", "展览主视觉", "exhibition poster", "exhibition posters"] },
  { id: "bookshop-promotion", group: "artifact", aliases: ["书店宣传", "书店推广", "bookshop promotion", "bookstore promotion", "bookshop advertising"] },
];
// Domain-wide words alone cannot justify injecting a memory. They remain in
// the original content; only their standalone lexical tokens are suppressed.
const GENERIC = new Set([
  "用户", "偏好", "喜欢", "偏爱", "这次", "上次", "继续", "使用", "采用", "制作", "生成",
  "短视频", "视频", "图片", "画面", "风格", "创作", "内容", "方案", "参考", "一个", "我们",
  "规范", "规则", "要求", "建议", "记录", "资料", "已确认", "已保存", "保存", "当前", "相关", "没有",
  "video", "image", "style", "create", "generate", "the", "a", "an", "of", "and", "for", "use",
  "reference", "references", "preference", "preferences", "guideline", "guidelines", "rule", "rules", "saved", "approved", "retrieve", "retrieval", "only",
]);
const isAsciiWord = char => !!char && /[a-z0-9_]/.test(char);
function includesAlias(text, alias) {
  if (!/[a-z]/.test(alias)) return text.includes(alias);
  let from = 0;
  for (let index = text.indexOf(alias, from); index !== -1; index = text.indexOf(alias, from)) {
    if (!isAsciiWord(text[index - 1]) && !isAsciiWord(text[index + alias.length])) return true;
    from = index + alias.length;
  }
  return false;
}

function retrievalTerms(text, includeNegation = true) {
  const normalized = text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ");
  const terms = new Set(normalized.match(/[a-z0-9]+(?:[:._-][a-z0-9]+)*/g) || []);
  // Keep separators while removing domain filler, so adjacent generic phrases
  // cannot create accidental bigrams such as 作视 in 制作视频.
  let lexical = normalized;
  for (const generic of GENERIC) if (/\p{Script=Han}/u.test(generic)) lexical = lexical.split(generic).join(" ");
  for (const run of lexical.match(/\p{Script=Han}+/gu) || []) {
    const chars = Array.from(run);
    if (chars.length === 1) terms.add(chars[0]);
    else for (let i = 0; i < chars.length - 1; i++) terms.add(chars[i] + chars[i + 1]);
  }
  for (const term of GENERIC) terms.delete(term);
  const facets = new Map();
  for (const concept of CONCEPTS) {
    if (!concept.aliases.some(alias => includesAlias(normalized, alias))) continue;
    terms.add(`concept:${concept.id}`);
    if (concept.group) {
      const values = facets.get(concept.group) || new Set();
      values.add(concept.id); facets.set(concept.group, values);
    }
  }
  const negatedTerms = new Set();
  if (includeNegation) {
    const reject = text => {
      // Known concepts have their own polarity. Do not reject the shared
      // bigram 对比/景深 when replacing high with low or shallow with deep.
      let residual = text;
      for (const concept of CONCEPTS) {
        const aliases = concept.aliases.filter(alias => includesAlias(text, alias));
        if (!aliases.length) continue;
        negatedTerms.add(`concept:${concept.id}`);
        for (const alias of aliases) residual = residual.split(alias).join(" ");
      }
      for (const term of retrievalTerms(residual, false).terms) negatedTerms.add(term);
    };
    // Isolate the object of an explicit rejection. A later "改为…" belongs
    // to the new request, even when the user omits punctuation.
    for (const match of normalized.matchAll(/(?:不要|不用|不需要|不想要|不喜欢|不再使用|不再用|不再要|不使用|不采用|别再使用|别再用|别用|停止使用|避免|禁止|取消|去掉|去除|放弃)\s*([^，,。；;！？!?：:\n]{1,80})/gu)) {
      const rejected = match[1].split(/改为|改用|改成|换成|换用|换为|转为|而是|但要/)[0].trim();
      if (rejected) reject(rejected);
    }
    // Explicit replacement has the same polarity even without a separate
    // "不要": 把旧画风改成新画风. Do not infer rejection from mere comparison.
    for (const match of normalized.matchAll(/(?:把|将)\s*([^，,。；;！？!?：:\n]{1,80}?)\s*(?:改为|改用|改成|换成|换用|换为|转为)/gu)) {
      reject(match[1]);
    }
    // Conversational rewrites often put the rejection after the old value,
    // or use "从旧值换成新值". These are explicit replacements, not comparisons.
    for (const match of normalized.matchAll(/(?:从|由)\s*([^，,。；;！？!?：:\n]{1,80}?)\s*(?:改为|改用|改成|换成|换用|换为|转为)/gu)) {
      reject(match[1]);
    }
    for (const match of normalized.matchAll(/(?:^|[，,。；;！？!?：:\n])\s*([^，,。；;！？!?：:\n]{1,40}?)\s*(?:不要了|不用了|不想要了|不再用了)(?=[，,。；;！？!?：:\n]|$)/gu)) {
      reject(match[1]);
    }
    for (const match of normalized.matchAll(/换掉\s*([^，,。；;！？!?：:\n]{1,80})/gu)) {
      const rejected = match[1].split(/改为|改用|改成|换成|换用|换为|转为|而是|但要/)[0].trim();
      if (rejected) reject(rejected);
    }
    // English prohibitions must carry the same polarity as their Chinese
    // aliases. Stop before a later positive instruction, not the whole sentence.
    for (const match of normalized.matchAll(/\b(?:no|without|avoid|exclude|do not use|don['’]t use|never use|stop using)\s+([^,.;!?，。；！？:\n]{1,160})/gu)) {
      const rejected = match[1].split(/\b(?:but|instead|rather than|(?:and\s+)?(?:keep|use|retain)|switch to)\b/)[0].trim();
      if (rejected) reject(rejected);
    }
  }
  return { terms, facets, negatedTerms };
}

function retrievalConflict(query, content) {
  // A whole record is injected, not just the matched words. Any affirmative
  // rejected value excludes the entire record, including mixed preferences.
  if ([...query.negatedTerms].some(term => content.terms.has(term) && !content.negatedTerms.has(term))) return "current_negation";
  // Explicitly named opposing values are not synonyms. Comparisons naming both
  // values remain retrievable; this does not infer free-text intent or negation.
  for (const [group, queryValues] of query.facets) {
    const positiveValues = [...queryValues].filter(value => !query.negatedTerms.has(`concept:${value}`));
    if (!positiveValues.length) continue;
    const values = content.facets.get(group);
    if (!values) continue;
    const contentPositive = [...values].filter(value => !content.negatedTerms.has(`concept:${value}`));
    if (positiveValues.length === 1 && content.negatedTerms.has(`concept:${positiveValues[0]}`)) return "opposing_facet";
    if (contentPositive.length && !positiveValues.some(value => contentPositive.includes(value))) return "opposing_facet";
  }
  return null;
}

function matchRetrieval(query, content, restrictions = query) {
  const conflict = retrievalConflict(restrictions, content);
  if (conflict) return { reason: conflict, matched: [] };
  const lexical = [...query.terms].filter(term => content.terms.has(term));
  // A query that rejects a value must not reintroduce an older affirmative
  // preference through lexical overlap or a concept alias. A memory that also
  // records the rejection remains eligible as a constraint reference.
  const matched = lexical.filter(term => !restrictions.negatedTerms.has(term) || content.negatedTerms.has(term));
  return { reason: matched.length ? null : lexical.length ? "current_negation" : "unrelated", matched };
}

function retrievalPurpose(text) {
  // A request for personal design rules should not pay for unrelated runtime
  // claims. Mixed investigation requests retain evidence, still unverified.
  const wantsPreferences = /规范|偏好|设计约束|制作约束|\b(?:preferences?|guidelines?|design rules?)\b/i.test(text);
  const wantsFacts = /状态|核验|查证|故障|生成结果|运行结果|任务结果|是否.{0,12}(?:完成|成功|失败)|\b(?:status|verify|verification|investigate|execution|(?:task|generation|business) results?)\b/i.test(text);
  return wantsPreferences && !wantsFacts ? "preferences" : "mixed";
}

function runtimeResultClaim(text) {
  return /(?:已经|已)(?:生成|执行|完成|结束|成功|失败|批准)|(?:生成|执行)(?:完成|成功|失败)|\b(?:has|have|is|was)\s+(?:completed|generated|approved|running)\b|\b(?:queued|running|completed|failed|awaiting_confirmation|awaiting_plan_approval)\b/i.test(text);
}

module.exports = { RETRIEVAL_VERSION, TOKENIZER_VERSION, retrievalTerms, retrievalConflict, matchRetrieval, retrievalPurpose, runtimeResultClaim };
