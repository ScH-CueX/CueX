/** Direct visit-exit intent only. This does not generate or assess clinical speech. */
export function isExplicitFarewell(speech: string): boolean {
  const text = speech.trim();
  if (!text || /[？?]|吗|么|能否|可否|能不能|是不是|是否|怎么|什么|为什么/.test(text)) return false;
  if (/[“”‘’"'「」『』]/.test(text)) return false;
  if (/(?:他说|她说|他们说|她们说|有人说|别人说|说过|说的是|这句话|那句话|这个词|那个词)/.test(text)) return false;
  if (/(?:不是|并非|不要|别|不说|没说|不想|不能|不会|不用|不准|没有).{0,6}(?:再见|拜拜|告辞|先走|结束)/.test(text)) return false;
  const clause = text.replace(/[。！!.\s]+$/u, '').split(/[，,。！!；;\n]+/u).at(-1)?.replace(/\s/gu, '') ?? '';
  return /^(?:那|好|好的|那就)?(?:主任|陈主任|医生|您)?(?:再见|拜拜|告辞)(?:了|啦|吧)?$/.test(clause)
    || /^(?:那)?(?:我|我们)(?:就)?先(?:走|回去|回)(?:了|啦)?$/.test(clause)
    || /^(?:那|我们|那我们)?今天(?:就|先)(?:聊|谈)?到(?:这|这里|这儿)(?:了|吧)?$/.test(clause)
    || /^(?:那|我们|那我们)?下次再(?:聊|谈|交流)(?:吧)?$/.test(clause)
    || /^(?:那)?(?:我|我们)?(?:就)?结束(?:今天的)?(?:拜访|交流|会话)(?:了|吧)?$/.test(clause);
}
