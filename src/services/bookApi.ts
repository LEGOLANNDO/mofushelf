import { CATALOG_SERIES } from '../data/mockData';
import { CatalogSeries, MangaMediaType, Series } from '../types/manga';
import { generatePastelCover } from '../utils/coverGenerator';

export interface ParsedMangaTitle {
  seriesTitle: string;
  volumeNumber: number;
  isSpecialEdition: boolean;
  mediaType: MangaMediaType;
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
  mediaType?: MangaMediaType;
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
    .replace(
      /[\s・:：!！?？\-―~～〜()（）【】「」『』.,、。'’"”★☆♪♡]/g,
      ''
    );
}

export function stripParallelTitle(raw: string): string {
  // 日本語タイトルと並列記載された「 = 英語タイトル」や「 ＝ English Title」を除去
  return toHalfWidth(raw)
    .replace(/\s*[=＝]\s*.*$/g, '')
    .trim();
}

const NOVEL_IMPRINT_RE =
  /(MF文庫J|電撃文庫|角川スニーカー文庫|スニーカー文庫|富士見ファンタジア文庫|ファンタジア文庫|GA文庫|HJ文庫|講談社ラノベ文庫|ガガガ文庫|オーバーラップ文庫|ダッシュエックス文庫|スーパーダッシュ文庫|GCN文庫|ファミ通文庫|カドカワBOOKS|MFブックス|ツギクルブックス|ヒーロー文庫|モーニングスターブックス|アース・スターノベル|富士見L文庫|角川文庫|新潮文庫|講談社文庫|集英社文庫|ハヤカワ文庫|角川つばさ文庫)/i;

const COMIC_EXPLICIT_RE =
  /(?:【|\(|（|\[)(?:コミック|コミックス|漫画|マンガ|comic|comics)(?:】|\)|）|\])|コミカライズ|漫画版|コミック版/i;

const NOVEL_EXPLICIT_RE =
  /(?:【|\(|（|\[|\s|^)(?:小説版?|ラノベ|ノベルズ?|ノベル|ライトノベル|novels?|light\s*novels?)(?:】|\)|）|\]|\s|$)|（小説版）|\(小説版\)/i;

export function detectMediaType(options: {
  rawTitle?: string;
  seriesTitle?: string;
  publisher?: string;
  genres?: string[];
}): MangaMediaType {
  const combinedTitle = toHalfWidth(
    `${options.rawTitle || ''} ${options.seriesTitle || ''}`
  );
  const publisher = toHalfWidth(options.publisher || '');
  const genresJoined = (options.genres || []).join(' ').toLowerCase();

  const hasExplicitComic = COMIC_EXPLICIT_RE.test(combinedTitle);
  const hasExplicitNovel = NOVEL_EXPLICIT_RE.test(combinedTitle);

  if (hasExplicitComic && !hasExplicitNovel) return 'comic';
  if (hasExplicitNovel && !hasExplicitComic) return 'novel';

  if (genresJoined) {
    const genreComic = /(マンガ|コミック|漫画|manga|comic|graphic novel)/i.test(
      genresJoined
    );
    const genreNovel =
      /(小説|ライトノベル|ノベル|文学|文芸|novel|literature|fiction)/i.test(
        genresJoined
      );
    if (genreNovel && !genreComic) return 'novel';
    if (genreComic && !genreNovel) return 'comic';
  }

  if (
    !hasExplicitComic &&
    (NOVEL_IMPRINT_RE.test(publisher) || NOVEL_IMPRINT_RE.test(combinedTitle))
  ) {
    return 'novel';
  }

  return 'comic';
}

export function formatSeriesTitleWithMedia(
  seriesTitle: string,
  mediaType: MangaMediaType
): string {
  const clean = seriesTitle.trim();
  if (mediaType === 'novel' && !/小説|ラノベ|ノベル/i.test(clean)) {
    return `${clean} (小説版)`;
  }
  return clean;
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
  return /(総集編|公式ファンブック|ファンブック|キャラクターブック|公式ガイド|ガイドブック|副読本|画集|イラスト集|図録|原画集|アンソロジー|アニメコミックス|フィルムコミック|カレンダー|ステッカー|シール|分冊版|単話版?|合本版|全巻セット|セット買い|ベスト10|spoon\.2di|\bmagazine\b|週刊少年|月刊少年|ジャンプgiga|徹底解説|読み解く|検定|大研究|劇場版)/i.test(
    combined
  );
}

const CIRCLED_NUM_OFFSET = 0x2460; // ①..⑳
const ROMAN_MAP: Record<string, number> = {
  Ⅰ: 1,
  Ⅱ: 2,
  Ⅲ: 3,
  Ⅳ: 4,
  Ⅴ: 5,
  Ⅵ: 6,
  Ⅶ: 7,
  Ⅷ: 8,
  Ⅸ: 9,
  Ⅹ: 10,
};

const KNOWN_TRAILING_NUMBER_TITLES =
  /(?:ゴルゴ13|エリア88|銀河鉄道999|鉄人28号|サイボーグ009|steins;?\s*gate\s*0|zero\s*1)$/i;

export function parseMangaTitleAndVolume(rawTitle: string): ParsedMangaTitle {
  const half = toHalfWidth(rawTitle);
  const isSpecialEdition = /(特装版|限定版|同梱版|小冊子付き|特装)/.test(half);
  const mediaType = detectMediaType({ rawTitle: half });

  const cleanedWorking = half
    .replace(
      /^(?:【(?:コミック|漫画|電子書籍|電子版|小説|ラノベ|期間限定[^】]*)】|\[\s*(?:コミック|小説)\s*\])\s*/g,
      ''
    )
    .replace(
      /\s*[【\[（(][^】\]）)]*(?:コミックス|コミック|comics|comic|漫画版?|小説版?|ラノベ|ノベル|文庫|新書|単行本|digital|デジタル|電子限定[^】\]）)]*|電子書籍|電子|期間限定[^】\]）)]*|特典付き[^】\]）)]*)[】\]）)]\s*$/gi,
      ''
    )
    .replace(
      /[【\[（(]?(特装版|限定版|同梱版|小冊子付き版?|通常版)[】\]）)]?/g,
      ''
    )
    .replace(
      /\s*(?:モノクロ版|カラー版|デジタル版|合本版|愛蔵版|新装版|完全版)\s*/g,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim();

  const extractVolAndTitle = (
    input: string,
    allowGluedDigits: boolean
  ): { title: string; volume: number | null } => {
    // 末尾の丸数字 ①..⑳
    let m = input.match(/^(.*?)\s*([\u2460-\u2473])$/);
    if (m && m[1].trim()) {
      const vol = m[2].charCodeAt(0) - CIRCLED_NUM_OFFSET + 1;
      return { title: m[1].trim(), volume: vol };
    }

    // 末尾のローマ数字 Ⅰ..Ⅹ
    m = input.match(/^(.*?)\s*([ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ])$/);
    if (m && m[1].trim() && ROMAN_MAP[m[2]]) {
      return { title: m[1].trim(), volume: ROMAN_MAP[m[2]] };
    }

    // 末尾の (15) や （15） や [15]
    m = input.match(/^(.*?)\s*[(\[（【]\s*(\d{1,3})\s*[)\]）】]$/);
    if (m && m[1].trim() && Number(m[2]) >= 1 && Number(m[2]) <= 200) {
      return { title: m[1].trim(), volume: Number(m[2]) };
    }

    // 末尾の 第15巻 / 15巻 / VOL.15 / No.15 / #15 / 巻15
    m = input.match(
      /^(.*?)\s*(?:第\s*(\d{1,3})\s*巻|(\d{1,3})\s*巻|巻\s*(\d{1,3})|(?:vol\.?|no\.?|#)\s*(\d{1,3}))$/i
    );
    if (m && m[1].trim()) {
      const vol = Number(m[2] || m[3] || m[4] || m[5]);
      if (vol >= 1 && vol <= 200) {
        return { title: m[1].trim(), volume: vol };
      }
    }

    // 巻数の後ろにサブタイトルが続くケース (例: "作品名 15 副題")
    m = input.match(
      /^(.*?)\s+(?:第\s*)?(\d{1,3})(?:\s*巻)?(?:\s*[:：\-―～~]\s*|\s+)[^\d\s].*$/
    );
    if (m && m[1].trim() && Number(m[2]) >= 1 && Number(m[2]) <= 200) {
      return { title: m[1].trim(), volume: Number(m[2]) };
    }

    // 末尾数字 (例: "SPY×FAMILY 18", "ダンダダン 25")
    m = input.match(/^(.*?)\s+(\d{1,3})$/);
    if (m && m[1].trim() && Number(m[2]) >= 1 && Number(m[2]) <= 200) {
      return { title: m[1].trim(), volume: Number(m[2]) };
    }

    // スペース無し末尾数字 (例: "〇〇1", "〇〇2", "呪術廻戦12")
    if (allowGluedDigits && !KNOWN_TRAILING_NUMBER_TITLES.test(input)) {
      m = input.match(/^(.*[^\d.\-/:：+号×xX\s])([1-9]\d{0,2})$/);
      if (m && m[1].trim().length >= 2) {
        const vol = Number(m[2]);
        if (vol >= 1 && vol <= 150) {
          return { title: m[1].trim(), volume: vol };
        }
      }
    }

    return { title: input.trim(), volume: null };
  };

  const firstPass = extractVolAndTitle(cleanedWorking, true);
  const jpOnly = stripParallelTitle(firstPass.title);
  const secondPass =
    firstPass.volume !== null
      ? { title: jpOnly, volume: firstPass.volume }
      : extractVolAndTitle(jpOnly, true);

  return {
    seriesTitle: stripParallelTitle(secondPass.title) || jpOnly || half,
    volumeNumber: secondPass.volume ?? firstPass.volume ?? 1,
    isSpecialEdition,
    mediaType,
  };
}

function stripMediaTagForCompare(title: string): string {
  return toHalfWidth(title)
    .replace(
      /\s*[（(【\[]?(?:小説版|漫画版|コミック版|ラノベ版|小説|コミック|漫画)[）)】\]]?\s*$/gi,
      ''
    )
    .trim();
}

export function getSeriesIdentityKey(title: string): string {
  const withoutTag = stripMediaTagForCompare(title);
  const parsed = parseMangaTitleAndVolume(withoutTag);
  const clean = stripParallelTitle(parsed.seriesTitle || withoutTag);
  return normalizeSeriesTitle(clean);
}

function stripTrailingNumericTokens(norm: string): string {
  if (KNOWN_TRAILING_NUMBER_TITLES.test(norm)) return norm;
  const m = norm.match(/^(.*?)([1-9]\d{0,2})$/);
  if (m && m[1].length >= 2) return m[1];
  return norm;
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const curr = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost
      );
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j];
  }
  return prev[b.length];
}

