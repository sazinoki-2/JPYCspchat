// テスト C(送る)・D(配信者のURL作成)
// 送金は偽ウォレットの中で止める(実際には送らない)。残高・受け取り確認・新着の記録は通信の差しかえで決める。
// コメントの保存(Firebase への書き込み)は受け止めて中身だけ確かめる(本番のデータベースには書かない)。
import { launch, close, open, check, summary, sleep, url, hostUrl, txt, deepList, deepClick, connectMetaMask, pad32, BASE, JPYC, FAKE_STREAMER, FAKE_VIEWER, FAKE_HASH, TRANSFER_TOPIC } from './harness.mjs';

const HEAD = parseInt((await (await fetch('https://polygon-bor-rpc.publicnode.com', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }) })).json()).result, 16);
const hex = (n) => `0x${BigInt(n).toString(16)}`;
const receipt = (status) => ({
  blockHash: `0x${'22'.repeat(32)}`, blockNumber: hex(HEAD - 5), contractAddress: null, cumulativeGasUsed: '0x5208', effectiveGasPrice: '0x3b9aca00',
  from: FAKE_VIEWER.toLowerCase(), gasUsed: '0x5208', logs: [], logsBloom: `0x${'00'.repeat(256)}`, status, to: JPYC.toLowerCase(),
  transactionHash: FAKE_HASH, transactionIndex: '0x0', type: '0x2',
});
const mkLog = (amount, block) => ({
  address: JPYC.toLowerCase(), topics: [TRANSFER_TOPIC, pad32(FAKE_VIEWER), pad32(FAKE_STREAMER)], data: pad32((BigInt(amount) * 10n ** 18n).toString(16)),
  blockNumber: hex(block), transactionHash: FAKE_HASH, transactionIndex: '0x0', blockHash: `0x${'33'.repeat(32)}`, logIndex: '0x0', removed: false,
});
// 通信の差しかえ(残高・受け取り確認・新着の記録)
function chainFake({ jpyc = 100000n, pol = 10n ** 19n, status = '0x1', inject = 0 } = {}) {
  const st = { sent: false, injected: false, receiptAsked: false };
  const rpc = {
    respond: async (b) => {
      const p = b.params || [];
      if (b.method === 'eth_getBalance' && String(p[0]).toLowerCase() === FAKE_VIEWER.toLowerCase()) return hex(pol);
      if (b.method === 'eth_call' && String(p[0]?.to).toLowerCase() === JPYC.toLowerCase() && String(p[0]?.data).toLowerCase() === `0x70a08231${pad32(FAKE_VIEWER).slice(2)}`) return pad32((jpyc * 10n ** 18n).toString(16));
      if (b.method === 'eth_getTransactionReceipt' && String(p[0]).toLowerCase() === FAKE_HASH) { st.receiptAsked = true; return receipt(status); }
      if (b.method === 'eth_getLogs' && String(p[0]?.topics?.[2]).toLowerCase() === pad32(FAKE_STREAMER)) {
        if (st.sent && inject && !st.injected) { st.injected = true; return [mkLog(inject, parseInt(p[0].fromBlock, 16))]; }
        return [];
      }
      return undefined;
    },
  };
  return { st, rpc };
}
const sheetState = (page) => page.evaluate(() => ({
  steps: [...document.querySelectorAll('#steps li')].map((li) => `${li.dataset.step}:${li.className || '-'}`).join(' '),
  msg: document.getElementById('payMsg').textContent,
  sent: window.__w?.sent || [],
  switchAsked: window.__w?.switchAsked || 0,
}));
const decode = (tx) => { const d = tx.data || tx.input; return { to: tx.to?.toLowerCase(), fn: d.slice(0, 10), recv: `0x${d.slice(34, 74)}`, amount: (BigInt(`0x${d.slice(74)}`) / 10n ** 18n).toString() }; };
async function pickAmount(page, v) { await page.evaluate((x) => document.querySelector(`#amounts button[data-v="${x}"]`).click(), v); await sleep(200); }
async function openAndSend(page, { amount = 500, name = '', msg = '' } = {}) {
  if (name) { await page.click('#meName', { clickCount: 3 }); await page.type('#meName', name); }
  await page.click('#jpycBtn');
  await sleep(500);
  await pickAmount(page, amount);
  if (msg) { await page.click('#pvMsg'); await page.type('#pvMsg', msg); }
  await page.click('#goBtn');
}

await launch();

