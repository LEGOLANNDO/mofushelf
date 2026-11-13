import { CATALOG_SERIES } from '../data/mockData';
import { CatalogSeries } from '../types/manga';
import { generatePastelCover } from '../utils/coverGenerator';

export interface ParsedMangaTitle {
  seriesTitle: string;
  volumeNumber: number;
  isSpecialEdition: boolean;
}

export interface FetchedBookInfo {
  isbn: string;
  fullTitle: string;
  seriesTitle: string;
  volumeNumber: number;
  author: string;
  publisher: string;
  coverUrl: string;
  salesDate: string;
  isSpecialEdition: boolean;
  source: 'openbd' | 'rakuten' | 'fallback';
}

export interface OpenBdVolumeMeta {
  volumeNumber: number;
  isbn: string;
  title: string;
  coverUrl: string;
  salesDate: string;
}

export interface FetchedCatalogSeries extends CatalogSeries {
  source: 'openbd' | 'rakuten' | 'ndl' | 'itunes';
  volumes?: OpenBdVolumeMeta[];
}

export const OPENBD_REAL_SERIES_PRESETS: {
  key: string;
  label: string;
  isbns: string[];
  accentColor: string;
}[] = [
  {
    key: 'frieren',
    label: '葬送のフリーレン',
    isbns: [
      '9784098501809',
      '9784098501816',
      '9784098502882',
      '9784098504909',
      '9784098506347',
      '9784098507283',
      '9784098510184',
      '9784098511488',
      '9784098512607',
      '9784098517718',
      '9784098527694',
      '9784098530304',
      '9784098532339',
    ],
    accentColor: '#7AD9C5',
  },
  {
    key: 'spyxfamily',
    label: 'SPY×FAMILY',
    isbns: [
      '9784088820118',
      '9784088821207',
      '9784088821832',
      '9784088822297',
      '9784088824635',
      '9784088825458',
      '9784088826691',
      '9784088828435',
      '9784088830827',
      '9784088831275',
      '9784088834870',
      '9784088836751',
      '9784088838397',
    ],
    accentColor: '#FF8FA3',
  },
  {
    key: 'chainsaw',
    label: 'チェンソーマン',
    isbns: [
      '9784088817804',
      '9784088818313',
      '9784088820163',
      '9784088820750',
      '9784088821719',
      '9784088822242',
      '9784088823287',
      '9784088823768',
      '9784088824703',
      '9784088825274',
      '9784088825762',
      '9784088832715',
    ],
    accentColor: '#FFA97A',
  },
];

function toHalfWidth(str: string): string {
  return str
    .replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/　/g, ' ')
    .trim();
}

export function normalizeSeriesTitle(title: string): string {
  return toHalfWidth(title)
    .toLowerCase()
    .replace(/[\s・:：!！?？\-―~～()（）【】「」『』]/g, '');
}

export function stripParallelTitle(raw: string): string {
  // 日本語タイトルと並列記載された「 = 英語タイトル」や「 ＝ English Title」を除去
  return toHalfWidth(raw)
    .replace(/\s*[=＝]\s*.*$/g, '')
    .trim();
}

