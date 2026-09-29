// ウォレットにつなぐ係(WalletConnect)。重いので「投げる」を押したときに初めて読み込む
import { createAppKit } from '@reown/appkit';
import { polygon } from '@reown/appkit/networks';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { getConnection, watchConnection, switchChain, writeContract, disconnect } from '@wagmi/core';
import { erc20Abi, parseUnits } from 'viem';
import { JPYC, DECIMALS } from './chain.js';

let kit = null;
let config = null;

export function initWallet(projectId) {
  if (kit) return;
  const adapter = new WagmiAdapter({ projectId, networks: [polygon] });
  config = adapter.wagmiConfig;
  kit = createAppKit({
    adapters: [adapter],
    networks: [polygon],
    defaultNetwork: polygon,
    projectId,
    metadata: {
      name: 'JPYCスパチャ',
      description: 'JPYCで投げ銭できるチャット欄',
      url: window.location.origin,
      icons: [new URL('icon.png', window.location.href).href],
    },
    // よけいな機能と利用状況の送信は切っておく
    features: {
      analytics: false,
      email: false,
      socials: false,
      swaps: false,
      onramp: false,
      connectMethodsOrder: ['wallet'],
    },
    enableCoinbase: false,
    themeMode: 'light',
    themeVariables: {
      '--w3m-accent': '#141414',
      '--w3m-border-radius-master': '0px',
      '--w3m-font-family': "'Zen Kaku Gothic New', sans-serif",
      '--w3m-z-index': 1000,
    },
  });
}

export function connectedAddress() {
  const c = getConnection(config);
  return c.status === 'connected' ? c.address : null;
}

// つながっていなければウォレット選びの画面を開いて、つながるまで待つ
export function connect() {
  const now = connectedAddress();
  if (now) return Promise.resolve(now);
  return new Promise((resolve, reject) => {
    let opened = false;
    let settled = false;
    let stopConn = () => {};
    let stopState = () => {};
    const done = (fn, v) => {
      if (settled) return;
      settled = true;
      stopConn();
      stopState();
      fn(v);
    };
    stopConn = watchConnection(config, {
      onChange(c) {
        if (c.status === 'connected') done(resolve, c.address);
      },
    });
    stopState = kit.subscribeState((s) => {
      if (s.open) opened = true;
      else if (opened) {
        // 画面が閉じた。つながった直後に閉じることもあるので、少し待ってから判断する
        setTimeout(() => {
          const a = connectedAddress();
          if (a) done(resolve, a);
          else done(reject, new Error('closed'));
        }, 900);
      }
    });
    kit.open();
  });
}

// つないでいるウォレットを切る(配信者が別のウォレットにしたいとき)
export async function disconnectWallet() {
  if (config) await disconnect(config);
}

// JPYC を送る(ウォレットに承認を出す)。戻り値は送金番号(tx hash)
export async function sendJPYC(to, amount) {
  const c = getConnection(config);
  if (c.chainId !== polygon.id) await switchChain(config, { chainId: polygon.id });
  return writeContract(config, {
    address: JPYC,
    abi: erc20Abi,
    functionName: 'transfer',
    args: [to, parseUnits(String(amount), DECIMALS)],
    chainId: polygon.id,
  });
}
