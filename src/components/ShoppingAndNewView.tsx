import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  CalendarHeart,
  Check,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShoppingBag,
  Sparkles,
} from 'lucide-react';
import {
  OpenBdVolumeMeta,
  normalizeSeriesTitle,
  searchSeriesByKeyword,
} from '../services/bookApi';
import {
  sendDiscordNewReleaseWebhook,
  sendLocalPushNotification,
} from '../services/notificationService';
import { Book, Series } from '../types/manga';
import { generatePastelCover } from '../utils/coverGenerator';
import {
  formatCountdownLabel,
  getSeriesSummary,
  getTodayIso,
} from '../utils/mangaHelpers';

interface ShoppingAndNewViewProps {
  seriesList: Series[];
  books: Book[];
  rakutenAppId: string;
  discordWebhookUrl: string;
  onMarkBookPurchased: (bookId: string) => void;
  onApplyDiscoveredVolumes: (
    seriesId: string,
    totalPublished: number,
    volumesMeta?: OpenBdVolumeMeta[]
  ) => void;
  onShowToast: (msg: string) => void;
}

export const ShoppingAndNewView: React.FC<ShoppingAndNewViewProps> = ({
  seriesList,
  books,
  rakutenAppId,
  discordWebhookUrl,
  onMarkBookPurchased,
  onApplyDiscoveredVolumes,
  onShowToast,
}) => {
  const [subTab, setSubTab] = useState<'upcoming' | 'shopping'>('upcoming');
  const [isCheckingApi, setIsCheckingApi] = useState(false);
  const [apiCheckLog, setApiCheckLog] = useState<string | null>(null);
  const today = getTodayIso();

  const seriesMap = useMemo(() => {
    const map = new Map<string, Series>();
    seriesList.forEach((s) => map.set(s.id, s));
    return map;
  }, [seriesList]);

  // 購読中シリーズのもうすぐ発売する新刊
  const upcomingReleases = useMemo(() => {
    return books
      .filter((b) => {
        const s = seriesMap.get(b.series_id);
        if (!s || s.status !== 'reading') return false;
        return !b.is_owned && b.sales_date >= today;
      })
      .sort((a, b) => a.sales_date.localeCompare(b.sales_date));
  }, [books, seriesMap, today]);

  // 抜け巻＆未所持既刊のお買い物リスト
  const shoppingItems = useMemo(() => {
    const items: { book: Book; series: Series; isMissingGap: boolean }[] = [];

    seriesList.forEach((series) => {
      if (series.status === 'dropped') return;
      const summary = getSeriesSummary(series, books);
      const missingSet = new Set(summary.missingVolumes);

      summary.publishedBooks.forEach((book) => {
        if (!book.is_owned) {
          const isGap = missingSet.has(book.volume_number);
          items.push({ book, series, isMissingGap: isGap });
        }
      });
    });

    return items.sort((a, b) => {
      if (a.isMissingGap !== b.isMissingGap) return a.isMissingGap ? -1 : 1;
      return (
        a.series.title.localeCompare(b.series.title) ||
        a.book.volume_number - b.book.volume_number
      );
    });
  }, [seriesList, books]);

  const handleRunNewReleaseCheck = async () => {
    const readingSeries = seriesList.filter(
      (s) => s.status === 'reading' && s.notify_new_release
    );
    if (readingSeries.length === 0) {
      setApiCheckLog('通知ONの「購読中」作品がありません。');
      onShowToast('新刊チェックを実行しました');
      return;
    }

    setIsCheckingApi(true);
    setApiCheckLog(
      `通知ONの購読中 ${readingSeries.length}作品の新刊情報をリアルタイム照会中...`
    );
    try {
      let updatedCount = 0;
      const updatedTitles: string[] = [];
      for (const s of readingSeries.slice(0, 6)) {
        const res = await searchSeriesByKeyword(s.title, rakutenAppId);
        const normTarget = normalizeSeriesTitle(s.title);
        const exactMatch = res.find(
          (r) => normalizeSeriesTitle(r.title) === normTarget
        );
        if (exactMatch && exactMatch.total_published > s.total_published) {
          onApplyDiscoveredVolumes(
            s.id,
            exactMatch.total_published,
            exactMatch.volumes
          );
          updatedCount += 1;
          updatedTitles.push(
            `${s.title} (${exactMatch.total_published}巻)`
          );
        }
      }

      if (updatedCount > 0) {
        const msg = `${updatedCount}作品の新刊・未登録既刊を反映しました: ${updatedTitles.join('、')}`;
        setApiCheckLog(msg);
        onShowToast(`${updatedCount}作品の新刊を追加しました！`);
        if (
          typeof Notification !== 'undefined' &&
          Notification.permission === 'granted'
        ) {
          await sendLocalPushNotification({
            title: 'MofuShelf 新刊チェック',
            body: msg,
          });
        }
      } else {
        setApiCheckLog(
          `照会完了（対象 ${readingSeries.length}作品）：すべて最新の既刊数です。`
        );
        onShowToast('新刊チェック完了：最新の状態です');
      }
    } catch {
      setApiCheckLog('新刊情報の照会中に通信エラーが発生しました。');
    } finally {
      setIsCheckingApi(false);
    }
  };

  const renderStoreLinks = (bookTitle: string) => {
    const encoded = encodeURIComponent(bookTitle);
    return (
      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
        <a
          href={`https://books.rakuten.co.jp/search?sitem=${encoded}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-[32px] items-center gap-1 rounded-xl border border-mofu-pink/25 bg-mofu-bg px-2 py-1 text-[10px] font-extrabold text-mofu-pink-dark hover:bg-mofu-pink/10 transition"
        >
          <span>楽天ブックス</span>
          <ExternalLink className="h-3 w-3 shrink-0" />
        </a>
        <a
          href={`https://www.amazon.co.jp/s?k=${encoded}&i=stripbooks`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-[32px] items-center gap-1 rounded-xl border border-mofu-mint/40 bg-mofu-bg px-2 py-1 text-[10px] font-extrabold text-mofu-text hover:bg-mofu-mint/15 transition"
        >
          <span>Amazon</span>
          <ExternalLink className="h-3 w-3 shrink-0" />
        </a>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* サブタブ切り替え */}
      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-mofu-sub p-1.5">
        <button
          type="button"
          onClick={() => setSubTab('upcoming')}
          className={`min-h-[44px] flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-extrabold transition ${
            subTab === 'upcoming'
              ? 'bg-white text-mofu-pink-dark shadow-sm'
              : 'text-mofu-muted'
          }`}
        >
          <CalendarHeart className="h-4 w-4 shrink-0" />
          <span className="truncate">もうすぐ新刊 ({upcomingReleases.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setSubTab('shopping')}
          className={`min-h-[44px] flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-extrabold transition ${
            subTab === 'shopping'
              ? 'bg-white text-mofu-pink-dark shadow-sm'
              : 'text-mofu-muted'
          }`}
        >
          <ShoppingBag className="h-4 w-4 shrink-0" />
          <span className="truncate">買うリスト ({shoppingItems.length})</span>
        </button>
      </div>

      {subTab === 'upcoming' ? (
        <div className="space-y-2.5">
          <div className="rounded-2xl bg-mofu-sub/80 p-3 text-xs text-mofu-muted space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0">
                「購読中」作品の新刊発売予定をチェックしています。
              </span>
              <button
                type="button"
                disabled={isCheckingApi}
                onClick={() => void handleRunNewReleaseCheck()}
                className="min-h-[38px] shrink-0 inline-flex items-center gap-1 rounded-xl bg-white px-2.5 py-1.5 text-[11px] font-extrabold text-mofu-pink-dark shadow-sm active:scale-95 transition disabled:opacity-60"
              >
                {isCheckingApi ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                <span>最新チェック</span>
              </button>
            </div>
            {apiCheckLog && (
              <p className="rounded-xl bg-white px-2.5 py-1.5 text-[11px] font-bold text-mofu-text">
                {apiCheckLog}
              </p>
            )}
            {upcomingReleases.length > 0 && (
              <button
                type="button"
                onClick={async () => {
                  const res = await sendDiscordNewReleaseWebhook({
                    webhookUrl: discordWebhookUrl,
                    upcomingBooks: upcomingReleases.map((b) => ({
                      book: b,
                      series: seriesMap.get(b.series_id),
                    })),
                  });
                  onShowToast(res.message);
                }}
                className="min-h-[38px] w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#5865F2] px-3 py-1.5 text-[11px] font-extrabold text-white shadow-sm active:scale-95 transition"
              >
                <Bell className="h-3.5 w-3.5" />
                <span>Discordへ新刊リストを通知送信</span>
              </button>
            )}
          </div>

          {upcomingReleases.length === 0 ? (
            <div className="rounded-3xl bg-mofu-sub p-6 text-center">
              <Sparkles className="mx-auto mb-2 h-8 w-8 text-mofu-mint-dark" />
              <p className="text-sm font-bold text-mofu-text">
                予定されている新刊はありません
              </p>
            </div>
          ) : (
            upcomingReleases.map((book) => {
              const series = seriesMap.get(book.series_id);
              const countdown = formatCountdownLabel(book.sales_date);
              return (
                <div
                  key={book.id}
                  className="flex items-center gap-3 rounded-3xl bg-white p-3 shadow-mofu border border-mofu-pink/15"
                >
                  <img
                    src={book.cover_url}
                    alt={book.title}
                    onError={(e) => {
                      e.currentTarget.src = generatePastelCover(
                        series?.title || book.title,
                        book.volume_number,
                        series?.author,
                        series?.accent_color
                      );
                    }}
                    className="h-24 w-16 shrink-0 rounded-xl object-cover shadow-sm"
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="rounded-full bg-mofu-yellow px-2.5 py-0.5 text-[11px] font-extrabold text-mofu-text">
                        {countdown}
                      </span>
                      <span className="text-[11px] font-bold text-mofu-muted">
                        {book.sales_date}
                      </span>
                    </div>
                    <h3 className="text-sm font-extrabold text-mofu-text line-clamp-2">
                      {book.title}
                    </h3>
                    <p className="truncate text-[11px] text-mofu-muted">
                      {series?.author} ／ {series?.publisher}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => onMarkBookPurchased(book.id)}
                        className="min-h-[40px] inline-flex items-center gap-1 rounded-xl bg-mofu-pink px-3 py-1.5 text-xs font-extrabold text-white active:scale-95 transition"
                      >
                        <Check className="h-3.5 w-3.5" />
                        フラゲ・購入済みにする
                      </button>
                    </div>
                    {renderStoreLinks(book.title)}
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          <div className="rounded-2xl bg-mofu-sub/80 px-3.5 py-2.5 text-xs text-mofu-muted">
            抜け巻（買い忘れ）と未所持の既刊を自動ピックアップしています。書店でのチェックリストにどうぞ！
          </div>

          {shoppingItems.length === 0 ? (
            <div className="rounded-3xl bg-mofu-sub p-6 text-center">
              <Sparkles className="mx-auto mb-2 h-8 w-8 text-mofu-mint-dark" />
              <p className="text-sm font-extrabold text-mofu-text">
                抜け巻・買い忘れはありません！
              </p>
              <p className="mt-1 text-xs text-mofu-muted">
                すべての購読中シリーズが最新刊まで揃っています。
              </p>
            </div>
          ) : (
            shoppingItems.map(({ book, series, isMissingGap }) => (
              <div
                key={book.id}
                className={`flex items-center gap-3 rounded-3xl bg-white p-3 shadow-mofu border ${
                  isMissingGap
                    ? 'border-mofu-yellow-dark/50 ring-1 ring-mofu-yellow'
                    : 'border-mofu-pink/15'
                }`}
              >
                <img
                  src={book.cover_url}
                  alt={book.title}
                  onError={(e) => {
                    e.currentTarget.src = generatePastelCover(
                      series.title,
                      book.volume_number,
                      series.author,
                      series.accent_color
                    );
                  }}
                  className="h-20 w-14 shrink-0 rounded-xl object-cover"
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {isMissingGap ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-mofu-yellow px-2 py-0.5 text-[10px] font-extrabold text-mofu-text">
                        <AlertTriangle className="h-3 w-3 text-mofu-pink-dark" />
                        抜け巻！
                      </span>
                    ) : (
                      <span className="rounded-full bg-mofu-sub px-2 py-0.5 text-[10px] font-bold text-mofu-muted">
                        未所持の既刊
                      </span>
                    )}
                    <span className="text-[10px] text-mofu-muted truncate">
                      {series.publisher}
                    </span>
                  </div>
                  <h3 className="text-xs font-extrabold text-mofu-text line-clamp-2">
                    {book.title}
                  </h3>
                  <button
                    type="button"
                    onClick={() => onMarkBookPurchased(book.id)}
                    className="min-h-[44px] w-full sm:w-auto inline-flex items-center justify-center gap-1 rounded-2xl bg-mofu-mint px-3 py-2 text-xs font-extrabold text-mofu-text active:scale-95 transition"
                  >
                    <Check className="h-4 w-4" />
                    購入完了（本棚へ追加）
                  </button>
                  {renderStoreLinks(book.title)}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
