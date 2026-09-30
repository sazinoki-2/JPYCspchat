// テスト A(表示)・E(故障への強さ)
import { launch, close, open, check, summary, sleep, url, hostUrl, txt, pad32, BASE, JPYC, SA, FAKE_STREAMER, TRANSFER_TOPIC, RPC_HOSTS } from './harness.mjs';

await launch();

// A1 共通URL
{
  const { page, log, ctx } = await open(url(), { mobile: true });
  await sleep(6000);
  const title = await page.title();
  const introGone = await page.evaluate(() => !document.getElementById('intro'));
  check('A1-1', '共通URLがエラーなしで開く', log.errors.length === 0, log.errors.join(' / '));
  check('A1-2', 'オープニングが終わって消える', introGone);
  check('A1-3', 'タイトル', title === 'JPYCスパチャ', title);
  await page.click('#jpycBtn');
  await sleep(600);
  const g = await page.evaluate(() => ({ open: !document.getElementById('creator').hidden, title: document.getElementById('creatorTitle')?.textContent, sheet: !document.getElementById('sheet').hidden }));
  check('A1-4', '共通URLで「JPYC」→ 送り先をえらぶ案内', g.open && g.title === '送り先の配信者をえらぶ' && !g.sheet, JSON.stringify(g));
  await ctx.close();
}

// A2 本人の配信者URL(実在の投げ銭が並ぶ)
{
  const { page, log, ctx } = await open(hostUrl(SA, 'sa'), { mobile: true });
  let tips = [];
  for (let i = 0; i < 30 && !tips.length; i++) { await sleep(1000); tips = await page.evaluate(() => [...document.querySelectorAll('#feed .tip')].map((t) => t.innerText.replace(/\s+/g, ' ').trim())); }
  check('A2-1', '配信者URLのヘッダーに名前', (await txt(page, '#hostName')) === 'sa');
  check('A2-2', 'ページの題名に配信者名', (await page.title()) === 'sa のJPYCスパチャ', await page.title());
  check('A2-3', '実在の投げ銭(a 100 JPYC a)が並ぶ', tips.some((t) => t === 'a 100 JPYC a'), JSON.stringify(tips));
  check('A2-4', 'エラーなし', log.errors.length === 0, log.errors.join(' / '));
  await ctx.close();
}

// A3 送り先アドレスがおかしいURL
{
  const { page, ctx } = await open(url('#to=0x123&name=x'), { mobile: true });
  await sleep(6000);
  const s = await page.evaluate(() => ({ host: !document.getElementById('host').hidden, title: document.title, toast: document.getElementById('toast').hidden ? '' : document.getElementById('toast').textContent }));
  await page.click('#jpycBtn');
  await sleep(600);
  const g = await page.evaluate(() => ({ creator: !document.getElementById('creator').hidden, title: document.getElementById('creatorTitle')?.textContent, err: document.querySelector('#creatorWin [data-err]')?.textContent || '' }));
  console.log('   (A3 の様子)', JSON.stringify(s), JSON.stringify(g));
  check('A3-1', 'おかしなアドレスのURLでも、まちがった送り先にならない', !s.host, JSON.stringify(s));
  check('A3-2', 'おかしなアドレスのURLだと、そうと分かる表示が出る', Boolean(s.toast) || /まちが|おかし|ちがい|正しく/.test(g.err + s.toast), JSON.stringify({ ...s, ...g }));
  await ctx.close();
}

// A4 名前に HTML を入れても、文字としてしか出ない
{
  const evil = '<img src=x onerror=alert(1)>';
  const { page, log, ctx } = await open(hostUrl(FAKE_STREAMER, evil), { mobile: true });
  await sleep(6000);
  const s = await page.evaluate(() => ({ name: document.getElementById('hostName').textContent, imgs: document.querySelectorAll('#host img, .intro img').length, title: document.title }));
  check('A4-1', '名前のHTMLが動かない(ダイアログなし・画像要素なし)', log.dialogs === 0 && s.imgs === 0, JSON.stringify(s));
  check('A4-2', '名前は16字までの文字として出る', s.name === [...evil].slice(0, 16).join(''), s.name);
  await ctx.close();
}

