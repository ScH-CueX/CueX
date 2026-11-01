import type { IncomingMessage, ServerResponse } from 'node:http';
import { LibraryStore, InputError, experienceInput } from './LibraryStore';
import { ScenarioSynthesizer, synthesisInput, type ScenarioGenerator } from './ScenarioSynthesizer';

const json = (res: ServerResponse, status: number, data: unknown) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(data)); };
export class LibraryApi {
  private generating = 0;
  constructor(readonly store: LibraryStore, private readonly generator: ScenarioGenerator = new ScenarioSynthesizer()) {}
  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let route: string;
    try { route = new URL(req.url ?? '/', 'http://localhost').pathname; }
    catch { json(res, 400, { error: '请求地址无效。' }); return; }
    if (!['/api/experiences', '/api/scenarios'].includes(route)) { json(res, 404, { error: '接口不存在。' }); return; }
    if (req.method === 'GET') { json(res, 200, route === '/api/experiences' ? this.store.experiences() : this.store.scenarios()); return; }
    if (req.method !== 'POST') { json(res, 405, { error: '请求方法不支持。' }); return; }
    if (req.headers.origin) {
      try { if (new URL(req.headers.origin).host !== req.headers.host) { json(res, 403, { error: '请从项目页面提交。' }); return; } }
      catch { json(res, 403, { error: '请求来源无效。' }); return; }
    }
    if (!req.headers['content-type']?.startsWith('application/json')) { json(res, 415, { error: '请使用 JSON 提交。' }); return; }
    const abort = new AbortController();
    res.on('close', () => { if (!res.writableEnded) abort.abort(); });
    let counted = false;
    try {
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 32_768) throw new InputError('提交内容过长。'); chunks.push(Buffer.from(chunk)); }
      let value: unknown;
      try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new InputError('提交内容格式错误。'); }
      if (route === '/api/experiences') { json(res, 201, this.store.addExperience(experienceInput(value))); return; }
      const input = synthesisInput(value);
      const experiences = this.store.experiences().filter(e => input.experienceIds.includes(e.id));
      if (experiences.length !== input.experienceIds.length) throw new InputError('选中的经验不存在，请刷新后重试。');
      if (this.generating >= 2) { json(res, 429, { error: '正在生成其他场景，请稍后重试。' }); return; }
      this.generating++; counted = true;
      const pack = await this.generator.generate(this.store.base, input, experiences, abort.signal);
      abort.signal.throwIfAborted();
      json(res, 201, this.store.addScenario(pack));
    } catch (error) {
      if (!abort.signal.aborted && !res.writableEnded) json(res, error instanceof InputError ? 400 : 503, { error: error instanceof InputError ? error.message : '生成或保存未完成，请确认模型服务与存储可用后重试。' });
    } finally { if (counted) this.generating--; }
  }
}
