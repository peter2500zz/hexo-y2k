// 看内容的检查：违禁词、链接数、是否包含汉字

import { countLinks, foldForMatch, hasCjk } from '../util.ts';
import type { Check } from './types.ts';

/** 违禁词：全角半角、大小写、中间插空格或符号都能认出来 */
export const forbiddenWords: Check = (input, { deps }) => {
  const words = deps.config.forbiddenWords.map(foldForMatch).filter(Boolean);
  if (!words.length) return;
  const text = foldForMatch(input.name + ' ' + input.message);
  const hit = words.find(w => text.includes(w));
  if (hit) return { kind: 'spam', reason: 'forbidden-word' };
};

/** 链接太多：广告留言的典型特征 */
export const links: Check = (input, { deps }) => {
  const n = countLinks(input.message) + countLinks(input.name);
  if (n > deps.config.maxLinks) return { kind: 'pending', reason: `links:${n}` };
};

/** 不含汉字：中文站收到的纯外文留言绝大多数是垃圾 */
export const cjk: Check = (input, { deps }) => {
  if (deps.config.requireCjk && !hasCjk(input.message)) return { kind: 'pending', reason: 'no-cjk' };
};