// A5 長い名前
{
  const { page, ctx } = await open(hostUrl(FAKE_STREAMER, 'あ'.repeat(40)), { mobile: true });
  await sleep(5000);
  const n = await txt(page, '#hostName');
  check('A5', '長い名前は16字で切る', [...n].length === 16, `${[...n].length}字`);
  await ctx.close();
}

// A6 OBS
{
  const { page, ctx } = await open(hostUrl(FAKE_STREAMER, 'obs'), { obs: true, width: 460, height: 800 });
  await sleep(5000);
  const s = await page.evaluate(() => ({ obs: document.documentElement.classList.contains('obs'), bodyBg: getComputedStyle(document.body).backgroundColor, bg: getComputedStyle(document.getElementById('bgpat')).display }));
  check('A6', 'OBSでは背景が透明・模様なし', s.obs && /rgba\(0, 0, 0, 0\)|transparent/.test(s.bodyBg) && s.bg === 'none', JSON.stringify(s));
  await ctx.close();
}

// A7 画面幅(横にはみ出さない)
for (const [w, mobile] of [[320, true], [390, true], [768, false], [1280, false]]) {
  const { page, ctx } = await open(hostUrl(FAKE_STREAMER, 'はばテスト'), { mobile, width: w, height: 800 });
  await sleep(5000);
  const s = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  await page.click('#jpycBtn');
  await sleep(600);
  const s2 = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  check(`A7-${w}`, `幅${w}pxで横にはみ出さない(送る画面も)`, s.sw <= s.iw && s2.sw <= s2.iw, `${JSON.stringify(s)} ${JSON.stringify(s2)}`);
  await ctx.close();
}

// A8 Shift+T のテスト投げ銭
{
  const { page, ctx } = await open(hostUrl(FAKE_STREAMER, 'テスト'), { mobile: true });
  await sleep(6000);
  for (let i = 0; i < 5; i++) { await page.keyboard.down('Shift'); await page.keyboard.press('T'); await page.keyboard.up('Shift'); await sleep(700); }
  await sleep(1500);
  const s = await page.evaluate(() => ({
    cards: document.querySelectorAll('#feed .tip').length,
    tiers: [...new Set([...document.querySelectorAll('#feed .tip')].map((t) => [...t.classList].find((c) => /^t\d$/.test(c))))].sort().join(','),
    flags: [...document.querySelectorAll('#feed .tip .flag span')].map((f) => f.textContent),
    chips: document.querySelectorAll('#ticker .chip').length,
  }));
  check('A8', 'Shift+T で5件流れる(3段階の色・テストの旗・上のバー)', s.cards === 5 && s.tiers === 't1,t2,t3' && s.flags.every((f) => f.startsWith('テスト')) && s.chips >= 1, JSON.stringify(s));
  await ctx.close();
}

// E1 いちばん目の読み取り口が落ちていても、予備で読める
{
  const { page, log, ctx } = await open(hostUrl(SA, 'sa'), { mobile: true, rpc: { block: ['polygon-bor-rpc.publicnode.com'] } });
  let tips = [];
  for (let i = 0; i < 40 && !tips.length; i++) { await sleep(1000); tips = await page.evaluate(() => [...document.querySelectorAll('#feed .tip')].map((t) => t.innerText.replace(/\s+/g, ' ').trim())); }
  check('E1', '読み取り口1つが落ちても予備で並ぶ', tips.some((t) => t === 'a 100 JPYC a'), `止めた通信 ${log.aborted}件 / ${JSON.stringify(tips)}`);
  await ctx.close();
}

