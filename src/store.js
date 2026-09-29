// コメント置き場(Firebase)の係
// 送るのは「送金番号(tx hash)・なまえ・コメント」の3つだけ。
// 金額・アドレス・日時はチェーンから読むので、ここには入れない。
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore/lite';

let db = null;

export function initStore(firebaseConfig) {
  // 空の項目は渡さない(Firestore だけなら projectId だけで動く)
  const c = Object.fromEntries(Object.entries(firebaseConfig).filter(([, v]) => typeof v === 'string' && v.trim()));
  db = getFirestore(initializeApp(c));
}

export const storeReady = () => db !== null;

// 送金番号を名前にして、1件だけ読む(まとめて読むことはルールで禁止)
export async function loadComment(tx) {
  if (!db) return null;
  const snap = await getDoc(doc(db, 'tips', tx.toLowerCase()));
  if (!snap.exists()) return null;
  const d = snap.data();
  return { n: typeof d.n === 'string' ? d.n : '', m: typeof d.m === 'string' ? d.m : '' };
}

// なまえ(n)とコメント(m)の2つだけを保存する。書き換え・削除はルールで禁止
export async function saveComment(tx, n, m) {
  if (!db) return;
  await setDoc(doc(db, 'tips', tx.toLowerCase()), { n, m });
}