// C1 JPYC が足りない
{
  const { rpc } = chainFake({ jpyc: 0n });
  const { page, ctx } = await open(hostUrl(FAKE_STREAMER, 'テスト配信'), { wallet: { account: FAKE_VIEWER, chain: '0x1' }, rpc });
  await sleep(6000);
  await connectMetaMask(page);
  await openAndSend(page, { amount: 500 });
  await sleep(4000);
  const s = await sheetState(page);
  check('C1', 'JPYC 0 → 承認を出す前に「JPYCが足りません」で止まる', /JPYCが足りません（いまの残高 0 JPYC）/.test(s.msg) && s.sent.length === 0 && s.switchAsked === 0, JSON.stringify(s));
  await ctx.close();
}

// C2 ガス代(POL)がない
{
  const { rpc } = chainFake({ jpyc: 1000n, pol: 0n });
  const o = await open(hostUrl(FAKE_STREAMER, 'テスト配信'), { wallet: { account: FAKE_VIEWER }, rpc });
  await sleep(6000);
  await connectMetaMask(o.page);
  await openAndSend(o.page, { amount: 500 });
  await sleep(4000);
  const s = await sheetState(o.page);
  check('C2', 'POL 0 → 「ガス代（POL）がありません」で止まる', /ガス代（POL）がありません/.test(s.msg) && s.sent.length === 0, JSON.stringify(s));
  await o.ctx.close();
}

// C3 金額ごとに、送金の中身が正しい(Ethereum にいても切りかえてから送る)
for (const amount of [100, 500, 5000, 10000]) {
  const { rpc } = chainFake({});
  const { page, ctx } = await open(hostUrl(FAKE_STREAMER, 'テスト配信'), { wallet: { account: FAKE_VIEWER, chain: '0x1' }, rpc });
  await sleep(6000);
  await connectMetaMask(page);
  await openAndSend(page, { amount });
  let s;
  for (let i = 0; i < 20; i++) { await sleep(500); s = await sheetState(page); if (s.sent.length) break; }
  const d = s.sent[0] ? decode(s.sent[0]) : null;
  check(`C3-${amount}`, `${amount} JPYC: 切りかえ1回 → JPYCへ transfer(配信者, ${amount})`, d && s.switchAsked === 1 && d.to === JPYC.toLowerCase() && d.fn === '0xa9059cbb' && d.recv === FAKE_STREAMER.toLowerCase() && d.amount === String(amount), JSON.stringify({ switchAsked: s.switchAsked, d }));
  await ctx.close();
}

// C4 切りかえをことわった / C5 送金をことわった
for (const [id, opt, label] of [['C4', { rejectSwitch: true, chain: '0x1' }, 'Polygon への切りかえ'], ['C5', { rejectTx: true }, '送金']]) {
  const { rpc } = chainFake({});
  const { page, ctx } = await open(hostUrl(FAKE_STREAMER, 'テスト配信'), { wallet: { account: FAKE_VIEWER, ...opt }, rpc });
  await sleep(6000);
  await connectMetaMask(page);
  await openAndSend(page, { amount: 500 });
  await sleep(5000);
  const s = await sheetState(page);
  const back = await page.evaluate(() => !document.getElementById('backBtn').hidden);
  check(id, `${label}をことわる → 「キャンセルしました。」・送金なし・もどれる`, s.msg === 'キャンセルしました。' && s.sent.length === 0 && back, JSON.stringify({ ...s, back }));
  await ctx.close();
}