// E2 読み取り口が全部落ちたら、お知らせが出る
{
  const { page, ctx } = await open(hostUrl(SA, 'sa'), { mobile: true, rpc: { block: RPC_HOSTS } });
  let t = '';
  for (let i = 0; i < 40 && !t; i++) { await sleep(1000); t = await page.evaluate(() => (document.getElementById('toast').hidden ? '' : document.getElementById('toast').textContent)); }
  check('E2', '全部落ちたら「読み込みが止まっています」', /チェーンの読み込みが止まっています/.test(t), t);
  await ctx.close();
}

// E3 コメント置き場に届かなくても、投げ銭は並ぶ(名前はアドレス)
{
  const { page, log, ctx } = await open(hostUrl(SA, 'sa'), { mobile: true, firestore: 'block' });
  let tips = [];
  for (let i = 0; i < 30 && !tips.length; i++) { await sleep(1000); tips = await page.evaluate(() => [...document.querySelectorAll('#feed .tip')].map((t) => t.innerText.replace(/\s+/g, ' ').trim())); }
  check('E3', 'コメント置き場が落ちても投げ銭は並ぶ', tips.some((t) => /^0xb8B6…1507 100 JPYC$/.test(t)), `${JSON.stringify(tips)} / pageerror ${log.errors.filter((e) => !/Failed to load resource|ERR_FAILED|firestore/i.test(e)).length}`);
  await ctx.close();
}

// E4・E5 少なすぎる送金は出さない / NGワード(テスト用の送金記録とコメントを差しこむ)
{
  const H1 = `0x${'e1'.repeat(32)}`;
  const H2 = `0x${'e2'.repeat(32)}`;
  let head = 0;
  let injected = false;
  const mkLog = (hash, from, amount, block) => ({
    address: JPYC.toLowerCase(), topics: [TRANSFER_TOPIC, pad32(from), pad32(FAKE_STREAMER)], data: pad32((BigInt(amount) * 10n ** 18n).toString(16)),
    blockNumber: `0x${block.toString(16)}`, transactionHash: hash, transactionIndex: '0x0', blockHash: `0x${'11'.repeat(32)}`, logIndex: hash === H1 ? '0x0' : '0x1', removed: false,
  });
  const cfg = `window.JPYC_CHAT_CONFIG={reownProjectId:'e65412147b0acf150e53c93aa91a895c',firebase:{projectId:'jpycspchat'},historyHours:6,minTip:100,ngWords:['ばか']};`;
  const { page, ctx } = await open(hostUrl(FAKE_STREAMER, 'NGテスト'), {
    mobile: true,
    config: cfg,
    firestore: { docs: { [H2]: { n: 'ばかさん', m: 'ばかばか！' } } },
    rpc: {
      respond: async (b) => {
        if (b.method === 'eth_getLogs' && (b.params?.[0]?.topics?.[2] || '').toLowerCase() === pad32(FAKE_STREAMER) && !injected) {
          injected = true;
          const from = parseInt(b.params[0].fromBlock, 16);
          head = from;
          return [mkLog(H1, '0x1111111111111111111111111111111111111111', 50, from), mkLog(H2, '0x2222222222222222222222222222222222222222', 300, from)];
        }
        return undefined;
      },
    },
  });
  let tips = [];
  for (let i = 0; i < 30 && tips.length < 1; i++) { await sleep(1000); tips = await page.evaluate(() => [...document.querySelectorAll('#feed .tip')].map((t) => t.innerText.replace(/\s+/g, ' ').trim())); }
  await sleep(1500);
  tips = await page.evaluate(() => [...document.querySelectorAll('#feed .tip')].map((t) => t.innerText.replace(/\s+/g, ' ').trim()));
  check('E4', '100 JPYC 未満(50)は出さない', !tips.some((t) => / 50 JPYC/.test(t)), JSON.stringify(tips));
  check('E5', 'NGワードは＊＊＊になる', tips.some((t) => t === '＊＊＊さん 300 JPYC ＊＊＊＊＊＊！'), JSON.stringify(tips));
  await ctx.close();
}

await close();
summary();
