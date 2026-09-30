// テスト B(ウォレット接続)
import { launch, close, open, check, summary, sleep, hostUrl, txt, deepList, deepClick, modalOpen, connectMetaMask, FAKE_STREAMER, FAKE_VIEWER } from './harness.mjs';

await launch();
const names = (list) => list.map((w) => `${w.name}${w.tag ? `(${w.tag})` : ''}`).join(' / ');

// B1 PC(ウォレットなし)の選択画面
{
  const { page, ctx } = await open(hostUrl(FAKE_STREAMER, 'テスト'));
  await sleep(6000);
  await page.click('#walletBtn');
  let list = [];
  for (let i = 0; i < 30 && !list.length; i++) { await sleep(300); list = await deepList(page, 'W3M-LIST-WALLET'); }
  check('B1', 'PC: WalletConnect(QR)・MetaMask・HashPort が並ぶ', names(list) === 'WalletConnect(qr code) / MetaMask / HashPort Wallet', names(list));
  await ctx.close();
}

// B2 スマホ(ウォレットなし)の選択画面
{
  const { page, ctx } = await open(hostUrl(FAKE_STREAMER, 'テスト'), { mobile: true });
  await sleep(6000);
  await page.click('#walletBtn');
  let list = [];
  for (let i = 0; i < 30 && !list.length; i++) { await sleep(300); list = await deepList(page, 'W3M-LIST-WALLET'); }
  check('B2', 'スマホ: MetaMask・HashPort の2つだけ', names(list) === 'MetaMask / HashPort Wallet', names(list));
  await ctx.close();
}

// B3・B4 MetaMask(Polygon にいる / Ethereum にいる)
for (const [id, chain, label] of [['B3', '0x89', 'Polygon'], ['B4', '0x1', 'Ethereum']]) {
  const { page, log, ctx } = await open(hostUrl(FAKE_STREAMER, 'テスト'), { wallet: { account: FAKE_VIEWER, chain } });
  await sleep(6000);
  const sec = await connectMetaMask(page);
  const s = await page.evaluate(() => ({ label: document.getElementById('walletLabel').textContent, me: document.getElementById('meAddr').textContent, switchAsked: window.__w.switchAsked }));
  check(id, `MetaMask(${label}にいる)で接続 → すぐ閉じて接続済み・切りかえ確認なし`, sec !== null && sec < 5 && s.switchAsked === 0 && s.label === '0x7E57…7E57', `${sec}秒 ${JSON.stringify(s)} ${log.errors.join(' / ')}`);
  await ctx.close();
}

// B5 接続をことわった
{
  const { page, ctx } = await open(hostUrl(FAKE_STREAMER, 'テスト'), { wallet: { account: FAKE_VIEWER, rejectConnect: true } });
  await sleep(6000);
  await page.click('#walletBtn');
  for (let i = 0; i < 30 && !(await deepList(page, 'W3M-LIST-WALLET')).length; i++) await sleep(300);
  await deepClick(page, 'wallet-selector-io.metamask');
  await sleep(2500);
  const stillOpen = await modalOpen(page);
  await page.keyboard.press('Escape');
  await sleep(2000);
  const s = await page.evaluate(() => ({ modal: Boolean(document.querySelector('w3m-modal')?.open), label: document.getElementById('walletLabel').textContent, toast: document.getElementById('toast').hidden ? '' : document.getElementById('toast').textContent }));
  check('B5-1', 'ことわると、選択画面に残って(やり直せる)、閉じると未接続のまま', stillOpen && !s.modal && /接続/.test(s.label) && !/0x/.test(s.label), JSON.stringify({ stillOpen, ...s }));
  check('B5-2', 'ことわって閉じたら「つながりませんでした」', /つながりませんでした/.test(s.toast), s.toast);
  // もう一度押すと、また選べる
  await page.click('#walletBtn');
  let list = [];
  for (let i = 0; i < 30 && !list.length; i++) { await sleep(300); list = await deepList(page, 'W3M-LIST-WALLET'); }
  check('B5-3', 'もう一度押すと選択画面がまた出る', list.length > 0, names(list));
  await ctx.close();
}

