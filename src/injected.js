// ブラウザに入っているウォレット(PCの MetaMask 拡張機能や、ウォレットアプリの中のブラウザ)で払う係。
// WalletConnect(Reown)の番号がまだ無いときに使う。番号が入れば wallet.js(WalletConnect)のほうを使う。
// wallet.js と同じ形(initWallet / connect / disconnectWallet / sendJPYC)にしてある
import { createWalletClient, custom, erc20Abi, parseUnits, numberToHex, getAddress } from 'viem';
import { polygon } from 'viem/chains';
import { JPYC, DECIMALS } from './chain.js';

const provider = () => window.ethereum;

export function initWallet() {}

// つなぐ(すでに許可ずみなら確認は出ない)。いまウォレットで選ばれているアドレスを返す
export async function connect() {
  const p = provider();
  if (!p) throw new Error('no-wallet');
  const list = await p.request({ method: 'eth_requestAccounts' });
  if (!list || !list[0]) throw new Error('closed');
  return getAddress(list[0]);
}

// このページとのつながりを切る(できないウォレットでも、このページでは使わなくなる)
export async function disconnectWallet() {
  try {
    await provider()?.request({ method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] });
  } catch {
    /* 切る機能がないウォレット */
  }
}

// ウォレットのネットワークを Polygon にしてもらう(入っていなければ追加してもらう)
async function usePolygon(p) {
  if (Number(await p.request({ method: 'eth_chainId' })) === polygon.id) return;
  const chainId = numberToHex(polygon.id);
  try {
    await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] });
  } catch (e) {
    const code = e?.code ?? e?.data?.originalError?.code;
    if (code !== 4902) throw e;
    await p.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId,
        chainName: 'Polygon',
        nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
        rpcUrls: ['https://polygon-bor-rpc.publicnode.com'],
        blockExplorerUrls: ['https://polygonscan.com'],
      }],
    });
  }
}

// JPYC を送る(ウォレットに承認を出す)。戻り値は送金番号(tx hash)
export async function sendJPYC(to, amount) {
  const p = provider();
  if (!p) throw new Error('no-wallet');
  const account = await connect();
  await usePolygon(p);
  const client = createWalletClient({ account, chain: polygon, transport: custom(p) });
  return client.writeContract({
    address: JPYC,
    abi: erc20Abi,
    functionName: 'transfer',
    args: [to, parseUnits(String(amount), DECIMALS)],
  });
}