const DISTINCT_WORK_MARKER_RE =
  /(外伝|スピンオフ|アンソロジー|ファンブック|ガイド|after|before|episode|season|2期|3期|part2)/i;

export function areSeriesSameWork(
  a: { title: string; mediaType?: MangaMediaType; publisher?: string },
  b: { title: string; mediaType?: MangaMediaType; publisher?: string }
): boolean {
  const mediaA =
    a.mediaType || detectMediaType({ rawTitle: a.title, publisher: a.publisher });
  const mediaB =
    b.mediaType || detectMediaType({ rawTitle: b.title, publisher: b.publisher });
  if (mediaA !== mediaB) return false;

  const keyA = getSeriesIdentityKey(a.title);
  const keyB = getSeriesIdentityKey(b.title);
  if (!keyA || !keyB) return false;
  if (keyA === keyB) return true;

  if (DISTINCT_WORK_MARKER_RE.test(keyA) !== DISTINCT_WORK_MARKER_RE.test(keyB)) {
    return false;
  }

  const baseA = stripTrailingNumericTokens(keyA);
  const baseB = stripTrailingNumericTokens(keyB);
  if (baseA === baseB && baseA.length >= 2) return true;

  const noDigitsA = keyA.replace(/\d+/g, '');
  const noDigitsB = keyB.replace(/\d+/g, '');
  if (
    noDigitsA === noDigitsB &&
    noDigitsA.length >= 3 &&
    /\d/.test(keyA) &&
    /\d/.test(keyB)
  ) {
    return true;
  }

  const minLen = Math.min(keyA.length, keyB.length);
  const maxLen = Math.max(keyA.length, keyB.length);
  if (minLen >= 4 && Math.abs(keyA.length - keyB.length) <= 2) {
    const dist = levenshteinDistance(keyA, keyB);
    if (minLen >= 6 && dist <= 1) return true;
    if (maxLen >= 10 && dist / maxLen <= 0.16) return true;
  }

  const minBase = Math.min(baseA.length, baseB.length);
  if (minBase >= 6 && Math.abs(baseA.length - baseB.length) <= 1) {
    if (levenshteinDistance(baseA, baseB) <= 1) return true;
  }

  return false;
}