export function parseExplicitVolumeString(volRaw?: string): number | null {
  if (!volRaw) return null;
  const half = toHalfWidth(volRaw).trim();
  if (!half) return null;
  if (/^(上|中|下|前|後|前編|後編)$/.test(half)) return null;

  let m = half.match(
    /^(?:vol\.?\s*|no\.?\s*|第\s*|巻\s*)?(\d{1,3})(?:\s*巻)?$/i
  );
  if (m) {
    const n = Number(m[1]);
    return n >= 1 && n <= 200 ? n : null;
  }

  m = half.match(/(?:vol\.?|第|巻)\s*(\d{1,3})/i);
  if (m) {
    const n = Number(m[1]);
    return n >= 1 && n <= 200 ? n : null;
  }

  m = half.match(/^\[?(\d{1,3})\]?(?:\s|$|\()/);
  if (m) {
    const n = Number(m[1]);
    return n >= 1 && n <= 200 ? n : null;
  }

  return null;
}

export function isNoiseBookItem(title: string, volumeStr?: string): boolean {
  const combined = toHalfWidth(`${title} ${volumeStr || ''}`);
  return /(総集編|公式ファンブック|ファンブック|キャラクターブック|公式ガイド|ガイドブック|副読本|ノベライズ|小説アニメ|小説.*前奏|小説版|画集|イラスト集|図録|原画集|アンソロジー|アニメコミックス|フィルムコミック|カレンダー|ステッカー|シール|分冊版|単話版?|合本版|全巻セット|セット買い|ベスト10|spoon\.2di|\bmagazine\b|週刊少年|月刊少年|ジャンプgiga|徹底解説|読み解く|検定|大研究|劇場版)/i.test(
    combined
  );
}

export function parseMangaTitleAndVolume(rawTitle: string): ParsedMangaTitle {
  const half = toHalfWidth(rawTitle);
  const isSpecialEdition = /(特装版|限定版|同梱版|小冊子付き|特装)/.test(half);

  const cleanedWorking = half
    .replace(/^(?:【(?:コミック|漫画|電子書籍|電子版)】|\[\s*コミック\s*\])\s*/g, '')
    .replace(/\s*[（(][^）)]*(?:コミックス|comics|comic|文庫|新書|digital|デジタル|電子)[^）)]*[）)]\s*$/gi, '')
    .replace(/[【\[（(]?(特装版|限定版|同梱版|小冊子付き版?|通常版)[】\]）)]?/g, '')
    .replace(/\s*(?:モノクロ版|カラー版|デジタル版|合本版|愛蔵版|新装版|完全版)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const extractVolAndTitle = (
    input: string
  ): { title: string; volume: number | null } => {
    // 末尾の (15) や （15）
    let m = input.match(/^(.*?)\s*[(\[（]\s*(\d{1,3})\s*[)\]）]$/);
    if (m && m[1].trim()) return { title: m[1].trim(), volume: Number(m[2]) };

    // 末尾の 第15巻 / 15巻 / VOL.15 / #15 / 巻15
    m = input.match(
      /^(.*?)\s*(?:第\s*(\d{1,3})\s*巻|(\d{1,3})\s*巻|巻\s*(\d{1,3})|(?:vol\.?|#)\s*(\d{1,3}))$/i
    );
    if (m && m[1].trim()) {
      return {
        title: m[1].trim(),
        volume: Number(m[2] || m[3] || m[4] || m[5]),
      };
    }

    // 巻数の後ろにサブタイトルが続くケース (例: "作品名 15 副題")
    m = input.match(/^(.*?)\s+(?:第\s*)?(\d{1,3})(?:\s*巻)?\s+[^\d\s].*$/);
    if (m && m[1].trim() && Number(m[2]) <= 200) {
      return { title: m[1].trim(), volume: Number(m[2]) };
    }

    // 末尾数字 (例: "SPY×FAMILY 18", "ダンダダン 25")
    m = input.match(/^(.*?)\s+(\d{1,3})$/);
    if (m && m[1].trim() && Number(m[2]) <= 200) {
      return { title: m[1].trim(), volume: Number(m[2]) };
    }

    return { title: input.trim(), volume: null };
  };

  const firstPass = extractVolAndTitle(cleanedWorking);
  const jpOnly = stripParallelTitle(firstPass.title);
  const secondPass = extractVolAndTitle(jpOnly);

  return {
    seriesTitle: stripParallelTitle(secondPass.title) || jpOnly || half,
    volumeNumber: secondPass.volume ?? firstPass.volume ?? 1,
    isSpecialEdition,
  };
}

function formatOpenBdDate(raw?: string): string {
  if (!raw) return new Date().toISOString().slice(0, 10);
  const digits = raw.replace(/[^0-9]/g, '');
  if (digits.length === 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  }
  if (digits.length === 6) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-01`;
  }
  return new Date().toISOString().slice(0, 10);
}

function formatRakutenDate(raw?: string): string {
  if (!raw) return new Date().toISOString().slice(0, 10);
  const match = raw.match(/(\d{4})年(\d{1,2})月(?:(\d{1,2})日)?/);
  if (match) {
    const y = match[1];
    const m = match[2].padStart(2, '0');
    const d = (match[3] || '01').padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return new Date().toISOString().slice(0, 10);
}

interface OpenBdItem {
  summary?: {
    isbn?: string;
    title?: string;
    volume?: string;
    series?: string;
    publisher?: string;
    pubdate?: string;
    cover?: string;
    author?: string;
  };
}

function parseOpenBdEntry(item: OpenBdItem, isbnFallback: string): FetchedBookInfo | null {
  const s = item?.summary;
  if (!s || !s.title) return null;

  const parsed = parseMangaTitleAndVolume(s.title);
  const explicitVol = parseExplicitVolumeString(s.volume);
  const volumeNumber = explicitVol ?? parsed.volumeNumber;
  const seriesTitle =
    stripParallelTitle(parsed.seriesTitle || s.series || s.title) || parsed.seriesTitle;
  const author = (s.author || '著者情報なし').replace(/／.*$/, '').trim();
  const publisher = s.publisher || '出版社不明';
  const isbn = s.isbn || isbnFallback;
  const coverUrl =
    s.cover && s.cover.startsWith('http')
      ? s.cover
      : generatePastelCover(seriesTitle, volumeNumber, author);

  return {
    isbn,
    fullTitle: `${seriesTitle} ${volumeNumber}巻`,
    seriesTitle,
    volumeNumber,
    author,
    publisher,
    coverUrl,
    salesDate: formatOpenBdDate(s.pubdate),
    isSpecialEdition: parsed.isSpecialEdition,
    source: 'openbd',
  };
}

interface RakutenBookItem {
  Item?: {
    title?: string;
    author?: string;
    publisherName?: string;
    isbn?: string;
    salesDate?: string;
    largeImageUrl?: string;
    mediumImageUrl?: string;
  };
}

function parseRakutenItem(entry: RakutenBookItem): FetchedBookInfo | null {
  const it = entry?.Item;
  if (!it || !it.title) return null;
  const parsed = parseMangaTitleAndVolume(it.title);
  const author = it.author || '著者情報なし';
  const coverUrl =
    it.largeImageUrl ||
    it.mediumImageUrl ||
    generatePastelCover(parsed.seriesTitle, parsed.volumeNumber, author);

  return {
    isbn: it.isbn || '',
    fullTitle: `${parsed.seriesTitle} ${parsed.volumeNumber}巻`,
    seriesTitle: parsed.seriesTitle,
    volumeNumber: parsed.volumeNumber,
    author,
    publisher: it.publisherName || '出版社不明',
    coverUrl,
    salesDate: formatRakutenDate(it.salesDate),
    isSpecialEdition: parsed.isSpecialEdition,
    source: 'rakuten',
  };
}

export async function fetchBookByIsbn(
  isbn: string,
  rakutenAppId?: string
): Promise<FetchedBookInfo | null> {
  // 1. openBD API (認証不要)
  try {
    const res = await fetch(`https://api.openbd.jp/v1/get?isbn=${encodeURIComponent(isbn)}`);
    if (res.ok) {
      const json = (await res.json()) as (OpenBdItem | null)[];
      if (Array.isArray(json) && json[0]) {
        const parsed = parseOpenBdEntry(json[0], isbn);
        if (parsed) return parsed;
      }
    }
  } catch {
    // ネットワークエラー時は次へフォールバック
  }

  // 2. 楽天ブックス書籍検索API (アプリIDがある場合)
  if (rakutenAppId && rakutenAppId.trim()) {
    try {
      const url = `https://app.rakuten.co.jp/services/api/BooksBook/Search/20170404?applicationId=${encodeURIComponent(
        rakutenAppId.trim()
      )}&isbn=${encodeURIComponent(isbn)}&format=json`;
      const res = await fetch(url);
      if (res.ok) {
        const json = (await res.json()) as { Items?: RakutenBookItem[] };
        const first = json.Items?.[0];
        if (first) {
          const parsed = parseRakutenItem(first);
          if (parsed) return parsed;
        }
      }
    } catch {
      // フォールバック
    }
  }

  return null;
}

function buildSyntheticIsbn(seedStr: string, volume: number): string {
  let hash = 0;
  for (let i = 0; i < seedStr.length; i += 1) {
    hash = (hash * 31 + seedStr.charCodeAt(i)) % 900000;
  }
  const block = String(100000 + hash).slice(0, 6);
  const volPart = String(volume).padStart(3, '0').slice(-3);
  return `9784${block}${volPart}`;
}

interface RawVolumeContribution {
  seriesTitle: string;
  author: string;
  publisher: string;
  volumeNumber: number;
  isbn: string;
  coverUrl: string;
  salesDate: string;
  source: 'ndl' | 'itunes' | 'rakuten' | 'openbd';
  hasRealCover: boolean;
  hasRealIsbn: boolean;
}

interface ItunesEbookItem {
  trackName?: string;
  artistName?: string;
  releaseDate?: string;
  artworkUrl100?: string;
}

async function fetchItunesContributions(
  keyword: string
): Promise<RawVolumeContribution[]> {
  const q = keyword.trim();
  if (!q) return [];
  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(
      q
    )}&country=jp&media=ebook&limit=200`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = (await res.json()) as { results?: ItunesEbookItem[] };
    const list: RawVolumeContribution[] = [];

    for (const item of json.results || []) {
      const rawTitle = (item.trackName || '').trim();
      if (!rawTitle || isNoiseBookItem(rawTitle)) continue;
      const parsed = parseMangaTitleAndVolume(rawTitle);
      if (!parsed.seriesTitle || parsed.volumeNumber < 1 || parsed.volumeNumber > 200) {
        continue;
      }
      const coverUrl = item.artworkUrl100
        ? item.artworkUrl100.replace(/\/\d+x\d+bb\./, '/400x400bb.')
        : '';
      list.push({
        seriesTitle: parsed.seriesTitle,
        author: (item.artistName || '著者情報なし').trim(),
        publisher: '電子書籍 / 単行本',
        volumeNumber: parsed.volumeNumber,
        isbn: '',
        coverUrl,
        salesDate: item.releaseDate ? item.releaseDate.slice(0, 10) : '',
        source: 'itunes',
        hasRealCover: Boolean(coverUrl),
        hasRealIsbn: false,
      });
    }
    return list;
  } catch {
    return [];
  }
}

async function fetchRakutenContributions(
  keyword: string,
  rakutenAppId: string,
  byAuthor = false
): Promise<RawVolumeContribution[]> {
  if (!rakutenAppId.trim() || !keyword.trim()) return [];
  const paramKey = byAuthor ? 'author' : 'title';
  const baseUrl = `https://app.rakuten.co.jp/services/api/BooksBook/Search/20170404?applicationId=${encodeURIComponent(
    rakutenAppId.trim()
  )}&${paramKey}=${encodeURIComponent(
    keyword.trim()
  )}&booksGenreId=001001&hits=30&format=json`;

  try {
    // 1巻側(+salesDate)と最新刊側(-salesDate)の両方を並列取得
    const [ascRes, descRes] = await Promise.all([
      fetch(`${baseUrl}&sort=%2BsalesDate`),
      fetch(`${baseUrl}&sort=-salesDate`),
    ]);
    const items: RakutenBookItem[] = [];
    if (ascRes.ok) {
      const j = (await ascRes.json()) as { Items?: RakutenBookItem[] };
      if (j.Items) items.push(...j.Items);
    }
    if (descRes.ok) {
      const j = (await descRes.json()) as { Items?: RakutenBookItem[] };
      if (j.Items) items.push(...j.Items);
    }

    const list: RawVolumeContribution[] = [];
    items.forEach((entry) => {
      const rawTitle = entry.Item?.title || '';
      if (!rawTitle || isNoiseBookItem(rawTitle)) return;
      const parsed = parseRakutenItem(entry);
      if (!parsed) return;
      const hasRealCover = Boolean(
        entry.Item?.largeImageUrl || entry.Item?.mediumImageUrl
      );
      list.push({
        seriesTitle: parsed.seriesTitle,
        author: parsed.author,
        publisher: parsed.publisher,
        volumeNumber: parsed.volumeNumber,
        isbn: parsed.isbn,
        coverUrl: hasRealCover ? parsed.coverUrl : '',
        salesDate: parsed.salesDate,
        source: 'rakuten',
        hasRealCover,
        hasRealIsbn: Boolean(parsed.isbn),
      });
    });
    return list;
  } catch {
    return [];
  }
}

export async function searchSeriesByKeyword(
  keyword: string,
  rakutenAppId = '',
  byAuthor = false
): Promise<FetchedCatalogSeries[]> {
  const q = keyword.trim();
  if (!q) return [];

  const [itunesInitial, rakutenInitial] = await Promise.all([
    fetchItunesContributions(q),
    fetchRakutenContributions(q, rakutenAppId, byAuthor),
  ]);

  const allContributions = [...rakutenInitial, ...itunesInitial];
  if (allContributions.length === 0) return [];

  const grouped = new Map<
    string,
    {
      title: string;
      author: string;
      publisher: string;
      source: 'ndl' | 'itunes' | 'rakuten' | 'openbd';
      volumeMap: Map<number, OpenBdVolumeMeta & { hasRealCover: boolean; hasRealIsbn: boolean }>;
      hasNdlOrRakuten: boolean;
      maxVol: number;
    }
  >();

  for (const item of allContributions) {
    const cleanTitle = stripParallelTitle(item.seriesTitle) || item.seriesTitle;
    const key = normalizeSeriesTitle(cleanTitle);
    if (!key) continue;

    let group = grouped.get(key);
    if (!group) {
      group = {
        title: cleanTitle,
        author: item.author,
        publisher: item.publisher,
        source: item.source,
        volumeMap: new Map(),
        hasNdlOrRakuten: item.source === 'ndl' || item.source === 'rakuten',
        maxVol: item.volumeNumber,
      };
      grouped.set(key, group);
    } else {
      if (item.source === 'ndl' || item.source === 'rakuten') {
        group.hasNdlOrRakuten = true;
      }
      if (
        (group.author === '著者情報なし' || !group.author) &&
        item.author &&
        item.author !== '著者情報なし'
      ) {
        group.author = item.author;
      }
      if (
        (group.publisher === '出版社不明' ||
          group.publisher === '電子書籍 / 単行本' ||
          !group.publisher) &&
        item.publisher &&
        item.publisher !== '出版社不明' &&
        item.publisher !== '電子書籍 / 単行本'
      ) {
        group.publisher = item.publisher;
      }
      if (item.source === 'rakuten') group.source = 'rakuten';
      else if (item.source === 'ndl' && group.source === 'itunes') group.source = 'ndl';
    }

    if (item.volumeNumber > group.maxVol) {
      group.maxVol = item.volumeNumber;
    }

    const existingVol = group.volumeMap.get(item.volumeNumber);
    if (!existingVol) {
      group.volumeMap.set(item.volumeNumber, {
        volumeNumber: item.volumeNumber,
        isbn: item.isbn || buildSyntheticIsbn(key, item.volumeNumber),
        title: `${group.title} ${item.volumeNumber}巻`,
        coverUrl: item.coverUrl,
        salesDate: item.salesDate || new Date().toISOString().slice(0, 10),
        hasRealCover: item.hasRealCover,
        hasRealIsbn: item.hasRealIsbn,
      });
    } else {
      if (!existingVol.hasRealIsbn && item.hasRealIsbn && item.isbn) {
        existingVol.isbn = item.isbn;
        existingVol.hasRealIsbn = true;
      }
      if (!existingVol.hasRealCover && item.hasRealCover && item.coverUrl) {
        existingVol.coverUrl = item.coverUrl;
        existingVol.hasRealCover = true;
      }
      if (item.salesDate && (!existingVol.salesDate || item.source === 'ndl')) {
        existingVol.salesDate = item.salesDate;
      }
    }
  }

  const normQuery = normalizeSeriesTitle(q);
  const scored = Array.from(grouped.entries()).map(([key, g]) => {
    let score = Math.min(g.maxVol, 120) * 6 + Math.min(g.volumeMap.size, 120) * 3;
    if (key === normQuery) score += 1000;
    else if (key.startsWith(normQuery) || normQuery.startsWith(key)) score += 450;
    else if (key.includes(normQuery) || normQuery.includes(key)) score += 200;
    if (g.hasNdlOrRakuten) score += 120;
    if (byAuthor && normalizeSeriesTitle(g.author).includes(normQuery)) score += 500;
    score -= g.title.length * 0.4;
    return { key, g, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const topGroups = scored.slice(0, 12);

  // 最上位候補のNDL実ISBNについて、openBDから書影がある巻を一括補完（最大40件ずつ）
  const primary = topGroups[0];
  if (primary) {
    const realIsbns = Array.from(primary.g.volumeMap.values())
      .filter((v) => v.hasRealIsbn && !v.hasRealCover)
      .map((v) => v.isbn)
      .slice(0, 40);
    if (realIsbns.length > 0) {
      try {
        const obRes = await fetch(
          `https://api.openbd.jp/v1/get?isbn=${realIsbns.join(',')}`
        );
        if (obRes.ok) {
          const obJson = (await obRes.json()) as (OpenBdItem | null)[];
          obJson.forEach((obItem, idx) => {
            if (!obItem?.summary?.cover || !obItem.summary.cover.startsWith('http')) {
              return;
            }
            const targetIsbn = obItem.summary.isbn || realIsbns[idx];
            for (const vol of primary.g.volumeMap.values()) {
              if (vol.isbn === targetIsbn && !vol.hasRealCover) {
                vol.coverUrl = obItem.summary.cover;
                vol.hasRealCover = true;
              }
            }
          });
        }
      } catch {
        // openBD補完失敗時はiTunes書影・パステル表紙を維持
      }
    }
  }

  const palette = ['#FF8FA3', '#7AD9C5', '#F6C453', '#A68CF2', '#FFA97A'];
  return topGroups.map(({ key, g }, idx) => {
    const accent = palette[idx % palette.length];
    const total = Math.max(1, g.maxVol);
    const repCover =
      Array.from(g.volumeMap.values()).find((v) => v.hasRealCover)?.coverUrl || '';

    // 1巻〜最新巻(total)まで欠番なくメタデータを構築
    const fullVolumes: OpenBdVolumeMeta[] = [];
    for (let v = 1; v <= total; v += 1) {
      const existing = g.volumeMap.get(v);
      const cover =
        existing?.coverUrl ||
        repCover ||
        generatePastelCover(g.title, v, g.author, accent);
      fullVolumes.push({
        volumeNumber: v,
        isbn: existing?.isbn || buildSyntheticIsbn(key, v),
        title: `${g.title} ${v}巻`,
        coverUrl: cover,
        salesDate: existing?.salesDate || new Date().toISOString().slice(0, 10),
      });
    }

    return {
      id: `${g.source}-${key}`,
      title: g.title,
      author: g.author,
      publisher: g.publisher,
      total_published: total,
      status: 'reading',
      accent_color: accent,
      source: g.source,
      volumes: fullVolumes,
    };
  });
}

