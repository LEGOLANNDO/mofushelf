import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpDown,
  Bell,
  BellOff,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronLeft,
  Columns2,
  Columns3,
  Minus,
  PauseCircle,
  Pin,
  Plus,
  Search,
  Sparkles,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { BOOK_TAGS, Book, BookTag, Series, SeriesStatus } from '../types/manga';
import { generatePastelCover } from '../utils/coverGenerator';
import { getSeriesSummary } from '../utils/mangaHelpers';

type BookshelfFilter = 'all' | 'missing' | 'reading' | 'completed';
type BookshelfSortBy =
  | 'default'
  | 'complete_rate'
  | 'missing_count'
  | 'total_desc'
  | 'title_asc';

interface SortPreferences {
  sortBy: BookshelfSortBy;
  pinFirst: boolean;
  completeFirst: boolean;
  completedStatusLast: boolean;
}

const SORT_PREFS_STORAGE_KEY = 'mofushelf_sort_prefs_v1';
const DEFAULT_SORT_PREFS: SortPreferences = {
  sortBy: 'default',
  pinFirst: true,
  completeFirst: false,
  completedStatusLast: false,
};

function loadSortPrefs(): SortPreferences {
  try {
    const raw = localStorage.getItem(SORT_PREFS_STORAGE_KEY);
    if (!raw) return DEFAULT_SORT_PREFS;
    const parsed = JSON.parse(raw) as Partial<SortPreferences>;
    return {
      sortBy: parsed.sortBy || 'default',
      pinFirst: parsed.pinFirst !== undefined ? parsed.pinFirst : true,
      completeFirst: Boolean(parsed.completeFirst),
      completedStatusLast: Boolean(parsed.completedStatusLast),
    };
  } catch {
    return DEFAULT_SORT_PREFS;
  }
}

interface BookshelfViewProps {
  seriesList: Series[];
  books: Book[];
  isCompactPreview: boolean;
  onToggleBookOwned: (bookId: string) => void;
  onBulkOwnedUpTo: (
    seriesId: string,
    upToVolume: number,
    fromVolume?: number
  ) => void;
  onUpdateSeriesStatus: (seriesId: string, status: SeriesStatus) => void;
  onToggleSeriesNotify: (seriesId: string) => void;
  onToggleSeriesPin: (seriesId: string) => void;
  onUpdateBookMeta: (bookId: string, tags: BookTag[], memo: string) => void;
  onDeleteSeries: (seriesId: string) => void;
  onNavigateToScan: (initialTab?: 'barcode' | 'ai_cover' | 'bulk_search') => void;
}

