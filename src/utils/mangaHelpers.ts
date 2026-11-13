import { Book, Series } from '../types/manga';

export interface SeriesSummary {
  series: Series;
  seriesBooks: Book[];
  publishedBooks: Book[];
  ownedCount: number;
  totalPublished: number;
  maxOwnedVolume: number;
  missingVolumes: number[];
  isComplete: boolean;
  progressPercent: number;
  upcomingBooks: Book[];
}

export function getTodayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function computeDaysUntil(dateStr: string): number {
  const today = new Date(getTodayIso());
  const target = new Date(dateStr);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function formatCountdownLabel(dateStr: string): string {
  const diff = computeDaysUntil(dateStr);
  if (diff < 0) return '発売中';
  if (diff === 0) return '本日発売！';
  if (diff === 1) return '明日発売！';
  if (diff <= 7) return `あと${diff}日`;
  return `${Math.ceil(diff / 7)}週間後`;
}

export function getSeriesSummary(series: Series, allBooks: Book[]): SeriesSummary {
  const today = getTodayIso();
  const seriesBooks = allBooks
    .filter((b) => b.series_id === series.id)
    .sort((a, b) => a.volume_number - b.volume_number);

  const publishedBooks = seriesBooks.filter(
    (b) => b.sales_date <= today || b.volume_number <= series.total_published
  );
  const upcomingBooks = seriesBooks.filter(
    (b) => b.sales_date > today && b.volume_number > series.total_published && !b.is_owned
  );

  const ownedBooks = seriesBooks.filter((b) => b.is_owned);
  const ownedVolumesSet = new Set(ownedBooks.map((b) => b.volume_number));
  const maxOwnedVolume =
    ownedBooks.length > 0 ? Math.max(...ownedBooks.map((b) => b.volume_number)) : 0;

  // 所持している最新巻より前に未所持の巻がある場合を「抜け巻」として自動検知
  const missingVolumes: number[] = [];
  for (let v = 1; v < maxOwnedVolume; v += 1) {
    if (!ownedVolumesSet.has(v)) {
      missingVolumes.push(v);
    }
  }

  const totalPublished = Math.max(
    series.total_published,
    publishedBooks.length > 0 ? Math.max(...publishedBooks.map((b) => b.volume_number)) : 0
  );
  const ownedCount = ownedBooks.filter((b) => b.volume_number <= totalPublished).length;
  const isComplete = totalPublished > 0 && ownedCount >= totalPublished && missingVolumes.length === 0;
  const progressPercent =
    totalPublished > 0 ? Math.min(100, Math.round((ownedCount / totalPublished) * 100)) : 0;

  return {
    series,
    seriesBooks,
    publishedBooks,
    ownedCount,
    totalPublished,
    maxOwnedVolume,
    missingVolumes,
    isComplete,
    progressPercent,
    upcomingBooks,
  };
}

export function validateIsbn13(raw: string): {
  valid: boolean;
  cleaned: string;
  isSecondRowJan: boolean;
  reason?: string;
} {
  const cleaned = raw.replace(/[^0-9]/g, '');
  if (cleaned.startsWith('192')) {
    return {
      valid: false,
      cleaned,
      isSecondRowJan: true,
      reason: '日本の漫画の2段目JANコード（192始まり）のため自動で無視しました。上段の978/979コードを読み取ってください。',
    };
  }
  if (cleaned.length !== 13) {
    return {
      valid: false,
      cleaned,
      isSecondRowJan: false,
      reason: '13桁のISBNコードを入力してください（例: 978...）。',
    };
  }
  if (!cleaned.startsWith('978') && !cleaned.startsWith('979')) {
    return {
      valid: false,
      cleaned,
      isSecondRowJan: false,
      reason: '書籍ISBN（978 または 979 で始まる13桁）のみ登録できます。',
    };
  }
  return { valid: true, cleaned, isSecondRowJan: false };
}