// B6 切る → もう一度つなぐ
{
  const { page, ctx } = await open(hostUrl(FAKE_STREAMER, 'テスト'), { wallet: { account: FAKE_VIEWER } });
  await sleep(6000);
  await connectMetaMask(page);
  await page.click('#walletBtn');
  await sleep(500);
  const menu = await page.evaluate(() => ({ open: !document.getElementById('walletMenu').hidden, addr: document.getElementById('menuAddr').textContent }));
  await page.click('#menuOff');
  await sleep(1500);
  const after = await page.evaluate(() => ({ label: document.getElementById('walletLabel').textContent, me: document.getElementById('meAddr').textContent, revoked: window.__w.calls.includes('wallet_revokePermissions') }));
  check('B6-1', 'メニューにアドレス → 「ウォレットを切る」で未接続にもどる', menu.open && /0x7E57/i.test(menu.addr) && !/0x/.test(after.label) && after.me === 'ウォレット未接続', JSON.stringify({ menu, after }));
  const sec = await connectMetaMask(page);
  check('B6-2', '切ったあと、もう一度つなげる', sec !== null, `${sec}秒`);
  await ctx.close();
}

// B7 再読み込みしても覚えている
{
  const { page, ctx } = await open(hostUrl(FAKE_STREAMER, 'テスト'), { wallet: { account: FAKE_VIEWER } });
  await sleep(6000);
  await connectMetaMask(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(6000);
  const s = await page.evaluate(() => ({ label: document.getElementById('walletLabel').textContent, me: document.getElementById('meAddr').textContent }));
  check('B7', '再読み込みしても接続したアドレスが出る', /0x7E57/i.test(s.label), JSON.stringify(s));
  await ctx.close();
}

// B8 配信者本人が自分のページでつなぐ
{
  const { page, ctx } = await open(hostUrl(FAKE_STREAMER, 'じぶん'), { wallet: { account: FAKE_STREAMER } });
  await sleep(6000);
  await connectMetaMask(page);
  await page.click('#walletBtn');
  await sleep(500);
  const role = await page.evaluate(() => !document.getElementById('menuRole').hidden);
  await page.keyboard.press('Escape');
  await page.mouse.click(5, 400);
  await sleep(300);
  await page.click('#createBtn');
  await sleep(800);
  const s = await page.evaluate(() => ({ title: document.getElementById('creatorTitle')?.textContent, url: document.querySelector('#creatorWin .mk-url code')?.textContent, qr: Boolean(document.querySelector('#creatorWin .qr svg')) }));
  check('B8-1', '自分のページでは「このチャット欄の配信者です」', role);
  check('B8-2', '自分のページで「配信者」ボタン → 自分のURLとQR', s.title === 'あなたのチャット欄' && /#to=0x5ccff2ffcc00141414ffffff5ccff2ffcc001414&name=/i.test(s.url || '') && s.qr, JSON.stringify(s));
  await ctx.close();
}

// B9 HashPort(スマホはアプリを開く・PCはQR)
for (const [id, mobile] of [['B9-スマホ', true], ['B9-PC', false]]) {
  const { page, ctx } = await open(hostUrl(FAKE_STREAMER, 'テスト'), { mobile });
  await page.evaluateOnNewDocument(() => {});
  await page.evaluate(() => { window.__opened = []; window.open = (u) => { window.__opened.push(String(u)); return null; }; });
  await sleep(6000);
  await page.evaluate(() => { window.__opened = []; window.open = (u) => { window.__opened.push(String(u)); return null; }; });
  await page.click('#walletBtn');
  for (let i = 0; i < 30 && !(await deepList(page, 'W3M-LIST-WALLET')).length; i++) await sleep(300);
  await deepClick(page, 'wallet-selector-38633830ef578a1249c345848a8d6487551a346b923d21ce197ea57f423f3113');
  await sleep(8000);
  const r = await page.evaluate(() => {
    let qr = null;
    const walk = (root) => root.querySelectorAll('*').forEach((el) => { if (el.tagName === 'WUI-QR-CODE') qr = el.getAttribute('uri') || el.uri; if (el.shadowRoot) walk(el.shadowRoot); });
    walk(document);
    return { opened: window.__opened, qr };
  });
  const ok = mobile ? r.opened.some((u) => u.startsWith('expo2025-wallet://wc?uri=wc%3A')) : /^wc:/.test(r.qr || '');
  check(id, mobile ? 'スマホ: HashPort アプリを開くリンク(接続番号入り)' : 'PC: HashPort で読むQR(wc:)', ok, mobile ? (r.opened[0] || '').slice(0, 50) : (r.qr || '').slice(0, 20));
  await ctx.close();
}

await close();
summary();
