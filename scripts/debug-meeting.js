/**
 * 调试 Meeting API 的 end 失败问题
 */
import http from 'http';

const BASE = 'http://localhost:3001';

function apiGet(path) {
  return new Promise((resolve) => {
    http.get(new URL(path, BASE), (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(data) }));
    }).on('error', (e) => resolve({ status: 0, data: { error: e.message } }));
  });
}

function apiPost(path, body) {
  return new Promise((resolve) => {
    const data = JSON.stringify(body);
    const url = new URL(path, BASE);
    const req = http.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(d) }));
    });
    req.on('error', (e) => resolve({ status: 0, data: { error: e.message } }));
    req.write(data);
    req.end();
  });
}

async function ensureIdle() {
  const s = await apiGet('/api/meeting/state');
  console.log('ensureIdle: current =', s.data.state);
  if (s.data.state !== 'idle') {
    const r = await apiPost('/api/meeting/end', {});
    console.log('  end result:', r.status, r.data.success);
    await new Promise(r => setTimeout(r, 200));
    const s2 = await apiGet('/api/meeting/state');
    console.log('  after wait:', s2.data.state);
  }
}

async function waitForState(expected, timeoutMs = 1000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { data } = await apiGet('/api/meeting/state');
    process.stdout.write(`  wait: ${data.state} == ${expected}? ${data.state === expected}\n`);
    if (data.state === expected) return true;
    await new Promise(r => setTimeout(r, 30));
  }
  return false;
}

async function run() {
  console.log('\n=== ensureIdle ===');
  await ensureIdle();

  console.log('\n=== start ===');
  const start = await apiPost('/api/meeting/start', { topic: 'Test' });
  console.log('start:', start.status, 'state:', start.data.state?.state);

  console.log('\n=== wait for meeting ===');
  const ok = await waitForState('meeting', 800);
  console.log('wait result:', ok);

  console.log('\n=== state before end ===');
  const s = await apiGet('/api/meeting/state');
  console.log('state:', s.data.state);

  console.log('\n=== end ===');
  const end = await apiPost('/api/meeting/end', {});
  console.log('end:', end.status, JSON.stringify(end.data));

  console.log('\n=== final state ===');
  const f = await apiGet('/api/meeting/state');
  console.log('final:', f.data.state);

  process.exit(0);
}

run().catch(console.error);