// C6〜C8 送って成功 → コメントの保存の中身 → 「届きました」→ 新着としてチャット欄に流れる
{
  const { st, rpc } = chainFake({ inject: 500 });
  const { page, log, ctx } = await open(hostUrl(FAKE_STREAMER, 'テスト配信'), {
    wallet: { account: FAKE_VIEWER },
    rpc,
    firestore: { docs: { [FAKE_HASH]: { n: 'テスト太郎', m: 'はじめまして！' } } },
  });
  await sleep(6000);
  await connectMetaMask(page);
  await openAndSend(page, { amount: 500, name: 'テスト太郎', msg: 'はじめまして！' });
  let s;
  for (let i = 0; i < 20; i++) { await sleep(500); s = await sheetState(page); if (s.sent.length) { st.sent = true; break; } }
  let done = '';
  for (let i = 0; i < 30 && !done; i++) { await sleep(500); const m = await txt(page, '#payMsg'); if (/届きました/.test(m)) done = m; }
  const c = log.commits[0]?.body?.writes || [];
  const w = c[0]?.update || {};
  check('C6-1', 'コメントの保存は1件だけ・名前は送金番号', c.length === 1 && (w.name || '').endsWith(`/documents/tips/${FAKE_HASH}`), `${c.length}件 ${w.name}`);
  check('C6-2', '保存する中身は なまえ(n)・コメント(m) の2つだけ', JSON.stringify(Object.keys(w.fields || {}).sort()) === '["m","n"]' && w.fields.n.stringValue === 'テスト太郎' && w.fields.m.stringValue === 'はじめまして！', JSON.stringify(w.fields));
  check('C7', '承認のあと「届きました！チャットに流れます」', /届きました！チャットに流れます/.test(done), done || (await txt(page, '#payMsg')));
  let card = null;
  for (let i = 0; i < 30 && !card; i++) {
    await sleep(1000);
    card = await page.evaluate(() => {
      const el = [...document.querySelectorAll('#feed .tip')].find((t) => t.innerText.includes('テスト太郎'));
      return el ? { text: el.innerText.replace(/\s+/g, ' ').trim(), isNew: el.classList.contains('new'), t2: el.classList.contains('t2'), flag: el.querySelector('.flag span')?.textContent || '' } : null;
    });
  }
  check('C8', '新着として流れる(黄色・旗「JPYC きた!!」・名前とコメント)', card && card.isNew && card.t2 && /JPYC きた!!/.test(card.flag) && /テスト太郎/.test(card.text) && /はじめまして！/.test(card.text) && /500/.test(card.text), JSON.stringify(card));
  const sheetClosed = await page.evaluate(() => document.getElementById('sheet').hidden);
  check('C8-2', '送ったあと、送る画面は自動で閉じ、入力欄は空になる', sheetClosed && (await page.$eval('#msgIn', (e) => e.value)) === '', `closed=${sheetClosed}`);
  await ctx.close();
}

// C9 チェーンで失敗(reverted)
{
  const { st, rpc } = chainFake({ status: '0x0' });
  const { page, ctx } = await open(hostUrl(FAKE_STREAMER, 'テスト配信'), { wallet: { account: FAKE_VIEWER }, rpc });
  await sleep(6000);
  await connectMetaMask(page);
  await openAndSend(page, { amount: 500 });
  let m = '';
  for (let i = 0; i < 30 && !/失敗/.test(m); i++) { await sleep(500); m = await txt(page, '#payMsg'); }
  check('C9', 'チェーンで失敗 → 「チェーンで失敗しました。JPYCは動いていません…」', /チェーンで失敗しました。JPYCは動いていません/.test(m), m);
  await ctx.close();
}

// C10 コメントの字数(金額で上限が変わる)と、送る画面の送り先表示
{
  const { page, ctx } = await open(hostUrl(FAKE_STREAMER, 'テスト配信'), { mobile: true });
  await sleep(6000);
  await page.click('#jpycBtn');
  await sleep(500);
  const res = {};
  for (const [v, max] of [[100, 50], [500, 100], [5000, 200]]) {
    await pickAmount(page, v);
    await page.$eval('#pvMsg', (e) => { e.value = ''; });
    await page.type('#pvMsg', 'あ'.repeat(max + 15), { delay: 0 });
    await sleep(200);
    res[v] = await page.evaluate(() => ({ len: [...document.getElementById('pvMsg').value].length, count: document.getElementById('count').textContent }));
  }
  check('C10-1', 'コメントの上限 100→50字・500→100字・5000→200字', res[100].len === 50 && res[500].len === 100 && res[5000].len === 200, JSON.stringify(res));
  const to = await page.evaluate(() => ({ name: document.getElementById('toName').textContent, addr: document.getElementById('toAddr').textContent, full: document.getElementById('directAddr').textContent, qr: Boolean(document.querySelector('#directQr svg')) }));
  check('C10-2', '送る画面に送り先(名前・アドレス)、直接送る用のアドレスとQR', to.name === 'テスト配信' && to.addr === '0x5cCf…1414' && to.full.toLowerCase() === FAKE_STREAMER && to.qr, JSON.stringify(to));
  await ctx.close();
}

