import { Book, CatalogSeries, Series } from '../types/manga';

export function buildIsbn(seriesSeed: number, vol: number): string {
  const mid = String(seriesSeed).padStart(4, '0');
  const volPart = String(vol).padStart(4, '0');
  return `97840888${mid.slice(0, 1)}${volPart}`;
}

export const INITIAL_SERIES: Series[] = [];

export const INITIAL_BOOKS: Book[] = [];

export const CATALOG_SERIES: CatalogSeries[] = [
  {
    id: 'openbd-frieren',
    title: '葬送のフリーレン',
    author: '山田鐘人 / アベツカサ',
    publisher: '小学館',
    total_published: 15,
    status: 'reading',
    accent_color: '#7AD9C5',
  },
  {
    id: 'openbd-spyxfamily',
    title: 'SPY×FAMILY',
    author: '遠藤達哉',
    publisher: '集英社',
    total_published: 16,
    status: 'reading',
    accent_color: '#FF8FA3',
  },
  {
    id: 'openbd-chainsaw',
    title: 'チェンソーマン',
    author: '藤本タツキ',
    publisher: '集英社',
    total_published: 24,
    status: 'reading',
    accent_color: '#FFA97A',
  },
  {
    id: 'catalog-kusuriya',
    title: '薬屋のひとりごと',
    author: '日向夏 / ねこクラゲ',
    publisher: 'スクウェア・エニックス',
    total_published: 16,
    status: 'reading',
    accent_color: '#A68CF2',
  },
  {
    id: 'catalog-dandadan',
    title: 'ダンダダン',
    author: '龍幸伸',
    publisher: '集英社',
    total_published: 26,
    status: 'reading',
    accent_color: '#F6C453',
  },
  {
    id: 'catalog-kaiju8',
    title: '怪獣8号',
    author: '松本直也',
    publisher: '集英社',
    total_published: 16,
    status: 'completed',
    accent_color: '#7DB8F5',
  },
];

export const AI_COVER_PRESETS = [
  {
    id: 'preset-frieren-2',
    label: '『葬送のフリーレン』2巻 (openBD実データ連携)',
    extracted: {
      title: '葬送のフリーレン',
      volume: 2,
      author: '山田鐘人',
    },
    seriesId: 'openbd-frieren',
    isbn: '9784098501816',
    publisher: '小学館',
    accentColor: '#7AD9C5',
  },
  {
    id: 'preset-spy-1',
    label: '『SPY×FAMILY』1巻 (openBD実データ連携)',
    extracted: {
      title: 'SPY×FAMILY',
      volume: 1,
      author: '遠藤達哉',
    },
    seriesId: 'openbd-spyxfamily',
    isbn: '9784088820118',
    publisher: '集英社',
    accentColor: '#FF8FA3',
  },
  {
    id: 'preset-chainsaw-1',
    label: '『チェンソーマン』1巻 (openBD実データ連携)',
    extracted: {
      title: 'チェンソーマン',
      volume: 1,
      author: '藤本タツキ',
    },
    seriesId: 'openbd-chainsaw',
    isbn: '9784088817804',
    publisher: '集英社',
    accentColor: '#FFA97A',
  },
  {
    id: 'preset-fallback',
    label: 'タイトル略称（著者名フォールバック例）',
    extracted: {
      title: '薬屋のひと',
      volume: 1,
      author: 'ねこクラゲ',
    },
    seriesId: 'catalog-kusuriya',
    isbn: buildIsbn(4, 1),
    publisher: 'スクウェア・エニックス',
    accentColor: '#A68CF2',
  },
];