export const BookshelfView: React.FC<BookshelfViewProps> = ({
  seriesList,
  books,
  isCompactPreview,
  onToggleBookOwned,
  onBulkOwnedUpTo,
  onUpdateSeriesStatus,
  onToggleSeriesNotify,
  onToggleSeriesPin,
  onUpdateBookMeta,
  onDeleteSeries,
  onNavigateToScan,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<BookshelfFilter>('all');
  const [sortPrefs, setSortPrefs] = useState<SortPreferences>(loadSortPrefs);
  const [mobileCols, setMobileCols] = useState<2 | 3>(2);
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);
  const [editingBookId, setEditingBookId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [bulkFromVal, setBulkFromVal] = useState<number>(1);
  const [bulkSliderVal, setBulkSliderVal] = useState<number>(1);
  const [bouncedBookId, setBouncedBookId] = useState<string | null>(null);

  const updateSortPrefs = (patch: Partial<SortPreferences>) => {
    setSortPrefs((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(SORT_PREFS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  const summaries = useMemo(
    () => seriesList.map((s) => getSeriesSummary(s, books)),
    [seriesList, books]
  );

  const totalOwnedCount = useMemo(
    () => books.filter((b) => b.is_owned).length,
    [books]
  );

  const missingSeriesCount = useMemo(
    () => summaries.filter((s) => s.missingVolumes.length > 0).length,
    [summaries]
  );

  const filteredSummaries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = summaries.filter((item) => {
      if (q) {
        const hitTitle = item.series.title.toLowerCase().includes(q);
        const hitAuthor = item.series.author.toLowerCase().includes(q);
        if (!hitTitle && !hitAuthor) return false;
      }
      if (filter === 'missing') return item.missingVolumes.length > 0;
      if (filter === 'reading') return item.series.status === 'reading';
      if (filter === 'completed') return item.series.status === 'completed';
      return true;
    });

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (sortPrefs.pinFirst) {
        const pinA = Boolean(a.series.is_pinned);
        const pinB = Boolean(b.series.is_pinned);
        if (pinA !== pinB) return pinA ? -1 : 1;
      }
      if (sortPrefs.completedStatusLast) {
        const compA = a.series.status === 'completed';
        const compB = b.series.status === 'completed';
        if (compA !== compB) return compA ? 1 : -1;
      }
      if (sortPrefs.completeFirst) {
        if (a.isComplete !== b.isComplete) return a.isComplete ? -1 : 1;
      }
      switch (sortPrefs.sortBy) {
        case 'complete_rate':
          return (
            b.progressPercent - a.progressPercent ||
            b.ownedCount - a.ownedCount
          );
        case 'missing_count':
          return b.missingVolumes.length - a.missingVolumes.length;
        case 'total_desc':
          return (
            b.ownedCount - a.ownedCount ||
            b.totalPublished - a.totalPublished
          );
        case 'title_asc':
          return a.series.title.localeCompare(b.series.title, 'ja');
        case 'default':
        default:
          return 0;
      }
    });
    return sorted;
  }, [summaries, searchQuery, filter, sortPrefs]);

  const selectedSummary = useMemo(
    () => summaries.find((s) => s.series.id === selectedSeriesId) ?? null,
    [summaries, selectedSeriesId]
  );

  const editingBook = useMemo(
    () => books.find((b) => b.id === editingBookId) ?? null,
    [books, editingBookId]
  );

  const openSeriesDetail = (seriesId: string) => {
    const summary = summaries.find((s) => s.series.id === seriesId);
    setSelectedSeriesId(seriesId);
    setBulkFromVal(1);
    setBulkSliderVal(
      summary
        ? Math.max(1, summary.maxOwnedVolume || Math.min(3, summary.totalPublished))
        : 1
    );
  };

  const handleBookTap = (book: Book) => {
    onToggleBookOwned(book.id);
    setBouncedBookId(book.id);
    window.setTimeout(() => setBouncedBookId(null), 400);
  };

  const gridClass = isCompactPreview
    ? mobileCols === 2
      ? 'grid-cols-2 gap-2.5'
      : 'grid-cols-3 gap-2'
    : mobileCols === 2
      ? 'grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'
      : 'grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6';

  return (
    <>
    <div className="space-y-3">
      {/* サマリーカード */}
      <div className="rounded-3xl bg-mofu-sub p-3.5 shadow-mofu border border-mofu-pink/15">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-mofu-muted">わたしの本棚</p>
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className="text-xl font-extrabold text-mofu-text">
                {seriesList.length}作品
              </span>
              <span className="text-xs font-bold text-mofu-pink-dark">
                合計 {totalOwnedCount}冊 所持
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigateToScan('bulk_search')}
            className="tap-target shrink-0 inline-flex items-center gap-1 rounded-2xl bg-mofu-pink px-3 py-2 text-xs font-extrabold text-white shadow-sm active:scale-95 transition"
          >
            <Plus className="h-4 w-4" />
            <span>一括登録</span>
          </button>
        </div>

        {missingSeriesCount > 0 && (
          <button
            type="button"
            onClick={() => setFilter('missing')}
            className="mt-2.5 w-full flex items-center justify-between gap-2 rounded-2xl bg-mofu-yellow/65 px-3 py-2 text-left text-xs font-bold text-mofu-text hover:bg-mofu-yellow/80 transition"
          >
            <span className="flex items-center gap-1.5 min-w-0">
              <AlertTriangle className="h-4 w-4 shrink-0 text-mofu-yellow-dark" />
              <span className="truncate">
                抜け巻（買い忘れ）がある作品が {missingSeriesCount}件 あります
              </span>
            </span>
            <span className="shrink-0 text-[11px] underline">確認</span>
          </button>
        )}
      </div>

      {/* 検索バー & 列数切替 */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mofu-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="作品名・著者名で検索..."
            className="h-11 w-full min-w-0 rounded-2xl border border-mofu-pink/25 bg-white pl-9 pr-9 text-sm text-mofu-text placeholder:text-mofu-muted/70 focus:border-mofu-pink focus:outline-none"
          />
          {searchQuery.length > 0 && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="検索をクリア"
              className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-mofu-sub text-mofu-muted hover:bg-mofu-pink/15 hover:text-mofu-text transition"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setMobileCols((prev) => (prev === 2 ? 3 : 2))}
          aria-label="グリッド列数を切り替え"
          className="tap-target shrink-0 inline-flex items-center justify-center gap-1 rounded-2xl border border-mofu-pink/25 bg-white px-2.5 text-xs font-bold text-mofu-text active:scale-95 transition"
          title={`スマホ表示: ${mobileCols}列`}
        >
          {mobileCols === 2 ? (
            <Columns2 className="h-4 w-4 text-mofu-pink-dark" />
          ) : (
            <Columns3 className="h-4 w-4 text-mofu-pink-dark" />
          )}
          <span>{mobileCols}列</span>
        </button>
      </div>

      {/* フィルタピル */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
        {(
          [
            { key: 'all', label: 'すべて' },
            { key: 'missing', label: `抜け巻あり (${missingSeriesCount})` },
            { key: 'reading', label: '購読中' },
            { key: 'completed', label: '完結' },
          ] as { key: BookshelfFilter; label: string }[]
        ).map((tab) => {
          const active = filter === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilter(tab.key)}
              className={`min-h-[38px] shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                active
                  ? 'bg-mofu-pink text-white shadow-sm'
                  : 'bg-mofu-sub text-mofu-muted hover:bg-mofu-pink/15'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* 並び替え＆表示優先オプション */}
      <div className="rounded-2xl bg-mofu-sub/70 p-2 space-y-1.5 border border-mofu-pink/10">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 shrink-0 text-[11px] font-extrabold text-mofu-muted pl-1">
            <ArrowUpDown className="h-3.5 w-3.5 text-mofu-pink-dark" />
            <span>並び順</span>
          </div>
          <select
            aria-label="作品の並び順"
            value={sortPrefs.sortBy}
            onChange={(e) =>
              updateSortPrefs({ sortBy: e.target.value as BookshelfSortBy })
            }
            className="h-9 min-w-0 flex-1 rounded-xl border border-mofu-pink/20 bg-white px-2.5 text-xs font-bold text-mofu-text focus:border-mofu-pink focus:outline-none"
          >
            <option value="default">標準（登録順）</option>
            <option value="complete_rate">揃い率が高い順</option>
            <option value="missing_count">抜け巻が多い順</option>
            <option value="total_desc">所持冊数が多い順</option>
            <option value="title_asc">タイトル順（あ→ん）</option>
          </select>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          <button
            type="button"
            onClick={() => updateSortPrefs({ pinFirst: !sortPrefs.pinFirst })}
            className={`min-h-[32px] shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-extrabold transition ${
              sortPrefs.pinFirst
                ? 'bg-mofu-pink text-white shadow-sm'
                : 'bg-white text-mofu-muted border border-mofu-pink/15'
            }`}
          >
            <Pin className="h-3 w-3" />
            <span>ピン留め先頭</span>
          </button>
          <button
            type="button"
            onClick={() =>
              updateSortPrefs({ completeFirst: !sortPrefs.completeFirst })
            }
            className={`min-h-[32px] shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-extrabold transition ${
              sortPrefs.completeFirst
                ? 'bg-mofu-mint text-mofu-text shadow-sm'
                : 'bg-white text-mofu-muted border border-mofu-pink/15'
            }`}
          >
            <span>✨ 揃ってる作品を前へ</span>
          </button>
          <button
            type="button"
            onClick={() =>
              updateSortPrefs({
                completedStatusLast: !sortPrefs.completedStatusLast,
              })
            }
            className={`min-h-[32px] shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-extrabold transition ${
              sortPrefs.completedStatusLast
                ? 'bg-mofu-yellow text-mofu-text shadow-sm'
                : 'bg-white text-mofu-muted border border-mofu-pink/15'
            }`}
          >
            <span>🏁 完結を後ろへ</span>
          </button>
        </div>
      </div>

      {/* 本棚グリッド */}
      {filteredSummaries.length === 0 ? (
        <div className="rounded-3xl bg-mofu-sub p-6 text-center">
          <BookOpen className="mx-auto mb-2 h-8 w-8 text-mofu-pink" />
          <p className="text-sm font-bold text-mofu-text">該当する作品がありません</p>
          <p className="mt-1 text-xs text-mofu-muted">
            検索ワードを変えるか、下のスキャン・追加ボタンから登録してみてください。
          </p>
        </div>
      ) : (
        <div className={`grid ${gridClass}`}>
          {filteredSummaries.map((summary) => {
            const { series, ownedCount, totalPublished, missingVolumes, isComplete, progressPercent } =
              summary;
            const compact = mobileCols === 3;
            return (
              <div
                key={series.id}
                role="button"
                tabIndex={0}
                onClick={() => openSeriesDetail(series.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openSeriesDetail(series.id);
                  }
                }}
                className="group cursor-pointer flex flex-col overflow-hidden rounded-2xl bg-white p-2 text-left shadow-mofu border border-mofu-pink/10 hover:border-mofu-pink/40 active:scale-[0.98] transition"
              >
                <div className="relative aspect-[5/7] w-full overflow-hidden rounded-xl bg-mofu-sub">
                  <img
                    src={series.cover_url}
                    alt={series.title}
                    onError={(e) => {
                      e.currentTarget.src = generatePastelCover(
                        series.title,
                        series.total_published,
                        series.author,
                        series.accent_color
                      );
                    }}
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                  />

                  {/* 左上ステータスバッジ */}
                  {series.status === 'completed' ? (
                    <span className="absolute left-1.5 top-1.5 rounded-full bg-mofu-mint px-2 py-0.5 text-[10px] font-extrabold text-mofu-text shadow-sm">
                      完結
                    </span>
                  ) : series.status === 'dropped' ? (
                    <span className="absolute left-1.5 top-1.5 rounded-full bg-mofu-muted/85 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
                      停止中
                    </span>
                  ) : null}

                  {/* 右上コンプリート/抜け巻バッジ */}
                  {missingVolumes.length > 0 ? (
                    <span className="absolute right-1.5 top-1.5 inline-flex items-center gap-0.5 rounded-full bg-mofu-yellow px-1.5 py-0.5 text-[10px] font-extrabold text-mofu-text shadow-sm ring-1 ring-mofu-pink/40">
                      <AlertTriangle className="h-3 w-3 text-mofu-pink-dark" />
                      {missingVolumes[0]}巻抜け
                    </span>
                  ) : isComplete ? (
                    <span className="absolute right-1.5 top-1.5 inline-flex items-center gap-0.5 rounded-full bg-mofu-mint px-1.5 py-0.5 text-[10px] font-extrabold text-mofu-text shadow-sm">
                      <Sparkles className="h-2.5 w-2.5" />
                      完揃
                    </span>
                  ) : null}

                  {/* 左下ピン留めトグル */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleSeriesPin(series.id);
                    }}
                    aria-label={
                      series.is_pinned
                        ? `${series.title}のピン留めを解除`
                        : `${series.title}をピン留め`
                    }
                    className={`absolute bottom-1.5 left-1.5 flex h-7 w-7 items-center justify-center rounded-full shadow-sm transition ${
                      series.is_pinned
                        ? 'bg-mofu-pink text-white'
                        : 'bg-white/85 text-mofu-muted hover:text-mofu-pink-dark'
                    }`}
                  >
                    <Pin className="h-3.5 w-3.5" />
                  </button>

                  {/* 右下 小説版バッジ */}
                  {series.media_type === 'novel' && (
                    <span className="absolute bottom-1.5 right-1.5 rounded-full bg-mofu-lavender/95 px-2 py-0.5 text-[9px] font-extrabold text-white shadow-sm">
                      小説
                    </span>
                  )}
                </div>

                <div className="mt-2 flex flex-1 flex-col justify-between min-w-0">
                  <div>
                    <h3
                      className={`font-extrabold leading-snug text-mofu-text line-clamp-2 ${
                        compact ? 'text-[11px] min-h-[2rem]' : 'text-xs min-h-[2.15rem]'
                      }`}
                    >
                      {series.title}
                    </h3>
                    {!compact && (
                      <p className="mt-0.5 truncate text-[10px] font-medium text-mofu-muted">
                        {series.author}
                      </p>
                    )}
                  </div>

                  <div className="mt-2 space-y-1">
                    <div className="flex items-center justify-between gap-1 text-[10px] font-bold">
                      <span className="truncate text-mofu-text">
                        所持 {ownedCount}/{totalPublished}巻
                      </span>
                      {isComplete && !compact && (
                        <span className="shrink-0 text-mofu-mint-dark">コンプ!</span>
                      )}
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-mofu-sub">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          missingVolumes.length > 0
                            ? 'bg-mofu-yellow-dark'
                            : isComplete
                              ? 'bg-mofu-mint'
                              : 'bg-mofu-pink'
                        }`}
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>

      {/* シリーズ詳細モーダル */}
      {selectedSummary && (
        <div
          onClick={() => {
            setSelectedSeriesId(null);
            setEditingBookId(null);
            setConfirmDeleteId(null);
          }}
          className={`fixed inset-0 z-40 !mt-0 flex justify-center bg-mofu-text/50 backdrop-blur-md [-webkit-backdrop-filter:blur(12px)] ${
            isCompactPreview ? 'items-end' : 'items-end sm:items-center'
          }`}
          role="dialog"
          aria-modal="true"
          aria-label={`${selectedSummary.series.title}の詳細`}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full overflow-y-auto bg-mofu-bg shadow-mofu-lg ${
              isCompactPreview
                ? 'max-h-[86%] max-w-full rounded-t-3xl p-3.5 pb-24'
                : 'max-h-[88dvh] max-w-md rounded-t-3xl sm:rounded-3xl p-4 pb-24 sm:pb-8'
            }`}
          >
            {/* ヘッダー（スクロール追従＆上部ブラー） */}
            <div className="sticky top-0 z-10 -mx-3.5 -mt-3.5 sm:-mx-4 sm:-mt-4 mb-3 flex items-center justify-between gap-1.5 bg-mofu-bg/90 backdrop-blur-md [-webkit-backdrop-filter:blur(10px)] px-3.5 pt-3.5 pb-2.5 sm:px-4 sm:pt-4 border-b border-mofu-sub rounded-t-3xl">
              <button
                type="button"
                onClick={() => {
                  setSelectedSeriesId(null);
                  setEditingBookId(null);
                  setConfirmDeleteId(null);
                }}
                className="min-h-[38px] shrink-0 inline-flex items-center gap-1 rounded-2xl bg-mofu-sub px-2.5 py-1.5 text-xs font-bold text-mofu-text"
              >
                <ChevronLeft className="h-4 w-4" />
                閉じる
              </button>
              <div className="flex items-center gap-1.5 min-w-0">
                <button
                  type="button"
                  onClick={() => onToggleSeriesPin(selectedSummary.series.id)}
                  className={`min-h-[38px] shrink-0 inline-flex items-center gap-1 rounded-2xl px-2.5 py-1.5 text-xs font-bold transition ${
                    selectedSummary.series.is_pinned
                      ? 'bg-mofu-pink text-white shadow-sm'
                      : 'bg-mofu-sub text-mofu-muted'
                  }`}
                >
                  <Pin className="h-3.5 w-3.5" />
                  <span>
                    {selectedSummary.series.is_pinned ? 'ピン中' : 'ピン留め'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onToggleSeriesNotify(selectedSummary.series.id)}
                  className={`min-h-[38px] shrink-0 inline-flex items-center gap-1 rounded-2xl px-2.5 py-1.5 text-xs font-bold transition ${
                    selectedSummary.series.notify_new_release
                      ? 'bg-mofu-mint/35 text-mofu-text'
                      : 'bg-mofu-sub text-mofu-muted'
                  }`}
                >
                  {selectedSummary.series.notify_new_release ? (
                    <>
                      <Bell className="h-3.5 w-3.5 text-mofu-mint-dark" />
                      <span>通知 ON</span>
                    </>
                  ) : (
                    <>
                      <BellOff className="h-3.5 w-3.5" />
                      <span>通知 OFF</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* 作品情報 */}
            <div className="flex gap-3">
              <img
                src={selectedSummary.series.cover_url}
                alt={selectedSummary.series.title}
                className="h-28 w-20 shrink-0 rounded-2xl object-cover shadow-mofu"
              />
              <div className="min-w-0 flex-1 space-y-1.5">
                <h2 className="text-base font-extrabold leading-snug text-mofu-text">
                  {selectedSummary.series.title}
                </h2>
                <p className="text-xs font-medium text-mofu-muted">
                  {selectedSummary.series.author} ／ {selectedSummary.series.publisher}
                </p>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-mofu-sub px-2.5 py-1 text-xs font-extrabold text-mofu-text">
                  <span>
                    所持: {selectedSummary.ownedCount} / {selectedSummary.totalPublished}巻
                  </span>
                  {selectedSummary.isComplete && (
                    <span className="text-mofu-mint-dark">（コンプリート！）</span>
                  )}
                </div>
              </div>
            </div>

            {/* 抜け巻アラート */}
            {selectedSummary.missingVolumes.length > 0 && (
              <div className="mt-3 rounded-2xl border-2 border-mofu-yellow-dark/40 bg-mofu-yellow/45 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-mofu-pink-dark" />
                  <div className="min-w-0 text-xs">
                    <p className="font-extrabold text-mofu-text">
                      {selectedSummary.missingVolumes.map((v) => `${v}巻`).join('・')}
                      が抜けています！
                    </p>
                    <p className="mt-0.5 text-[11px] text-mofu-muted">
                      下の巻タイルをタップするか、「買うリスト」からチェックできます。
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ステータス切り替え */}
            <div className="mt-3">
              <p className="mb-1.5 text-[11px] font-bold text-mofu-muted">購読ステータス</p>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { value: 'reading', label: '購読中', icon: BookOpen },
                    { value: 'completed', label: '完結済み', icon: CheckCircle2 },
                    { value: 'dropped', label: '購読ストップ', icon: PauseCircle },
                  ] as const
                ).map((item) => {
                  const Icon = item.icon;
                  const active = selectedSummary.series.status === item.value;
                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() =>
                        onUpdateSeriesStatus(selectedSummary.series.id, item.value)
                      }
                      className={`min-h-[44px] flex items-center justify-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-bold transition ${
                        active
                          ? 'bg-mofu-pink text-white shadow-sm'
                          : 'bg-mofu-sub text-mofu-text hover:bg-mofu-pink/15'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 範囲指定で一括所持更新 */}
            <div className="mt-3 rounded-2xl bg-mofu-sub p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-extrabold text-mofu-text">
                  範囲指定で一括所持チェック
                </span>
                <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-extrabold text-mofu-pink-dark">
                  {bulkFromVal}〜{bulkSliderVal}巻
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-8 shrink-0 text-[10px] font-extrabold text-mofu-muted">
                  開始
                </span>
                <button
                  type="button"
                  onClick={() => setBulkFromVal((v) => Math.max(1, v - 1))}
                  aria-label="開始巻を減らす"
                  className="h-8 w-8 shrink-0 flex items-center justify-center rounded-xl bg-white text-mofu-text shadow-sm active:scale-95 transition"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <input
                  type="range"
                  min={1}
                  max={Math.max(1, selectedSummary.totalPublished)}
                  value={bulkFromVal}
                  aria-label="所持範囲 開始巻"
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    setBulkFromVal(next);
                    if (next > bulkSliderVal) setBulkSliderVal(next);
                  }}
                  className="flex-1 min-w-0 accent-[#7AD9C5]"
                />
                <button
                  type="button"
                  onClick={() => {
                    const next = Math.min(
                      Math.max(1, selectedSummary.totalPublished),
                      bulkFromVal + 1
                    );
                    setBulkFromVal(next);
                    if (next > bulkSliderVal) setBulkSliderVal(next);
                  }}
                  aria-label="開始巻を増やす"
                  className="h-8 w-8 shrink-0 flex items-center justify-center rounded-xl bg-white text-mofu-text shadow-sm active:scale-95 transition"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-8 shrink-0 text-[10px] font-extrabold text-mofu-muted">
                  終了
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const next = Math.max(1, bulkSliderVal - 1);
                    setBulkSliderVal(next);
                    if (next < bulkFromVal) setBulkFromVal(next);
                  }}
                  aria-label="終了巻を減らす"
                  className="h-8 w-8 shrink-0 flex items-center justify-center rounded-xl bg-white text-mofu-text shadow-sm active:scale-95 transition"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <input
                  type="range"
                  min={1}
                  max={Math.max(1, selectedSummary.totalPublished)}
                  value={bulkSliderVal}
                  aria-label="所持範囲 終了巻"
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    setBulkSliderVal(next);
                    if (next < bulkFromVal) setBulkFromVal(next);
                  }}
                  className="flex-1 min-w-0 accent-[#FF8FA3]"
                />
                <button
                  type="button"
                  onClick={() =>
                    setBulkSliderVal((v) =>
                      Math.min(Math.max(1, selectedSummary.totalPublished), v + 1)
                    )
                  }
                  aria-label="終了巻を増やす"
                  className="h-8 w-8 shrink-0 flex items-center justify-center rounded-xl bg-white text-mofu-text shadow-sm active:scale-95 transition"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
              <button
                type="button"
                onClick={() =>
                  onBulkOwnedUpTo(
                    selectedSummary.series.id,
                    bulkSliderVal,
                    bulkFromVal
                  )
                }
                className="min-h-[42px] w-full rounded-2xl bg-mofu-pink px-3 py-2 text-xs font-extrabold text-white active:scale-95 transition"
              >
                {bulkFromVal}〜{bulkSliderVal}巻を所持にする
              </button>
            </div>

            {/* 巻別グリッド */}
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="font-extrabold text-mofu-text">
                  各巻リスト（タップで所持切替）
                </span>
                <span className="text-[11px] text-mofu-muted">メモは歯車アイコン</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {selectedSummary.seriesBooks.map((book) => {
                  const isMissing = selectedSummary.missingVolumes.includes(
                    book.volume_number
                  );
                  const isUpcoming = book.volume_number > selectedSummary.totalPublished;
                  const bounced = bouncedBookId === book.id;

                  return (
                    <div
                      key={book.id}
                      className={`relative rounded-2xl border p-1.5 transition ${
                        bounced ? 'animate-pop-bounce' : ''
                      } ${
                        book.is_owned
                          ? 'border-mofu-mint bg-mofu-mint/15'
                          : isMissing
                            ? 'border-mofu-yellow-dark bg-mofu-yellow/35'
                            : 'border-mofu-sub bg-white'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleBookTap(book)}
                        className="w-full text-left"
                      >
                        <div className="relative aspect-[5/7] overflow-hidden rounded-xl bg-mofu-sub">
                          <img
                            src={book.cover_url}
                            alt={book.title}
                            onError={(e) => {
                              e.currentTarget.src = generatePastelCover(
                                selectedSummary.series.title,
                                book.volume_number,
                                selectedSummary.series.author,
                                selectedSummary.series.accent_color
                              );
                            }}
                            className={`h-full w-full object-cover transition ${
                              book.is_owned ? 'opacity-100' : 'opacity-55 grayscale-[30%]'
                            }`}
                          />
                          <span
                            className={`absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full text-white shadow ${
                              book.is_owned
                                ? 'bg-mofu-mint-dark'
                                : isMissing
                                  ? 'bg-mofu-pink'
                                  : 'bg-mofu-muted/60'
                            }`}
                          >
                            {book.is_owned ? (
                              <Check className="h-3.5 w-3.5" />
                            ) : (
                              <Plus className="h-3.5 w-3.5" />
                            )}
                          </span>
                          {isUpcoming && (
                            <span className="absolute bottom-1 left-1 rounded-full bg-mofu-pink px-1.5 py-0.5 text-[9px] font-extrabold text-white">
                              発売予定
                            </span>
                          )}
                          {isMissing && (
                            <span className="absolute bottom-1 left-1 rounded-full bg-mofu-yellow px-1.5 py-0.5 text-[9px] font-extrabold text-mofu-text">
                              抜け巻
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-1 px-0.5">
                          <span className="text-xs font-extrabold text-mofu-text">
                            {book.volume_number}巻
                          </span>
                          <span className="text-[10px] font-bold text-mofu-muted">
                            {book.is_owned ? '所持' : '未所持'}
                          </span>
                        </div>
                      </button>

                      {/* タグ・メモ編集ボタン */}
                      <button
                        type="button"
                        onClick={() => setEditingBookId(book.id)}
                        className="mt-1 flex w-full min-h-[30px] items-center justify-center gap-1 rounded-xl bg-white/85 px-1.5 py-1 text-[10px] font-bold text-mofu-muted hover:text-mofu-text border border-mofu-sub"
                      >
                        <Tag className="h-3 w-3 shrink-0" />
                        <span className="truncate">
                          {book.tags.length > 0
                            ? book.tags[0]
                            : book.memo
                              ? 'メモあり'
                              : 'タグ/メモ'}
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 作品削除（誤操作防止の2段階確認） */}
            <div className="mt-5 border-t border-mofu-sub pt-3">
              {confirmDeleteId === selectedSummary.series.id ? (
                <div className="rounded-2xl border border-mofu-pink/40 bg-mofu-pink/10 p-3 space-y-2">
                  <p className="text-xs font-extrabold text-mofu-pink-dark text-center">
                    『{selectedSummary.series.title}』を本棚から削除しますか？
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="min-h-[40px] rounded-xl bg-white text-xs font-bold text-mofu-text border border-mofu-sub active:scale-95 transition"
                    >
                      キャンセル
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const targetId = selectedSummary.series.id;
                        setConfirmDeleteId(null);
                        setSelectedSeriesId(null);
                        setEditingBookId(null);
                        onDeleteSeries(targetId);
                      }}
                      className="min-h-[40px] rounded-xl bg-mofu-pink-dark text-xs font-extrabold text-white active:scale-95 transition"
                    >
                      削除を確定する
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(selectedSummary.series.id)}
                  className="min-h-[42px] w-full inline-flex items-center justify-center gap-1.5 rounded-2xl bg-mofu-sub text-xs font-bold text-mofu-muted hover:text-mofu-pink-dark hover:bg-mofu-pink/10 transition"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>この作品を本棚から削除</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 巻ごとのタグ・メモ編集モーダル */}
      {editingBook && (
        <BookMetaModal
          book={editingBook}
          onClose={() => setEditingBookId(null)}
          onSave={(tags, memo) => {
            onUpdateBookMeta(editingBook.id, tags, memo);
            setEditingBookId(null);
          }}
        />
      )}
    </>
  );
};

interface BookMetaModalProps {
  book: Book;
  onClose: () => void;
  onSave: (tags: BookTag[], memo: string) => void;
}

const BookMetaModal: React.FC<BookMetaModalProps> = ({ book, onClose, onSave }) => {
  const [tags, setTags] = useState<BookTag[]>(book.tags);
  const [memo, setMemo] = useState(book.memo);

  const toggleTag = (tag: BookTag) => {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  return (
    <div className="fixed inset-0 z-50 !mt-0 flex items-center justify-center bg-mofu-text/50 backdrop-blur-md [-webkit-backdrop-filter:blur(12px)] p-4">
      <div className="w-full max-w-sm rounded-3xl bg-mofu-bg p-4 shadow-mofu-lg animate-pop-bounce">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-extrabold text-mofu-text">
            {book.title} のメモ＆タグ
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="tap-target flex items-center justify-center rounded-full bg-mofu-sub text-mofu-text"
            aria-label="閉じる"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-3 text-xs font-bold text-mofu-muted">ワンタップタグ</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {BOOK_TAGS.map((tag) => {
            const active = tags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className={`min-h-[38px] rounded-full px-3 py-1.5 text-xs font-bold transition ${
                  active
                    ? 'bg-mofu-pink text-white'
                    : 'bg-mofu-sub text-mofu-text hover:bg-mofu-pink/15'
                }`}
              >
                {active ? `✓ ${tag}` : tag}
              </button>
            );
          })}
        </div>

        <label className="mt-3 block text-xs font-bold text-mofu-muted">
          一言メモ（特典・貸出相手など）
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            rows={3}
            placeholder="例: メロンブックス特典リーフレット付き"
            className="mt-1.5 w-full rounded-2xl border border-mofu-pink/25 bg-white p-2.5 text-sm text-mofu-text focus:border-mofu-pink focus:outline-none"
          />
        </label>

        <button
          type="button"
          onClick={() => onSave(tags, memo)}
          className="mt-3 min-h-[44px] w-full rounded-2xl bg-mofu-pink py-2.5 text-sm font-extrabold text-white shadow-sm active:scale-95 transition"
        >
          保存する
        </button>
      </div>
    </div>
  );
};