// D1 共通URLから、ウォレットをつないで自分のチャット欄をつくる
{
  const { page, ctx } = await open(url(), { wallet: { account: FAKE_VIEWER } });
  await sleep(6000);
  await page.click('#createBtn');
  await sleep(600);
  await page.evaluate(() => document.querySelector('#creatorWin [data-connect]').click());
  for (let i = 0; i < 30 && !(await deepList(page, 'W3M-LIST-WALLET')).length; i++) await sleep(300);
  await deepClick(page, 'wallet-selector-io.metamask');
  for (let i = 0; i < 20; i++) { await sleep(400); if (/0x7E57/i.test((await txt(page, '#creatorWin [data-state]')) || '')) break; }
  await page.type('#creatorWin [data-name]', 'テストさん');
  await page.evaluate(() => document.querySelector('#creatorWin [data-go]').click());
  await sleep(1200);
  const s = await page.evaluate(() => ({ title: document.getElementById('creatorTitle')?.textContent, url: document.querySelector('#creatorWin .mk-url code')?.textContent, loc: location.href, host: document.getElementById('hostName').textContent }));
  const want = `#to=0x7E57000000000000000000000000000000007E57&name=${encodeURIComponent('テストさん')}`;
  check('D1', 'ウォレットでつないで作成 → できました・URLが自分専用に・ヘッダーに名前', s.title === 'できました！あなたのチャット欄' && s.url.endsWith(want) && s.loc.endsWith(want) && s.host === 'テストさん', JSON.stringify(s));
  await page.evaluate(() => document.querySelector('#creatorWin [data-ok]').click());
  await sleep(400);
  await page.click('#jpycBtn');
  await sleep(500);
  const sh = await page.evaluate(() => ({ sheet: !document.getElementById('sheet').hidden, to: document.getElementById('toAddr').title }));
  check('D1-2', '作ったあと「JPYC」→ 自分あての送る画面', sh.sheet && sh.to === '0x7E57000000000000000000000000000000007E57', JSON.stringify(sh));
  await ctx.close();
}

// D2 ウォレットなしで、アドレスを手で入れて作る
{
  const { page, ctx } = await open(url(), { mobile: true });
  await sleep(6000);
  await page.click('#createBtn');
  await sleep(600);
  await page.evaluate(() => { document.querySelector('#creatorWin [data-manual]').open = true; });
  await page.type('#creatorWin [data-addr]', FAKE_STREAMER);
  await page.type('#creatorWin [data-name]', '手入力さん');
  await page.evaluate(() => document.querySelector('#creatorWin [data-go]').click());
  await sleep(1200);
  const s = await page.evaluate(() => ({ title: document.getElementById('creatorTitle')?.textContent, url: document.querySelector('#creatorWin .mk-url code')?.textContent }));
  check('D2', 'アドレスの手入力でも作れる', s.title === 'できました！あなたのチャット欄' && /#to=0x5cCff2FfCC00141414FfffFf5ccfF2FFCc001414&name=/.test(s.url || ''), JSON.stringify(s));
  await ctx.close();
}

// D3 案内に、ほかのサイトのURLを貼っても、このサービスのページだけを開く
{
  const { page, ctx } = await open(url(), { mobile: true });
  await sleep(6000);
  await page.click('#jpycBtn');
  await sleep(500);
  await page.type('#guideUrl', `https://evil.example.com/phish/#to=${FAKE_STREAMER}&name=${encodeURIComponent('はりつけ')}`);
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null), page.evaluate(() => document.querySelector('#creatorWin [data-go]').click())]);
  await sleep(5000);
  const s = await page.evaluate(() => ({ loc: location.href, host: document.getElementById('hostName').textContent }));
  check('D3', 'ほかのサイトのURLを貼っても、開くのはこのサービスのページ', s.loc.startsWith('https://sazinoki-2.github.io/JPYCspchat/') && !s.loc.includes('evil') && s.host === 'はりつけ', JSON.stringify(s));
  await ctx.close();
}

// D4 送り先アドレスがおかしいURL → お知らせと案内
{
  const { page, ctx } = await open(url('#to=0x123&name=x'), { mobile: true });
  let t = '';
  for (let i = 0; i < 15 && !t; i++) { await sleep(600); t = await page.evaluate(() => (document.getElementById('toast').hidden ? '' : document.getElementById('toast').textContent)); }
  await page.click('#jpycBtn');
  await sleep(500);
  const err = await txt(page, '#creatorWin [data-err]');
  check('D4', 'おかしなURL → 「送り先アドレスがまちがっています」(お知らせ・案内)', /送り先アドレスがまちがっています/.test(t) && /送り先アドレスがまちがっています/.test(err || ''), JSON.stringify({ t, err }));
  await ctx.close();
}

await close();
summary();
