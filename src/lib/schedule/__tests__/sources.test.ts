import { beforeAll, describe, expect, jest, test } from '@jest/globals';
import { TextDecoder } from 'node:util';
import type { SupabaseClient } from '@supabase/supabase-js';
import { prepareScheduleSource, discardScheduleSource } from '../import/source';
import { cleanupScheduleSources, processScheduleSource } from '../import/process-source';
import { utf8Bytes } from '../import/utf8';
import { CSV_HEADER } from '../import/csv';

beforeAll(() => { Object.defineProperty(globalThis, 'TextDecoder', { value: TextDecoder, configurable: true }); });
const user = '00000000-0000-0000-0000-000000000001', id = '00000000-0000-0000-0000-000000000002';
const source = { id, object_path: `${user}/${id}.csv`, label: 'fall.csv', format: 'csv' as const };
const csv = `${CSV_HEADER}\nCS,class,,MO,09:00,10:00,2026-10-26,2026-12-01,UTC`;
const result = { candidates: [], errors: [], warnings: [] };

describe('private source lifecycle', () => {
  test('uploads original bytes, invokes the authenticated parser, and does not commit', async () => {
    const upload = jest.fn(async () => ({ error: null }));
    const invoke = jest.fn(async () => ({ data: result, error: null }));
    const rpc = jest.fn(async () => ({ data: source, error: null }));
    const client = { rpc, storage: { from: () => ({ upload }) }, functions: { invoke } } as unknown as SupabaseClient;
    const encoded = utf8Bytes(csv), backing = new Uint8Array(encoded.length + 8);
    backing.set(encoded,4);
    const bytes = backing.subarray(4,4+encoded.length);
    expect(await prepareScheduleSource(client,{ name:'fall.csv',bytes },'UTC','2026-12-01')).toEqual({ source,result });
    expect(upload).toHaveBeenCalledWith(source.object_path,encoded.buffer,{contentType:'text/csv',upsert:false});
    expect(invoke).toHaveBeenCalledWith('schedule-source',{body:{sourceId:id,timezone:'UTC',termEnd:'2026-12-01'}});
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  test('parser failure queues cleanup before removing the source', async () => {
    const calls: string[] = [];
    const rpc = jest.fn(async (name: string) => { calls.push(name); return { data: source, error: null }; });
    const remove = jest.fn(async () => { calls.push('remove'); return { error: null }; });
    const client = { rpc, storage: { from: () => ({ upload: async () => ({ error:null }), remove }) }, functions: { invoke: async () => ({ error: { context: { json: async () => ({error:'Unsupported CSV columns: unexpected.'}) } } }) } } as unknown as SupabaseClient;
    await expect(prepareScheduleSource(client,{name:'fall.csv',text:csv},'UTC','2026-12-01')).rejects.toThrow('Unsupported CSV columns');
    expect(calls).toEqual(['create_schedule_source','discard_schedule_source','remove','finish_schedule_source_cleanup']);
  });
  test('rejects oversized files before creating a private upload', async () => {
    const rpc = jest.fn();
    await expect(prepareScheduleSource({rpc} as unknown as SupabaseClient,{name:'fall.csv',bytes:new Uint8Array(2097153)},'UTC','2026-12-01')).rejects.toThrow('2 MiB');
    expect(rpc).not.toHaveBeenCalled();
  });
  test('a discard cannot delete bytes if recording cleanup fails', async () => {
    const remove = jest.fn();
    const client = {rpc:async()=>({error:new Error('Offline')}),storage:{from:()=>({remove})}} as unknown as SupabaseClient;
    await expect(discardScheduleSource(client,source)).rejects.toThrow('Offline');
    expect(remove).not.toHaveBeenCalled();
  });
});

function processor(options: { type?: string; bytes?: Uint8Array<ArrayBuffer>; expired?: boolean; missing?: boolean } = {}) {
  const bytes = options.bytes ?? utf8Bytes(csv);
  const rpc = jest.fn(async () => ({error:null}));
  const eq = jest.fn();
  const query = { eq, single: async () => ({data:options.missing ? null : {...source,user_id:user,created_at:new Date(Date.now()-(options.expired ? 90000000 : 0)).toISOString(),cleanup_requested:false},error:null}) };
  eq.mockReturnValue(query);
  const download = jest.fn(async()=>({data:{size:bytes.byteLength,type:options.type ?? 'text/csv',arrayBuffer:async()=>bytes.buffer},error:null}));
  const client = { rpc, from:()=>({select:()=>query}), storage:{from:()=>({download})} } as unknown as SupabaseClient;
  return {client,rpc,download,eq};
}
const input = {sourceId:id,timezone:'UTC',termEnd:'2026-12-01'};

describe('backend processing and cleanup', () => {
  test('validates owner, MIME, UTF-8 and parser output before marking parsed', async () => {
    const mock = processor();
    const parsed = await processScheduleSource(mock.client,user,input);
    expect(parsed.candidates[0].draft.title).toBe('CS');
    expect(mock.eq).toHaveBeenCalledWith('user_id',user);
    expect(mock.rpc).toHaveBeenCalledWith('mark_schedule_source_parsed',{p_source:id});
  });
  test('rejects invalid MIME, invalid UTF-8, expired and inaccessible uploads', async () => {
    for (const [options,message] of [[{type:'application/pdf'},'type'],[{bytes:new Uint8Array([0xff])},'UTF-8'],[{expired:true},'expired'],[{missing:true},'unavailable']] as const) {
      const mock = processor(options);
      await expect(processScheduleSource(mock.client,user,input)).rejects.toThrow(message);
      expect(mock.rpc).not.toHaveBeenCalled();
    }
  });
  test('cleanup failures preserve the ledger and successful removals finish cleanup', async () => {
    const rpc = jest.fn(async()=>({error:null}));
    const remove = jest.fn(async (paths: string[])=>({error:paths[0]==='failed.csv' ? new Error('Storage unavailable') : null}));
    const query = {or:()=>query,order:()=>query,limit:async()=>({data:[{id:'fail',object_path:'failed.csv'},{id:'ok',object_path:'ok.csv'}],error:null})};
    const client = {rpc,from:()=>({select:()=>query}),storage:{from:()=>({remove})}} as unknown as SupabaseClient;
    await expect(cleanupScheduleSources(client)).resolves.toEqual({removed:1,failed:1,more:false});
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('finish_schedule_source_cleanup',{p_source:'ok'});
  });
});
