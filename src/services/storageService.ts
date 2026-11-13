import { Book, Series } from '../types/manga';

const DB_NAME = 'mofushelf_db';
const DB_VERSION = 1;
const STORE_SERIES = 'series';
const STORE_BOOKS = 'books';

function openMofuDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_SERIES)) {
        db.createObjectStore(STORE_SERIES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_BOOKS)) {
        db.createObjectStore(STORE_BOOKS, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open error'));
  });
}

export async function saveShelfToIndexedDb(
  seriesList: Series[],
  books: Book[]
): Promise<boolean> {
  try {
    const db = await openMofuDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_SERIES, STORE_BOOKS], 'readwrite');
      const sStore = tx.objectStore(STORE_SERIES);
      const bStore = tx.objectStore(STORE_BOOKS);

      sStore.clear();
      seriesList.forEach((s) => sStore.put(s));

      bStore.clear();
      books.forEach((b) => bStore.put(b));

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('IndexedDB write error'));
    });
    db.close();
    return true;
  } catch {
    return false;
  }
}

export async function loadShelfFromIndexedDb(): Promise<{
  series: Series[];
  books: Book[];
} | null> {
  try {
    const db = await openMofuDb();
    const result = await new Promise<{ series: Series[]; books: Book[] }>(
      (resolve, reject) => {
        const tx = db.transaction([STORE_SERIES, STORE_BOOKS], 'readonly');
        const sReq = tx.objectStore(STORE_SERIES).getAll();
        const bReq = tx.objectStore(STORE_BOOKS).getAll();

        tx.oncomplete = () => {
          resolve({
            series: (sReq.result as Series[]) || [],
            books: (bReq.result as Book[]) || [],
          });
        };
        tx.onerror = () => reject(tx.error || new Error('IndexedDB read error'));
      }
    );
    db.close();
    if (result.series.length === 0 && result.books.length === 0) return null;
    return result;
  } catch {
    return null;
  }
}

export async function syncShelfToSupabase(options: {
  supabaseUrl: string;
  supabaseAnonKey: string;
  seriesList: Series[];
  books: Book[];
}): Promise<{ ok: boolean; message: string }> {
  const baseUrl = options.supabaseUrl.trim().replace(/\/+$/, '');
  const key = options.supabaseAnonKey.trim();
  if (!baseUrl || !key) {
    return { ok: false, message: 'Supabase URL と Anon Key を入力してください。' };
  }

  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates',
  };

  try {
    const sRes = await fetch(`${baseUrl}/rest/v1/series`, {
      method: 'POST',
      headers,
      body: JSON.stringify(
        options.seriesList.map((s) => ({
          id: s.id,
          title: s.title,
          author: s.author,
          publisher: s.publisher,
          cover_url: s.cover_url,
          notify_new_release: s.notify_new_release,
          status: s.status,
          created_at: s.created_at,
        }))
      ),
    });
    if (!sRes.ok) {
      return { ok: false, message: `Supabase series 同期エラー (${sRes.status})` };
    }

    const bRes = await fetch(`${baseUrl}/rest/v1/books`, {
      method: 'POST',
      headers,
      body: JSON.stringify(
        options.books.map((b) => ({
          id: b.id,
          series_id: b.series_id,
          isbn: b.isbn,
          title: b.title,
          volume_number: b.volume_number,
          cover_url: b.cover_url,
          sales_date: b.sales_date,
          is_owned: b.is_owned,
          is_special_edition: b.is_special_edition,
          memo: b.memo,
          registered_at: b.registered_at || null,
        }))
      ),
    });
    if (!bRes.ok) {
      return { ok: false, message: `Supabase books 同期エラー (${bRes.status})` };
    }

    return {
      ok: true,
      message: `Supabaseへ ${options.seriesList.length}作品・${options.books.length}冊を同期しました！`,
    };
  } catch {
    return { ok: false, message: 'Supabaseへの接続に失敗しました。URL/CORS設定をご確認ください。' };
  }
}

export const SUPABASE_SCHEMA_SQL = `create table if not exists series (
  id text primary key,
  title text not null,
  author text,
  publisher text,
  cover_url text,
  notify_new_release boolean default true,
  status text default 'reading',
  created_at timestamptz default now()
);

create table if not exists books (
  id text primary key,
  series_id text references series(id) on delete cascade,
  isbn text,
  title text not null,
  volume_number integer not null,
  cover_url text,
  sales_date date,
  is_owned boolean default false,
  is_special_edition boolean default false,
  memo text,
  registered_at timestamptz
);`;
