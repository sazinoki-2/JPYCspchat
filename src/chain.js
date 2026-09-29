// Polygon のチェーンを読む係: 受け取りアドレスへの JPYC 送金を見張る・残高・確認待ち
import { createPublicClient, fallback, http, parseAbiItem, erc20Abi, formatUnits } from 'viem';
import { polygon } from 'viem/chains';

// 新JPYC(電子決済手段, 2025-10-27〜)。Ethereum・Polygon・Avalanche で同じアドレス
export const JPYC = '0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29';
export const DECIMALS = 18;

// だれでも使える公開の読み取り口(1つがだめなら次を使う)
// 上の2つは 1000 ブロックずつの読み出しに対応(2026-09 確認)。下の2つは狭い範囲しか読めないので最後の予備
// (polygon-rpc.com は 2026-09 に止まっていたので外した)
const RPCS = [
  'https://polygon-bor-rpc.publicnode.com',
  'https://polygon.gateway.tenderly.co',
  'https://polygon.drpc.org',
  'https://1rpc.io/matic',
];

export const client = createPublicClient({
  chain: polygon,
  transport: fallback(RPCS.map((url) => http(url, { timeout: 12_000, retryCount: 1 }))),
});

const TRANSFER = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');
const STEP = 1000n; // 1回で読むブロック数(公開の読み取り口の上限に合わせて小さめ)
const POLL_MS = 4000; // 新しい送金を見に行く間隔
const BLOCK_SEC = 2.1; // Polygon の1ブロックのだいたいの秒数
// 公開の読み取り口は、いちばん新しいブロックの直後を読むと「範囲が不正」と断ることがある
// (中で何台かに振り分けていて、少し遅れている台がある)。なので2ブロック(約4秒)手前までを読む
const LAG = 2n;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 範囲が広すぎて断られたら、半分に割って読み直す
async function getLogsSafe(to, fromBlock, toBlock) {
  try {
    return await client.getLogs({ address: JPYC, event: TRANSFER, args: { to }, fromBlock, toBlock });
  } catch (e) {
    if (toBlock - fromBlock < 50n) throw e;
    const mid = fromBlock + (toBlock - fromBlock) / 2n;
    return [...(await getLogsSafe(to, fromBlock, mid)), ...(await getLogsSafe(to, mid + 1n, toBlock))];
  }
}

async function getLogsRange(to, from, until) {
  const out = [];
  for (let a = from; a <= until; a += STEP) {
    const b = a + STEP - 1n < until ? a + STEP - 1n : until;
    out.push(...(await getLogsSafe(to, a, b)));
  }
  return out;
}

// ブロックの時刻(同じブロックは1回だけ聞く)
const blockTime = new Map();
async function timeOf(n) {
  if (!blockTime.has(n)) {
    const b = await client.getBlock({ blockNumber: n });
    blockTime.set(n, Number(b.timestamp) * 1000);
  }
  return blockTime.get(n);
}

async function toTips(logs) {
  logs.sort((a, b) => (a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1));
  const tips = [];
  for (const log of logs) {
    tips.push({
      id: `${log.transactionHash}:${log.logIndex}`.toLowerCase(),
      tx: log.transactionHash.toLowerCase(),
      from: log.args.from,
      jpyc: Number(formatUnits(log.args.value, DECIMALS)),
      ts: await timeOf(log.blockNumber),
    });
  }
  return tips;
}

// 受け取りアドレスへの JPYC 送金を見張る。最初に過去ぶん、そのあとは数秒おきに新しいぶん
export async function watchTips({ to, historyHours, onTips, onStatus }) {
  let last;
  for (;;) {
    try {
      const head = (await client.getBlockNumber()) - LAG;
      const span = BigInt(Math.round((historyHours * 3600) / BLOCK_SEC));
      const start = head > span ? head - span : 0n;
      const tips = await toTips(await getLogsRange(to, start, head));
      last = head;
      onStatus(true);
      await onTips(tips, false);
      break;
    } catch (e) {
      console.warn('[chain] 最初の読み込みに失敗(5秒後にやり直します)', e);
      onStatus(false);
      await sleep(5000);
    }
  }
  const tick = async () => {
    try {
      const head = (await client.getBlockNumber()) - LAG;
      if (head > last) {
        const tips = await toTips(await getLogsRange(to, last + 1n, head));
        last = head; // 読めたときだけ進める(失敗したら次の回で同じ範囲を読み直す)
        if (tips.length) await onTips(tips, true);
      }
      onStatus(true);
    } catch (e) {
      console.warn('[chain] 読み込みに失敗(自動でやり直します)', e);
      onStatus(false);
    }
    setTimeout(tick, POLL_MS);
  };
  setTimeout(tick, POLL_MS);
}

// 送る前の確認用: JPYC の残高と、ガス代(POL)の残高
export async function balances(address) {
  const [jpyc, pol] = await Promise.all([
    client.readContract({ address: JPYC, abi: erc20Abi, functionName: 'balanceOf', args: [address] }),
    client.getBalance({ address }),
  ]);
  return { jpyc: Number(formatUnits(jpyc, DECIMALS)), pol };
}

// 送金がチェーンに入るまで待つ(最大3分)
export function waitReceipt(hash) {
  return client.waitForTransactionReceipt({ hash, timeout: 180_000, pollingInterval: 2500 });
}
