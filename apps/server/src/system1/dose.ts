/** A substantive answer to the demo's elderly starting-dose concern. */
export function answersElderlyDose(speech: string): boolean {
  const text = speech.toLowerCase().replace(/七十五/g, '75').replace(/两周/g, '2周').replace(/二点五/g, '2.5').replace(/\s/g, '');
  return text.split(/[。！？!?；;\n]/).some(clause => {
    if (!/75岁|高龄|老年|起始剂量/.test(clause)) return false;
    if (/(?:稍后|接下来|待会|下次|以后).{0,12}(?:回答|说明|提供|介绍|讲|说)/.test(clause)) return false;
    return /(?:2\.5|二点五)(?:mg|毫克)|减半(?:起始|开始)?|(?:起始剂量|剂量|起始).{0,10}(?:调低|降低|减量)|(?:需要|要|应|按说明书).{0,10}调整|无需调整|低剂量起始/.test(clause)
      || /(?:没有|暂无|未提供).{0,8}(?:具体)?(?:数据|证据)/.test(clause);
  });
}