export function findMatchingExistingSeries(
  seriesList: Series[],
  candidate: {
    id?: string;
    title: string;
    mediaType?: MangaMediaType;
    publisher?: string;
  }
): Series | undefined {
  const candidateMedia =
    candidate.mediaType ||
    detectMediaType({
      rawTitle: candidate.title,
      publisher: candidate.publisher,
    });

  if (candidate.id) {
    const byId = seriesList.find((s) => s.id === candidate.id);
    if (byId) {
      const existingMedia =
        byId.media_type ||
        detectMediaType({ rawTitle: byId.title, publisher: byId.publisher });
      if (existingMedia === candidateMedia) return byId;
    }
  }

  const candidateKey = getSeriesIdentityKey(candidate.title);
  const exact = seriesList.find((s) => {
    const existingMedia =
      s.media_type ||
      detectMediaType({ rawTitle: s.title, publisher: s.publisher });
    return existingMedia === candidateMedia && getSeriesIdentityKey(s.title) === candidateKey;
  });
  if (exact) return exact;

  return seriesList.find((s) =>
    areSeriesSameWork(
      {
        title: s.title,
        mediaType:
          s.media_type ||
          detectMediaType({ rawTitle: s.title, publisher: s.publisher }),
        publisher: s.publisher,
      },
      {
        title: candidate.title,
        mediaType: candidateMedia,
        publisher: candidate.publisher,
      }
    )
  );
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
  const rawSeries =
    stripParallelTitle(parsed.seriesTitle || s.series || s.title) || parsed.seriesTitle;
  const author = (s.author || '著者情報なし').replace(/／.*$/, '').trim();
  const publisher = s.publisher || '出版社不明';
  const mediaType = detectMediaType({
    rawTitle: s.title,
    seriesTitle: rawSeries,
    publisher,
  });
  const seriesTitle = formatSeriesTitleWithMedia(rawSeries, mediaType);
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
    mediaType,
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
  const publisher = it.publisherName || '出版社不明';
  const mediaType = detectMediaType({
    rawTitle: it.title,
    seriesTitle: parsed.seriesTitle,
    publisher,
  });
  const seriesTitle = formatSeriesTitleWithMedia(parsed.seriesTitle, mediaType);
  const author = it.author || '著者情報なし';
  const coverUrl =
    it.largeImageUrl ||
    it.mediumImageUrl ||
    generatePastelCover(seriesTitle, parsed.volumeNumber, author);

  return {
    isbn: it.isbn || '',
    fullTitle: `${seriesTitle} ${parsed.volumeNumber}巻`,
    seriesTitle,
    volumeNumber: parsed.volumeNumber,
    author,
    publisher,
    coverUrl,
    salesDate: formatRakutenDate(it.salesDate),
    isSpecialEdition: parsed.isSpecialEdition,
    mediaType,
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
  mediaType: MangaMediaType;
  hasRealCover: boolean;
  hasRealIsbn: boolean;
}

interface ItunesEbookItem {
  trackName?: string;
  artistName?: string;
  releaseDate?: string;
  artworkUrl100?: string;
  genres?: string[];
  description?: string;
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
      const mediaType = detectMediaType({
        rawTitle,
        seriesTitle: parsed.seriesTitle,
        publisher: '',
        genres: item.genres,
      });
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
        mediaType,
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
        mediaType: parsed.mediaType || 'comic',
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
      baseKey: string;
      mediaType: MangaMediaType;
      author: string;
      publisher: string;
      source: 'ndl' | 'itunes' | 'rakuten' | 'openbd';
      volumeMap: Map<number, OpenBdVolumeMeta & { hasRealCover: boolean; hasRealIsbn: boolean }>;
      hasNdlOrRakuten: boolean;
      maxVol: number;
    }
  >();

  for (const item of allContributions) {
    const rawClean = stripParallelTitle(item.seriesTitle) || item.seriesTitle;
    const cleanTitle = stripMediaTagForCompare(rawClean) || rawClean;
    const baseKey = getSeriesIdentityKey(cleanTitle);
    if (!baseKey) continue;

    const exactGroupKey = `${item.mediaType}:${baseKey}`;
    let matchedKey = grouped.has(exactGroupKey) ? exactGroupKey : '';
    let group = matchedKey ? grouped.get(matchedKey) : undefined;

    if (!group) {
      for (const [existingKey, existingGroup] of grouped.entries()) {
        if (
          areSeriesSameWork(
            { title: cleanTitle, mediaType: item.mediaType, publisher: item.publisher },
            {
              title: existingGroup.title,
              mediaType: existingGroup.mediaType,
              publisher: existingGroup.publisher,
            }
          )
        ) {
          matchedKey = existingKey;
          group = existingGroup;
          break;
        }
      }
    }

    if (!group) {
      matchedKey = exactGroupKey;
      group = {
        title: cleanTitle,
        baseKey,
        mediaType: item.mediaType,
        author: item.author,
        publisher: item.publisher,
        source: item.source,
        volumeMap: new Map(),
        hasNdlOrRakuten: item.source === 'ndl' || item.source === 'rakuten',
        maxVol: item.volumeNumber,
      };
      grouped.set(matchedKey, group);
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

    const displayTitle = formatSeriesTitleWithMedia(group.title, group.mediaType);
    const existingVol = group.volumeMap.get(item.volumeNumber);
    if (!existingVol) {
      group.volumeMap.set(item.volumeNumber, {
        volumeNumber: item.volumeNumber,
        isbn: item.isbn || buildSyntheticIsbn(matchedKey, item.volumeNumber),
        title: `${displayTitle} ${item.volumeNumber}巻`,
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

  const queryWantsNovel = /小説|ラノベ|ノベル/i.test(q);
  const normQuery = getSeriesIdentityKey(q) || normalizeSeriesTitle(q);
  const scored = Array.from(grouped.entries()).map(([key, g]) => {
    const k = g.baseKey;
    let score = Math.min(g.maxVol, 120) * 6 + Math.min(g.volumeMap.size, 120) * 3;
    if (k === normQuery) score += 1000;
    else if (k.startsWith(normQuery) || normQuery.startsWith(k)) score += 450;
    else if (k.includes(normQuery) || normQuery.includes(k)) score += 200;
    if (g.hasNdlOrRakuten) score += 120;
    if (queryWantsNovel && g.mediaType === 'novel') score += 200;
    else if (!queryWantsNovel && g.mediaType === 'comic') score += 40;
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
    const displayTitle = formatSeriesTitleWithMedia(g.title, g.mediaType);
    const repCover =
      Array.from(g.volumeMap.values()).find((v) => v.hasRealCover)?.coverUrl || '';

    // 1巻〜最新巻(total)まで欠番なくメタデータを構築
    const fullVolumes: OpenBdVolumeMeta[] = [];
    for (let v = 1; v <= total; v += 1) {
      const existing = g.volumeMap.get(v);
      const cover =
        existing?.coverUrl ||
        repCover ||
        generatePastelCover(displayTitle, v, g.author, accent);
      fullVolumes.push({
        volumeNumber: v,
        isbn: existing?.isbn || buildSyntheticIsbn(key, v),
        title: `${displayTitle} ${v}巻`,
        coverUrl: cover,
        salesDate: existing?.salesDate || new Date().toISOString().slice(0, 10),
      });
    }

    return {
      id: `${g.source}-${g.mediaType}-${g.baseKey}`,
      title: displayTitle,
      author: g.author,
      publisher: g.publisher,
      total_published: total,
      status: 'reading',
      media_type: g.mediaType,
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
  mediaType?: MangaMediaType;
}

export async function resolveSeriesPublishedVolumes(options: {
  seriesTitle: string;
  isbn?: string;
  volumeNumber: number;
  rakutenAppId?: string;
  mediaType?: MangaMediaType;
}): Promise<ResolvedSeriesExtent> {
  const { seriesTitle, isbn, volumeNumber, rakutenAppId, mediaType } = options;
  const targetMedia = mediaType || detectMediaType({ rawTitle: seriesTitle });
  const normTarget = getSeriesIdentityKey(seriesTitle);

  // 1. プリセット照合（最新刊までマルチソース取得）
  const matchedPreset = OPENBD_REAL_SERIES_PRESETS.find((preset) => {
    if (targetMedia === 'novel') return false;
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
          mediaType: 'comic',
        };
      }
    } catch {
      return {
        totalPublished: Math.max(matchedPreset.isbns.length, volumeNumber),
        canonicalSeriesId: `openbd-${matchedPreset.key}`,
        canonicalTitle: matchedPreset.label,
        mediaType: 'comic',
      };
    }
  }

  // 2. NDLサーチ / iTunes / 楽天API（設定時）で全巻数・各巻書影をリアルタイム確認
  if (seriesTitle.trim().length >= 2) {
    try {
      const searchTerm =
        targetMedia === 'novel' && !/小説|ラノベ|ノベル/i.test(seriesTitle)
          ? `${stripMediaTagForCompare(seriesTitle)} 小説`
          : stripMediaTagForCompare(seriesTitle);
      const seriesList = await searchSeriesByKeyword(searchTerm, rakutenAppId);
      const exact =
        seriesList.find((r) =>
          areSeriesSameWork(
            {
              title: r.title,
              mediaType: r.media_type || 'comic',
              publisher: r.publisher,
            },
            { title: seriesTitle, mediaType: targetMedia }
          )
        ) ||
        seriesList.find((r) => (r.media_type || 'comic') === targetMedia) ||
        seriesList[0];
      if (exact && exact.total_published > 0) {
        return {
          totalPublished: Math.max(exact.total_published, volumeNumber),
          volumes: exact.volumes,
          canonicalTitle: exact.title,
          mediaType: exact.media_type || targetMedia,
        };
      }
    } catch {
      // 次へフォールバック
    }
  }

  // 3. 内蔵カタログから既刊数を確認
  const matchedCatalog = CATALOG_SERIES.find((c) => {
    if ((c.media_type || 'comic') !== targetMedia) return false;
    const normCat = getSeriesIdentityKey(c.title);
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
      mediaType: matchedCatalog.media_type || 'comic',
    };
  }

  return { totalPublished: volumeNumber, mediaType: targetMedia };
}