export async function fetchSeriesByOpenBdPreset(
  presetKey: string
): Promise<FetchedCatalogSeries | null> {
  const preset = OPENBD_REAL_SERIES_PRESETS.find((p) => p.key === presetKey);
  if (!preset) return null;

  // 1. NDL + iTunes + openBD マルチソースで最新刊まで全巻取得
  try {
    const liveResults = await searchSeriesByKeyword(preset.label);
    const normLabel = normalizeSeriesTitle(preset.label);
    const best =
      liveResults.find((r) => normalizeSeriesTitle(r.title) === normLabel) ||
      liveResults[0];
    if (best && best.total_published >= preset.isbns.length) {
      return {
        ...best,
        id: `openbd-${preset.key}`,
        accent_color: preset.accentColor,
      };
    }
  } catch {
    // 固定ISBNプリセットへフォールバック
  }

  // 2. 固定ISBNリストからopenBD一括取得
  const url = `https://api.openbd.jp/v1/get?isbn=${preset.isbns.join(',')}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`openBD API error: ${res.status}`);
  }
  const json = (await res.json()) as (OpenBdItem | null)[];
  const volumes: OpenBdVolumeMeta[] = [];
  let author = '著者情報なし';
  let publisher = '出版社';
  let seriesTitle = preset.label;

  json.forEach((item, idx) => {
    const fallbackIsbn = preset.isbns[idx] || '';
    if (!item) return;
    const parsed = parseOpenBdEntry(item, fallbackIsbn);
    if (!parsed) return;
    if (idx === 0) {
      seriesTitle = parsed.seriesTitle || preset.label;
      author = parsed.author;
      publisher = parsed.publisher;
    }
    volumes.push({
      volumeNumber: idx + 1,
      isbn: parsed.isbn,
      title: parsed.fullTitle,
      coverUrl: parsed.coverUrl,
      salesDate: parsed.salesDate,
    });
  });

  if (volumes.length === 0) return null;

  return {
    id: `openbd-${preset.key}`,
    title: seriesTitle,
    author,
    publisher,
    total_published: volumes.length,
    status: 'reading',
    accent_color: preset.accentColor,
    source: 'openbd',
    volumes,
  };
}

export async function searchSeriesFromRakuten(
  keyword: string,
  rakutenAppId: string,
  byAuthor = false
): Promise<FetchedCatalogSeries[]> {
  return searchSeriesByKeyword(keyword, rakutenAppId, byAuthor);
}

export interface ResolvedSeriesExtent {
  totalPublished: number;
  volumes?: OpenBdVolumeMeta[];
  canonicalSeriesId?: string;
  canonicalTitle?: string;
}

export async function resolveSeriesPublishedVolumes(options: {
  seriesTitle: string;
  isbn?: string;
  volumeNumber: number;
  rakutenAppId?: string;
}): Promise<ResolvedSeriesExtent> {
  const { seriesTitle, isbn, volumeNumber, rakutenAppId } = options;
  const normTarget = normalizeSeriesTitle(seriesTitle);

  // 1. プリセット照合（最新刊までマルチソース取得）
  const matchedPreset = OPENBD_REAL_SERIES_PRESETS.find((preset) => {
    if (isbn && preset.isbns.includes(isbn)) return true;
    const normLabel = normalizeSeriesTitle(preset.label);
    return (
      normTarget.length >= 2 &&
      (normTarget.includes(normLabel) || normLabel.includes(normTarget))
    );
  });

  if (matchedPreset) {
    try {
      const fetchedSeries = await fetchSeriesByOpenBdPreset(matchedPreset.key);
      if (fetchedSeries && fetchedSeries.volumes && fetchedSeries.volumes.length > 0) {
        return {
          totalPublished: Math.max(fetchedSeries.total_published, volumeNumber),
          volumes: fetchedSeries.volumes,
          canonicalSeriesId: fetchedSeries.id,
          canonicalTitle: fetchedSeries.title,
        };
      }
    } catch {
      return {
        totalPublished: Math.max(matchedPreset.isbns.length, volumeNumber),
        canonicalSeriesId: `openbd-${matchedPreset.key}`,
        canonicalTitle: matchedPreset.label,
      };
    }
  }

  // 2. NDLサーチ / iTunes / 楽天API（設定時）で全巻数・各巻書影をリアルタイム確認
  if (seriesTitle.trim().length >= 2) {
    try {
      const seriesList = await searchSeriesByKeyword(seriesTitle, rakutenAppId);
      const exact =
        seriesList.find((r) => normalizeSeriesTitle(r.title) === normTarget) ||
        seriesList[0];
      if (exact && exact.total_published > 0) {
        return {
          totalPublished: Math.max(exact.total_published, volumeNumber),
          volumes: exact.volumes,
          canonicalTitle: exact.title,
        };
      }
    } catch {
      // 次へフォールバック
    }
  }

  // 3. 内蔵カタログから既刊数を確認
  const matchedCatalog = CATALOG_SERIES.find((c) => {
    const normCat = normalizeSeriesTitle(c.title);
    return (
      normTarget.length >= 2 &&
      (normCat.includes(normTarget) || normTarget.includes(normCat))
    );
  });
  if (matchedCatalog) {
    return {
      totalPublished: Math.max(matchedCatalog.total_published, volumeNumber),
      canonicalSeriesId: matchedCatalog.id,
      canonicalTitle: matchedCatalog.title,
    };
  }

  return { totalPublished: volumeNumber };
}
