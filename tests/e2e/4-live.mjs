// テスト(追加): 配信者の画面にリアルタイムで流れる・二重に出ない・大きな演出・音の設定・Enter・コピー・読み込みの軽さ
import { launch, close, open, check, summary, sleep, hostUrl, txt, pad32, JPYC, FAKE_STREAMER, TRANSFER_TOPIC } from './harness.mjs';

const hex = (n) => `0x${BigInt(n).toString(16)}`;
const H3 = `0x${'c3'.repeat(32)}`;
const H4 = `0x${'c4'.repeat(32)}`;
const VIEWER2 = '0x2222222222222222222222222222222222222222';
const mkLog = (hash, amount, block, idx = 0) => ({
  address: JPYC.toLowerCase(), topics: [TRANSFER_TOPIC, pad32(VIEWER2), pad32(FAKE_STREAMER)], data: pad32((BigInt(amount) * 10n ** 18n).toString(16)),
  blockNumber: hex(block), transactionHash: hash, transactionIndex: '0x0', blockHash: `0x${'44'.repeat(32)}`, logIndex: hex(idx), removed: false,
});

await launch();

// E6 配信者の画面(OBS)に、ほかの人の投げ銭が新着で流れる。同じ記録が2回来ても1件だけ。5,000以上は大きな演出
{
  let polls = 0;
  let sentOnce = false;
  const rpc = {
    respond: async (b) => {
      const p = b.params || [];
      if (b.method === 'eth_getLogs' && String(p[0]?.topics?.[2]).toLowerCase() === pad32(FAKE_STREAMER)) {
        polls++;
        // ひらいたときの過去分(1回目〜)は空。しばらくしてから新着を2件。そのあと同じ記録をもう一度(二重チェック)
        if (polls === 14) { sentOnce = true; const blk = parseInt(p[0].fromBlock, 16); return [mkLog(H3, 1000, blk, 0), mkLog(H4, 10000, blk, 1)]; }
        if (polls === 16) { const blk = parseInt(p[0].fromBlock, 16); return [mkLog(H3, 1000, blk, 0)]; }
        return [];
      }
      return undefined;
    },
  };
  const { page, log, ctx } = await open(hostUrl(FAKE_STREAMER, 'OBSテスト'), {
    obs: true, width: 460, height: 800, rpc,
    firestore: { docs: { [H3]: { n: 'みてるひと', m: 'いつもありがとう' }, [H4]: { n: '太っ腹', m: 'がんばって！' } } },
  });
  let s = null;
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    s = await page.evaluate(() => ({
      cards: [...document.querySelectorAll('#feed .tip')].map((t) => ({ text: t.innerText.replace(/\s+/g, ' ').trim(), cls: t.className })),
      hype: (() => { const h = document.getElementById('hype'); return h ? { shown: getComputedStyle(h).display !== 'none' && !h.hidden, name: document.getElementById('hypeName')?.textContent, amt: document.getElementById('hypeAmt')?.textContent } : null; })(),
      chips: document.querySelectorAll('#ticker .chip').length,
    }));
    if (s.cards.length >= 2 && s.hype?.name) break;
  }
  await sleep(9000); // 同じ記録がもう一度来るのを待つ
  const after = await page.evaluate(() => [...document.querySelectorAll('#feed .tip')].length);
  check('E6-1', '配信者の画面に、ほかの人の投げ銭が新着で流れる(名前・コメントつき)', s.cards.some((c) => /みてるひと/.test(c.text) && /いつもありがとう/.test(c.text) && /new/.test(c.cls)) && s.cards.some((c) => /太っ腹/.test(c.text) && /t3/.test(c.cls)), JSON.stringify(s.cards));
  check('E6-2', '10,000 JPYC は大きな帯(名前・金額)が出る', s.hype && s.hype.name === '太っ腹' && /10,000/.test(s.hype.amt || ''), JSON.stringify(s.hype));
  check('E6-3', '上のバーに札が出る', s.chips >= 2, `${s.chips}枚`);
  check('E6-4', '同じ記録が2回来ても、カードは1件ずつ(二重に出ない)', after === 2, `${after}件 / 読み取り${polls}回`);
  check('E6-5', 'エラーなし', log.errors.length === 0, log.errors.join(' / '));
  await ctx.close();
}

// A9 音のオン・オフが、次に開いたときも残る
{
  const { page, ctx } = await open(hostUrl(FAKE_STREAMER, '音テスト'), { mobile: true });
  await sleep(6000);
  const before = await page.$eval('#sndBtn', (e) => e.getAttribute('aria-pressed'));
  await page.click('#sndBtn');
  await sleep(300);
  const mid = await page.$eval('#sndBtn', (e) => e.getAttribute('aria-pressed'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(5000);
  const after = await page.$eval('#sndBtn', (e) => e.getAttribute('aria-pressed'));
  check('A9', '音のボタン: オン→オフにすると、再読み込みしてもオフのまま', before === 'true' && mid === 'false' && after === 'false', `${before}→${mid}→再読み込み${after}`);
  await ctx.close();
}

// A10 入力欄でEnter → 送る画面が、書いたコメントつきで開く
{
  const { page, ctx } = await open(hostUrl(FAKE_STREAMER, 'Enterテスト'), { mobile: true });
  await sleep(6000);
  await page.type('#msgIn', 'こんにちは');
  await page.keyboard.press('Enter');
  await sleep(500);
  const s = await page.evaluate(() => ({ sheet: !document.getElementById('sheet').hidden, pv: document.getElementById('pvMsg').value }));
  check('A10', 'コメント欄でEnter → 送る画面にコメントが入って開く', s.sheet && s.pv === 'こんにちは', JSON.stringify(s));
  await ctx.close();
}

// C11 「アドレスをコピー」で、受け取りアドレスがそのままコピーされる
{
  const { page, ctx } = await open(hostUrl(FAKE_STREAMER, 'コピー'), {});
  await ctx.overridePermissions('https://sazinoki-2.github.io', ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
  await sleep(6000);
  await page.click('#jpycBtn');
  await sleep(400);
  await page.evaluate(() => { document.querySelector('details.direct').open = true; });
  await page.click('#copyBtn');
  await sleep(300);
  const label = await txt(page, '#copyBtn');
  const clip = await page.evaluate(() => navigator.clipboard.readText().catch((e) => `ERR ${e.message}`));
  check('C11', '「アドレスをコピー」→ 受け取りアドレスが正しくコピーされる', label === 'コピーしました' && clip.toLowerCase() === FAKE_STREAMER, `${label} / ${clip}`);
  await ctx.close();
}

// A11 ウォレットの部品(重い)は、押すまで読み込まない
{
  const { page, ctx } = await open(hostUrl(FAKE_STREAMER, '軽さ'), { mobile: true });
  const js = [];
  page.on('response', (r) => { if (/\/assets\/.+\.js$/.test(r.url())) js.push({ url: r.url().split('/').pop(), size: Number(r.headers()['content-length'] || 0) }); });
  await sleep(7000);
  const before = js.map((j) => j.url);
  const walletLoaded = before.some((u) => /^(wallet|injected|SIWXUtil|w3m-modal)/.test(u));
  await page.click('#walletBtn');
  await sleep(6000);
  const afterClick = js.map((j) => j.url).filter((u) => !before.includes(u));
  check('A11', 'ウォレットの部品は、ボタンを押すまで読み込まない(最初は軽い)', !walletLoaded && afterClick.some((u) => /^wallet-/.test(u)), `最初 ${before.length}本 / 押したあと追加 ${afterClick.length}本`);
  await ctx.close();
}

await close();
summary();
