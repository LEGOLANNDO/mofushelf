import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  BookOpen,
  CalendarHeart,
  Lock,
  ScanBarcode,
  Settings,
  Smartphone,
  Sparkles,
} from 'lucide-react';
import { BookshelfView } from './components/BookshelfView';
import { ConfettiEffect } from './components/ConfettiEffect';
import { ScanAndAddView, ScanSubTab } from './components/ScanAndAddView';
import { SettingsView } from './components/SettingsView';
import { ShoppingAndNewView } from './components/ShoppingAndNewView';
import {
  CATALOG_SERIES,
  INITIAL_BOOKS,
  INITIAL_SERIES,
  buildIsbn,
} from './data/mockData';
import {
  ActiveTab,
  AppSettings,
  Book,
  BookTag,
  CatalogSeries,
  MangaMediaType,
  Series,
  SeriesStatus,
  ViewportPreview,
} from './types/manga';
import { generatePastelCover } from './utils/coverGenerator';
import { getSeriesSummary, getTodayIso } from './utils/mangaHelpers';
import {
  FetchedCatalogSeries,
  OPENBD_REAL_SERIES_PRESETS,
  OpenBdVolumeMeta,
  areSeriesSameWork,
  detectMediaType,
  findMatchingExistingSeries,
  formatSeriesTitleWithMedia,
  normalizeSeriesTitle,
  parseMangaTitleAndVolume,
  searchSeriesByKeyword,
  stripParallelTitle,
} from './services/bookApi';
import {
  getPhoneNotificationStatus,
  sendLocalPushNotification,
} from './services/notificationService';
import {
  loadShelfFromIndexedDb,
  saveShelfToIndexedDb,
} from './services/storageService';

const STORAGE_KEYS = {
  SERIES: 'mofushelf_series_v2',
  BOOKS: 'mofushelf_books_v2',
  SETTINGS: 'mofushelf_settings_v1',
  CLEAN_INIT_V2: 'mofushelf_clean_init_v2',
  LAST_PUSH_DATE: 'mofushelf_last_push_date_v1',
};

const DEFAULT_SETTINGS: AppSettings = {
  geminiApiKey: '',
  rakutenAppId: '',
  discordWebhookUrl: '',
  browserPushEnabled: true,
  supabaseUrl: '',
  supabaseAnonKey: '',
  passcodeEnabled: false,
  passcode: '1234',
};

function ensureCleanShelfV2(): void {
  if (typeof window === 'undefined') return;
  try {
    if (localStorage.getItem(STORAGE_KEYS.CLEAN_INIT_V2)) return;
    localStorage.removeItem('mofushelf_series_v1');
    localStorage.removeItem('mofushelf_books_v1');
    localStorage.setItem(STORAGE_KEYS.SERIES, '[]');
    localStorage.setItem(STORAGE_KEYS.BOOKS, '[]');
    localStorage.setItem(STORAGE_KEYS.CLEAN_INIT_V2, 'true');
    void saveShelfToIndexedDb([], []);
  } catch {
    // ストレージ制限環境では無視
  }
}

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function App() {
  ensureCleanShelfV2();

  const [seriesList, setSeriesList] = useState<Series[]>(() =>
    loadJson(STORAGE_KEYS.SERIES, INITIAL_SERIES)
  );
  const [books, setBooks] = useState<Book[]>(() =>
    loadJson(STORAGE_KEYS.BOOKS, INITIAL_BOOKS)
  );
  const [settings, setSettings] = useState<AppSettings>(() =>
    loadJson(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS)
  );

  const [activeTab, setActiveTab] = useState<ActiveTab>('bookshelf');
  const [dropletAnimKey, setDropletAnimKey] = useState(0);
  const [scanInitialTab, setScanInitialTab] = useState<ScanSubTab>('barcode');

  const switchTab = (tab: ActiveTab, scanSub?: ScanSubTab) => {
    if (scanSub) {
      setScanInitialTab(scanSub);
    }
    if (tab !== activeTab) {
      setDropletAnimKey((k) => k + 1);
      setActiveTab(tab);
    }
  };
  const [viewportPreview, setViewportPreview] = useState<ViewportPreview>('auto');
  const [confettiKey, setConfettiKey] = useState(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState<boolean>(() => settings.passcodeEnabled);
  const [passcodeInput, setPasscodeInput] = useState('');

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SERIES, JSON.stringify(seriesList));
    localStorage.setItem(STORAGE_KEYS.BOOKS, JSON.stringify(books));
    void saveShelfToIndexedDb(seriesList, books);
  }, [seriesList, books]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  }, [settings]);

  // 初回ロード時：localStorageが空ならIndexedDBから復元し、並列英語タイトル(=)や単巻枠も自動補正
  useEffect(() => {
    const hydrateAndMigrate = async () => {
      let currentSeries = seriesList;
      let currentBooks = books;

      if (!localStorage.getItem(STORAGE_KEYS.SERIES)) {
        const idbData = await loadShelfFromIndexedDb();
        if (idbData && idbData.series.length > 0) {
          currentSeries = idbData.series;
          currentBooks = idbData.books;
        }
      }

      let seriesChanged = false;
      const expandedSeries: {
        seriesId: string;
        cleanTitle: string;
        total: number;
        author: string;
        accent: string;
        presetIsbns?: string[];
      }[] = [];

      const nextSeries = currentSeries.map((s) => {
        const cleanTitle =
          stripParallelTitle(parseMangaTitleAndVolume(s.title).seriesTitle) ||
          stripParallelTitle(s.title);
        const normClean = normalizeSeriesTitle(cleanTitle);

        const matchedPreset = OPENBD_REAL_SERIES_PRESETS.find((p) => {
          const normP = normalizeSeriesTitle(p.label);
          return normClean.includes(normP) || normP.includes(normClean);
        });
        const matchedCatalog = CATALOG_SERIES.find((c) => {
          const normC = normalizeSeriesTitle(c.title);
          return normClean.includes(normC) || normC.includes(normClean);
        });

        const finalTitle =
          matchedPreset?.label || matchedCatalog?.title || cleanTitle;
        const knownTotal = Math.max(
          s.total_published,
          matchedPreset?.isbns.length || 0,
          matchedCatalog?.total_published || 0
        );

        if (finalTitle !== s.title || knownTotal > s.total_published) {
          seriesChanged = true;
          expandedSeries.push({
            seriesId: s.id,
            cleanTitle: finalTitle,
            total: knownTotal,
            author: s.author,
            accent: s.accent_color || '#7AD9C5',
            presetIsbns: matchedPreset?.isbns,
          });
          return {
            ...s,
            title: finalTitle,
            total_published: knownTotal,
          };
        }
        return s;
      });

      const dedupedSeries: Series[] = [];
      const mergeIdMap = new Map<string, string>();
      nextSeries.forEach((s) => {
        const detectedMedia: MangaMediaType =
          s.media_type ||
          detectMediaType({ rawTitle: s.title, publisher: s.publisher });
        const normalizedSeries: Series = {
          ...s,
          media_type: detectedMedia,
          title: formatSeriesTitleWithMedia(s.title, detectedMedia),
        };
        if (
          normalizedSeries.media_type !== s.media_type ||
          normalizedSeries.title !== s.title
        ) {
          seriesChanged = true;
        }
        const keeper = dedupedSeries.find((k) =>
          areSeriesSameWork(
            {
              title: k.title,
              mediaType: k.media_type || 'comic',
              publisher: k.publisher,
            },
            {
              title: normalizedSeries.title,
              mediaType: normalizedSeries.media_type || 'comic',
              publisher: normalizedSeries.publisher,
            }
          )
        );
        if (!keeper) {
          dedupedSeries.push(normalizedSeries);
        } else {
          seriesChanged = true;
          mergeIdMap.set(normalizedSeries.id, keeper.id);
          keeper.total_published = Math.max(
            keeper.total_published,
            normalizedSeries.total_published
          );
          keeper.is_pinned = Boolean(
            keeper.is_pinned || normalizedSeries.is_pinned
          );
          if (
            (keeper.author === '著者情報なし' || keeper.author === '著者不明') &&
            normalizedSeries.author
          ) {
            keeper.author = normalizedSeries.author;
          }
        }
      });

      if (mergeIdMap.size > 0) {
        expandedSeries.forEach((info) => {
          const mapped = mergeIdMap.get(info.seriesId);
          if (mapped) info.seriesId = mapped;
        });
      }

      let booksChanged = false;
      const cleanedBooksRaw = currentBooks.map((b) => {
        let nextBook = b;
        const remappedSeriesId = mergeIdMap.get(b.series_id);
        if (remappedSeriesId && remappedSeriesId !== b.series_id) {
          booksChanged = true;
          nextBook = {
            ...nextBook,
            series_id: remappedSeriesId,
            id: `${remappedSeriesId}-vol-${nextBook.volume_number}`,
          };
        }
        if (/[=＝]/.test(nextBook.title)) {
          booksChanged = true;
          const parsed = parseMangaTitleAndVolume(nextBook.title);
          const jpTitle = stripParallelTitle(parsed.seriesTitle) || parsed.seriesTitle;
          nextBook = {
            ...nextBook,
            title: `${jpTitle} ${nextBook.volume_number}巻`,
          };
        }
        return nextBook;
      });

      const mergedBookMap = new Map<string, Book>();
      cleanedBooksRaw.forEach((b) => {
        const key = `${b.series_id}::${b.volume_number}`;
        const prevBook = mergedBookMap.get(key);
        if (!prevBook) {
          mergedBookMap.set(key, b);
        } else {
          booksChanged = true;
          mergedBookMap.set(key, {
            ...prevBook,
            is_owned: prevBook.is_owned || b.is_owned,
            registered_at: prevBook.registered_at || b.registered_at,
            cover_url: prevBook.cover_url || b.cover_url,
          });
        }
      });
      const cleanedBooks = Array.from(mergedBookMap.values());

      if (seriesChanged || booksChanged) {
        const finalSeries = seriesChanged ? dedupedSeries : currentSeries;
        const additions: Book[] = [];
        expandedSeries.forEach((info) => {
          const existingVols = new Set(
            cleanedBooks
              .filter((b) => b.series_id === info.seriesId)
              .map((b) => b.volume_number)
          );
          for (let v = 1; v <= info.total; v += 1) {
            if (existingVols.has(v)) continue;
            additions.push({
              id: `${info.seriesId}-vol-${v}`,
              series_id: info.seriesId,
              isbn:
                info.presetIsbns?.[v - 1] ||
                buildIsbn(info.seriesId.length + 10, v),
              title: `${info.cleanTitle} ${v}巻`,
              volume_number: v,
              cover_url: generatePastelCover(
                info.cleanTitle,
                v,
                info.author,
                info.accent
              ),
              sales_date: new Date().toISOString().slice(0, 10),
              is_owned: false,
              is_special_edition: false,
              tags: [],
              memo: '',
              registered_at: '',
            });
          }
        });
        setSeriesList(finalSeries);
        setBooks(additions.length > 0 ? [...cleanedBooks, ...additions] : cleanedBooks);
      }
    };

    void hydrateAndMigrate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => {
      setToastMessage((curr) => (curr === msg ? null : curr));
    }, 2800);
  };

  const triggerConfetti = () => {
    setConfettiKey((k) => k + 1);
  };

  const missingOrUpcomingCount = useMemo(() => {
    let count = 0;
    seriesList.forEach((s) => {
      if (s.status === 'dropped') return;
      const summary = getSeriesSummary(s, books);
      count += summary.missingVolumes.length + summary.upcomingBooks.length;
    });
    return count;
  }, [seriesList, books]);

  const handleToggleBookOwned = (bookId: string) => {
    let turnedOn = false;
    let toggledTitle = '';
    setBooks((prev) =>
      prev.map((b) => {
        if (b.id !== bookId) return b;
        turnedOn = !b.is_owned;
        toggledTitle = b.title;
        return {
          ...b,
          is_owned: !b.is_owned,
          registered_at: !b.is_owned ? new Date().toISOString() : '',
        };
      })
    );
    if (turnedOn) {
      triggerConfetti();
      showToast(`『${toggledTitle}』を所持済みにしました！`);
    }
  };

  const handleBulkOwnedUpTo = (
    seriesId: string,
    upToVolume: number,
    fromVolume = 1
  ) => {
    const startVol = Math.max(1, Math.min(fromVolume, upToVolume));
    const endVol = Math.max(startVol, upToVolume);
    const targetSeries = seriesList.find((s) => s.id === seriesId);
    setBooks((prev) =>
      prev.map((b) => {
        if (b.series_id !== seriesId) return b;
        if (b.volume_number >= startVol && b.volume_number <= endVol) {
          return {
            ...b,
            is_owned: true,
            registered_at: b.registered_at || new Date().toISOString(),
          };
        }
        return b;
      })
    );
    triggerConfetti();
    showToast(
      `『${targetSeries?.title || 'シリーズ'}』${startVol}〜${endVol}巻を所持登録しました！`
    );
  };

  const handleUpdateSeriesStatus = (seriesId: string, status: SeriesStatus) => {
    setSeriesList((prev) =>
      prev.map((s) =>
        s.id === seriesId
          ? {
              ...s,
              status,
              notify_new_release: status === 'reading' ? s.notify_new_release : false,
            }
          : s
      )
    );
  };

  const handleToggleSeriesNotify = (seriesId: string) => {
    setSeriesList((prev) =>
      prev.map((s) =>
        s.id === seriesId
          ? { ...s, notify_new_release: !s.notify_new_release }
          : s
      )
    );
  };

  const handleToggleSeriesPin = (seriesId: string) => {
    const target = seriesList.find((s) => s.id === seriesId);
    const nextPinned = !target?.is_pinned;
    setSeriesList((prev) =>
      prev.map((s) =>
        s.id === seriesId ? { ...s, is_pinned: !s.is_pinned } : s
      )
    );
    if (target) {
      showToast(
        nextPinned
          ? `『${target.title}』をピン留めしました`
          : `『${target.title}』のピン留めを解除しました`
      );
    }
  };

  const handleDeleteSeries = (seriesId: string) => {
    const target = seriesList.find((s) => s.id === seriesId);
    setSeriesList((prev) => prev.filter((s) => s.id !== seriesId));
    setBooks((prev) => prev.filter((b) => b.series_id !== seriesId));
    showToast(`『${target?.title || '作品'}』を本棚から削除しました`);
  };

  const handleApplyDiscoveredVolumes = (
    seriesId: string,
    totalPublished: number,
    volumesMeta?: OpenBdVolumeMeta[]
  ) => {
    const target = seriesList.find((s) => s.id === seriesId);
    if (!target) return;
    const cleanTitle =
      parseMangaTitleAndVolume(target.title).seriesTitle || target.title;
    const newTotal = Math.max(target.total_published, totalPublished);
    const metaMap = new Map(
      (volumesMeta || []).map((vm) => [vm.volumeNumber, vm])
    );
    const seedNum = Math.abs(
      seriesId.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
    );

    setSeriesList((prev) =>
      prev.map((s) =>
        s.id === seriesId
          ? { ...s, total_published: Math.max(s.total_published, newTotal) }
          : s
      )
    );

    setBooks((prev) => {
      const existingVols = new Set(
        prev.filter((b) => b.series_id === seriesId).map((b) => b.volume_number)
      );
      const added: Book[] = [];
      for (let v = 1; v <= newTotal; v += 1) {
        if (existingVols.has(v)) continue;
        const apiMeta = metaMap.get(v);
        added.push({
          id: `${seriesId}-vol-${v}`,
          series_id: seriesId,
          isbn: apiMeta?.isbn || buildIsbn(seedNum % 9000, v),
          title: apiMeta?.title || `${cleanTitle} ${v}巻`,
          volume_number: v,
          cover_url:
            apiMeta?.coverUrl ||
            generatePastelCover(
              cleanTitle,
              v,
              target.author,
              target.accent_color
            ),
          sales_date: apiMeta?.salesDate || new Date().toISOString().slice(0, 10),
          is_owned: false,
          is_special_edition: false,
          tags: [],
          memo: '',
          registered_at: '',
        });
      }
      return added.length > 0 ? [...prev, ...added] : prev;
    });
  };

  const dailyPushCheckedRef = useRef(false);

  // 起動・復帰時：1日1回だけ購読中＆通知ON作品の新刊をチェックし、許可済みならスマホへ直接通知
  useEffect(() => {
    if (dailyPushCheckedRef.current) return;
    if (seriesList.length === 0) return;

    const readingNotifySeries = seriesList.filter(
      (s) => s.status === 'reading' && s.notify_new_release
    );
    if (readingNotifySeries.length === 0) return;

    const todayIso = getTodayIso();
    try {
      if (localStorage.getItem(STORAGE_KEYS.LAST_PUSH_DATE) === todayIso) {
        dailyPushCheckedRef.current = true;
        return;
      }
    } catch {
      // ignore storage errors
    }

    dailyPushCheckedRef.current = true;

    const runDailyCheckAndNotify = async () => {
      const in3DaysDate = new Date();
      in3DaysDate.setDate(in3DaysDate.getDate() + 3);
      const in3DaysIso = in3DaysDate.toISOString().slice(0, 10);

      const readingSeriesIds = new Set(readingNotifySeries.map((s) => s.id));
      const soonUpcoming = books.filter(
        (b) =>
          readingSeriesIds.has(b.series_id) &&
          !b.is_owned &&
          b.sales_date >= todayIso &&
          b.sales_date <= in3DaysIso
      );

      const discovered: string[] = [];
      for (const s of readingNotifySeries.slice(0, 3)) {
        try {
          const res = await searchSeriesByKeyword(s.title, settings.rakutenAppId);
          const normTarget = normalizeSeriesTitle(s.title);
          const exact = res.find((r) => normalizeSeriesTitle(r.title) === normTarget);
          if (exact && exact.total_published > s.total_published) {
            handleApplyDiscoveredVolumes(s.id, exact.total_published, exact.volumes);
            discovered.push(`${s.title} ${exact.total_published}巻`);
          }
        } catch {
          // 通信失敗時はオフラインのまま継続
        }
      }

      if (discovered.length > 0) {
        showToast(`新刊が見つかりました: ${discovered.join('・')}`);
      }

      if (discovered.length > 0 || soonUpcoming.length > 0) {
        try {
          localStorage.setItem(STORAGE_KEYS.LAST_PUSH_DATE, todayIso);
        } catch {
          // ignore storage errors
        }

        if (
          settings.browserPushEnabled !== false &&
          getPhoneNotificationStatus() === 'granted'
        ) {
          const parts: string[] = [];
          if (discovered.length > 0) {
            parts.push(`新刊追加: ${discovered.join('、')}`);
          }
          if (soonUpcoming.length > 0) {
            parts.push(
              `まもなく発売: ${soonUpcoming
                .slice(0, 2)
                .map((b) => b.title)
                .join('、')}`
            );
          }
          await sendLocalPushNotification({
            title: '📚 MofuShelf 新刊お知らせ',
            body: parts.join(' ／ '),
          });
        }
      }
    };

    void runDailyCheckAndNotify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesList.length]);

  const handleUpdateBookMeta = (bookId: string, tags: BookTag[], memo: string) => {
    setBooks((prev) =>
      prev.map((b) =>
        b.id === bookId
          ? {
              ...b,
              tags,
              is_special_edition: tags.includes('特装版'),
              memo,
            }
          : b
      )
    );
    showToast('タグ・メモを保存しました');
  };

  const handleRegisterBookByData = (payload: {
    seriesId: string;
    seriesTitle: string;
    author: string;
    publisher: string;
    totalPublished: number;
    accentColor: string;
    volumeNumber: number;
    isbn: string;
    isOwned: boolean;
    coverUrl?: string;
    salesDate?: string;
    isSpecialEdition?: boolean;
    volumesMeta?: OpenBdVolumeMeta[];
  }): { status: 'added' | 'updated' | 'duplicate'; book: Book } => {
    const parsedPayloadSeries = parseMangaTitleAndVolume(payload.seriesTitle);
    const detectedMedia: MangaMediaType = detectMediaType({
      rawTitle: payload.seriesTitle,
      seriesTitle: parsedPayloadSeries.seriesTitle,
      publisher: payload.publisher,
    });
    const baseCleanTitle = parsedPayloadSeries.seriesTitle || payload.seriesTitle;
    const cleanPayloadSeriesTitle = formatSeriesTitleWithMedia(
      baseCleanTitle,
      detectedMedia
    );
    const matchedSeries = findMatchingExistingSeries(seriesList, {
      id: payload.seriesId,
      title: cleanPayloadSeriesTitle,
      mediaType: detectedMedia,
      publisher: payload.publisher,
    });

    const targetSeriesId = matchedSeries?.id || payload.seriesId;
    const volumeMetaMap = new Map(
      (payload.volumesMeta || []).map((vm) => [vm.volumeNumber, vm])
    );

    const existingBook = books.find(
      (b) =>
        (payload.isbn && b.isbn === payload.isbn) ||
        (b.series_id === targetSeriesId && b.volume_number === payload.volumeNumber)
    );

    if (existingBook && existingBook.is_owned) {
      return { status: 'duplicate', book: existingBook };
    }

    const resolvedCover =
      payload.coverUrl ||
      generatePastelCover(
        cleanPayloadSeriesTitle,
        payload.volumeNumber,
        payload.author,
        payload.accentColor
      );
    const resolvedDate = payload.salesDate || new Date().toISOString().slice(0, 10);
    const total = Math.max(
      payload.totalPublished,
      payload.volumeNumber,
      matchedSeries?.total_published || 0,
      payload.volumesMeta?.length || 0
    );

    if (!matchedSeries) {
      const newSeries: Series = {
        id: targetSeriesId,
        title: cleanPayloadSeriesTitle,
        author: payload.author,
        publisher: payload.publisher,
        cover_url: resolvedCover,
        notify_new_release: true,
        status: 'reading',
        total_published: total,
        media_type: detectedMedia,
        accent_color: payload.accentColor,
        created_at: new Date().toISOString(),
      };
      setSeriesList((prev) => [newSeries, ...prev]);

      // 既刊全巻（1〜total）の枠を生成し、登録巻のみ所持済み・残りは未所持枠にする
      const createdBooks: Book[] = [];
      for (let v = 1; v <= total; v += 1) {
        const isTarget = v === payload.volumeNumber;
        const apiMeta = volumeMetaMap.get(v);
        createdBooks.push({
          id: `${targetSeriesId}-vol-${v}`,
          series_id: targetSeriesId,
          isbn: isTarget
            ? payload.isbn
            : apiMeta?.isbn || buildIsbn(targetSeriesId.length + 10, v),
          title: isTarget
            ? `${cleanPayloadSeriesTitle} ${v}`
            : apiMeta?.title || `${cleanPayloadSeriesTitle} ${v}`,
          volume_number: v,
          cover_url: isTarget
            ? resolvedCover
            : apiMeta?.coverUrl ||
              generatePastelCover(
                cleanPayloadSeriesTitle,
                v,
                payload.author,
                payload.accentColor
              ),
          sales_date: isTarget
            ? resolvedDate
            : apiMeta?.salesDate || new Date().toISOString().slice(0, 10),
          is_owned: isTarget && payload.isOwned,
          is_special_edition: isTarget ? Boolean(payload.isSpecialEdition) : false,
          tags: isTarget && payload.isSpecialEdition ? ['特装版'] : [],
          memo: '',
          registered_at: isTarget && payload.isOwned ? new Date().toISOString() : '',
        });
      }
      setBooks((prev) => [...prev, ...createdBooks]);
      const targetBook =
        createdBooks.find((b) => b.volume_number === payload.volumeNumber) ||
        createdBooks[0];
      triggerConfetti();
      showToast(
        `『${cleanPayloadSeriesTitle} ${payload.volumeNumber}巻』を登録！（全${total}巻中）`
      );
      return { status: 'added', book: targetBook };
    }

    // 既存シリーズに未登録の既刊枠があれば補充する
    const existingVolsForSeries = new Set(
      books.filter((b) => b.series_id === targetSeriesId).map((b) => b.volume_number)
    );
    const missingFrameworkBooks: Book[] = [];
    for (let v = 1; v <= total; v += 1) {
      if (existingVolsForSeries.has(v)) continue;
      const isTarget = v === payload.volumeNumber;
      const apiMeta = volumeMetaMap.get(v);
      missingFrameworkBooks.push({
        id: `${targetSeriesId}-vol-${v}`,
        series_id: targetSeriesId,
        isbn: isTarget
          ? payload.isbn
          : apiMeta?.isbn || buildIsbn(targetSeriesId.length + 10, v),
        title: `${cleanPayloadSeriesTitle} ${v}`,
        volume_number: v,
        cover_url: isTarget
          ? resolvedCover
          : apiMeta?.coverUrl ||
            generatePastelCover(
              cleanPayloadSeriesTitle,
              v,
              payload.author,
              payload.accentColor
            ),
        sales_date: isTarget
          ? resolvedDate
          : apiMeta?.salesDate || new Date().toISOString().slice(0, 10),
        is_owned: isTarget && payload.isOwned,
        is_special_edition: isTarget ? Boolean(payload.isSpecialEdition) : false,
        tags: isTarget && payload.isSpecialEdition ? ['特装版'] : [],
        memo: '',
        registered_at: isTarget && payload.isOwned ? new Date().toISOString() : '',
      });
    }

    if (existingBook) {
      const updatedBook: Book = {
        ...existingBook,
        cover_url: payload.coverUrl || existingBook.cover_url,
        sales_date: payload.salesDate || existingBook.sales_date,
        is_owned: payload.isOwned,
        is_special_edition: payload.isSpecialEdition ?? existingBook.is_special_edition,
        registered_at: payload.isOwned ? new Date().toISOString() : '',
      };
      setBooks((prev) => [
        ...prev.map((b) => (b.id === existingBook.id ? updatedBook : b)),
        ...missingFrameworkBooks,
      ]);
      setSeriesList((prev) =>
        prev.map((s) =>
          s.id === matchedSeries.id
            ? {
                ...s,
                title: cleanPayloadSeriesTitle,
                total_published: Math.max(s.total_published, total),
                cover_url:
                  payload.coverUrl && payload.volumeNumber >= s.total_published
                    ? payload.coverUrl
                    : s.cover_url,
              }
            : s
        )
      );
      triggerConfetti();
      showToast(`『${updatedBook.title}』を所持済みに登録しました！`);
      return { status: 'updated', book: updatedBook };
    }

    setBooks((prev) => [...prev, ...missingFrameworkBooks]);
    setSeriesList((prev) =>
      prev.map((s) =>
        s.id === matchedSeries.id
          ? {
              ...s,
              title: cleanPayloadSeriesTitle,
              total_published: Math.max(s.total_published, total),
              cover_url: payload.coverUrl || s.cover_url,
            }
          : s
      )
    );
    const addedTarget =
      missingFrameworkBooks.find((b) => b.volume_number === payload.volumeNumber) ||
      missingFrameworkBooks[0];
    triggerConfetti();
    showToast(
      `『${cleanPayloadSeriesTitle} ${payload.volumeNumber}巻』を本棚に登録しました！`
    );
    return { status: 'added', book: addedTarget };
  };

  const handleBulkRegisterCatalog = (
    catalog: CatalogSeries | FetchedCatalogSeries,
    upToVolume: number,
    fromVolume = 1
  ) => {
    const startVol = Math.max(1, Math.min(fromVolume, upToVolume));
    const endVol = Math.max(startVol, upToVolume);
    const detectedMedia: MangaMediaType =
      catalog.media_type ||
      detectMediaType({
        rawTitle: catalog.title,
        publisher: catalog.publisher,
      });
    const baseCleanTitle =
      parseMangaTitleAndVolume(catalog.title).seriesTitle || catalog.title;
    const cleanTitle = formatSeriesTitleWithMedia(baseCleanTitle, detectedMedia);
    const matchedSeries = findMatchingExistingSeries(seriesList, {
      id: catalog.id,
      title: cleanTitle,
      mediaType: detectedMedia,
      publisher: catalog.publisher,
    });

    const volumeMap = new Map(
      ('volumes' in catalog && catalog.volumes ? catalog.volumes : []).map((vm) => [
        vm.volumeNumber,
        vm,
      ])
    );

    if (!matchedSeries) {
      const total = Math.max(catalog.total_published, endVol, 1);
      const repCover =
        volumeMap.get(endVol)?.coverUrl ||
        volumeMap.get(startVol)?.coverUrl ||
        volumeMap.get(1)?.coverUrl ||
        generatePastelCover(
          cleanTitle,
          endVol,
          catalog.author,
          catalog.accent_color
        );

      const newSeries: Series = {
        id: catalog.id,
        title: cleanTitle,
        author: catalog.author,
        publisher: catalog.publisher,
        cover_url: repCover,
        notify_new_release: catalog.status === 'reading',
        status: catalog.status,
        total_published: total,
        media_type: detectedMedia,
        accent_color: catalog.accent_color,
        created_at: new Date().toISOString(),
      };
      setSeriesList((prev) => [newSeries, ...prev]);

      const seedNum = Math.abs(
        catalog.id.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
      );
      const newBooks: Book[] = [];
      for (let v = 1; v <= total; v += 1) {
        const owned = v >= startVol && v <= endVol;
        const apiMeta = volumeMap.get(v);
        newBooks.push({
          id: `${catalog.id}-vol-${v}`,
          series_id: catalog.id,
          isbn: apiMeta?.isbn || buildIsbn(seedNum % 9000, v),
          title: apiMeta?.title || `${cleanTitle} ${v}巻`,
          volume_number: v,
          cover_url:
            apiMeta?.coverUrl ||
            generatePastelCover(
              cleanTitle,
              v,
              catalog.author,
              catalog.accent_color
            ),
          sales_date: apiMeta?.salesDate || '2026-09-01',
          is_owned: owned,
          is_special_edition: false,
          tags: [],
          memo: '',
          registered_at: owned ? new Date().toISOString() : '',
        });
      }
      if (catalog.upcoming_volume) {
        newBooks.push({
          id: `${catalog.id}-vol-${catalog.upcoming_volume.volume_number}`,
          series_id: catalog.id,
          isbn: catalog.upcoming_volume.isbn,
          title: `${cleanTitle} ${catalog.upcoming_volume.volume_number}巻`,
          volume_number: catalog.upcoming_volume.volume_number,
          cover_url: generatePastelCover(
            cleanTitle,
            catalog.upcoming_volume.volume_number,
            catalog.author,
            catalog.accent_color
          ),
          sales_date: catalog.upcoming_volume.sales_date,
          is_owned: false,
          is_special_edition: false,
          tags: [],
          memo: '',
          registered_at: '',
        });
      }
      setBooks((prev) => [...prev, ...newBooks]);
      triggerConfetti();
      showToast(
        `『${cleanTitle}』${startVol}〜${endVol}巻をまとめて登録しました！`
      );
      return;
    }

    // 既存シリーズの場合も既刊総数(total_published)を最新へ拡張し、未生成巻の枠を追加する
    const newTotal = Math.max(
      matchedSeries.total_published,
      catalog.total_published,
      endVol
    );
    const seedNum = Math.abs(
      matchedSeries.id.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
    );

    setSeriesList((prev) =>
      prev.map((s) =>
        s.id === matchedSeries.id
          ? {
              ...s,
              title: cleanTitle,
              media_type: s.media_type || detectedMedia,
              author:
                s.author === '著者情報なし' || s.author === '著者不明'
                  ? catalog.author
                  : s.author,
              publisher:
                s.publisher === '出版社不明' ? catalog.publisher : s.publisher,
              total_published: newTotal,
              cover_url:
                volumeMap.get(endVol)?.coverUrl ||
                volumeMap.get(startVol)?.coverUrl ||
                volumeMap.get(1)?.coverUrl ||
                s.cover_url,
            }
          : s
      )
    );

    setBooks((prev) => {
      const existingByVol = new Map<number, Book>();
      prev.forEach((b) => {
        if (b.series_id === matchedSeries.id) {
          existingByVol.set(b.volume_number, b);
        }
      });

      const updatedExisting = prev.map((b) => {
        if (b.series_id !== matchedSeries.id) return b;
        const apiMeta = volumeMap.get(b.volume_number);
        const shouldOwn =
          b.volume_number >= startVol && b.volume_number <= endVol
            ? true
            : b.is_owned;
        return {
          ...b,
          isbn: apiMeta?.isbn || b.isbn,
          cover_url: apiMeta?.coverUrl || b.cover_url,
          sales_date: apiMeta?.salesDate || b.sales_date,
          is_owned: shouldOwn,
          registered_at:
            shouldOwn && !b.registered_at
              ? new Date().toISOString()
              : b.registered_at,
        };
      });

      const missingBooks: Book[] = [];
      for (let v = 1; v <= newTotal; v += 1) {
        if (existingByVol.has(v)) continue;
        const owned = v >= startVol && v <= endVol;
        const apiMeta = volumeMap.get(v);
        missingBooks.push({
          id: `${matchedSeries.id}-vol-${v}`,
          series_id: matchedSeries.id,
          isbn: apiMeta?.isbn || buildIsbn(seedNum % 9000, v),
          title: apiMeta?.title || `${cleanTitle} ${v}巻`,
          volume_number: v,
          cover_url:
            apiMeta?.coverUrl ||
            generatePastelCover(
              cleanTitle,
              v,
              catalog.author,
              matchedSeries.accent_color || catalog.accent_color
            ),
          sales_date: apiMeta?.salesDate || new Date().toISOString().slice(0, 10),
          is_owned: owned,
          is_special_edition: false,
          tags: [],
          memo: '',
          registered_at: owned ? new Date().toISOString() : '',
        });
      }

      return [...updatedExisting, ...missingBooks];
    });

    triggerConfetti();
    showToast(
      `『${cleanTitle}』${startVol}〜${endVol}巻を所持登録しました！（全${newTotal}巻）`
    );
  };

  const handleResetDemoData = () => {
    setSeriesList([]);
    setBooks([]);
    localStorage.setItem(STORAGE_KEYS.SERIES, '[]');
    localStorage.setItem(STORAGE_KEYS.BOOKS, '[]');
    void saveShelfToIndexedDb([], []);
    showToast('本棚データをすべて削除して初期状態（0冊）に戻しました');
  };

  const isCompactPreview = viewportPreview !== 'auto';
  const frameWidthClass =
    viewportPreview === '320'
      ? 'w-[320px] max-w-full'
      : viewportPreview === '375'
        ? 'w-[375px] max-w-full'
        : 'w-full max-w-5xl';

  if (isLocked) {
    return (
      <div className="app-shell flex items-center justify-center bg-mofu-bg p-4">
        <div className="w-full max-w-xs rounded-3xl bg-white p-6 text-center shadow-mofu-lg border border-mofu-pink/20 space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-mofu-pink/20 text-mofu-pink-dark">
            <Lock className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-base font-extrabold text-mofu-text">
              MofuShelf ロック中
            </h1>
            <p className="mt-1 text-xs text-mofu-muted">
              4桁のパスコードを入力してください（初期値: 1234）
            </p>
          </div>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={passcodeInput}
            onChange={(e) => {
              const val = e.target.value.replace(/[^0-9]/g, '');
              setPasscodeInput(val);
              if (val === settings.passcode) {
                setIsLocked(false);
                setPasscodeInput('');
              }
            }}
            placeholder="••••"
            className="h-12 w-full rounded-2xl border border-mofu-pink/30 bg-mofu-bg text-center text-lg font-extrabold tracking-[0.5em] text-mofu-text focus:border-mofu-pink focus:outline-none"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#F7EFE5]/60 sm:py-3 flex flex-col items-center">
      {/* PC向け iPhone拡大表示（320px / 375px）シミュレータ切り替えバー */}
      <div className="hidden sm:flex items-center gap-2 mb-2.5 rounded-full bg-white/95 px-3 py-1.5 shadow-sm border border-mofu-pink/20 text-xs">
        <Smartphone className="h-3.5 w-3.5 text-mofu-pink-dark" />
        <span className="font-bold text-mofu-muted">画面幅プレビュー:</span>
        {(
          [
            { key: 'auto', label: '全幅レスポンシブ' },
            { key: '320', label: 'iPhone拡大 (320px)' },
            { key: '375', label: 'iPhone標準 (375px)' },
          ] as { key: ViewportPreview; label: string }[]
        ).map((mode) => (
          <button
            key={mode.key}
            type="button"
            onClick={() => setViewportPreview(mode.key)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold transition ${
              viewportPreview === mode.key
                ? 'bg-mofu-pink text-white'
                : 'text-mofu-text hover:bg-mofu-sub'
            }`}
          >
            {mode.label}
          </button>
        ))}
      </div>

      {/* アプリシェル本体 */}
      <div
        className={`${frameWidthClass} flex flex-col bg-mofu-bg text-mofu-text ${
          isCompactPreview
            ? 'relative h-[690px] max-h-[88dvh] overflow-hidden transform-gpu rounded-[32px] border-[6px] border-[#4A3F35] shadow-mofu-lg'
            : 'min-h-[100dvh] sm:min-h-[calc(100dvh-4rem)] overflow-x-clip sm:rounded-3xl sm:shadow-mofu-lg sm:border sm:border-mofu-pink/15'
        }`}
      >
        <div
          className={
            isCompactPreview
              ? 'flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col'
              : 'flex-1 flex flex-col'
          }
        >
        <ConfettiEffect triggerKey={confettiKey} />

        {/* 上部ヘッダー */}
        <header className="sticky top-0 z-30 safe-top-header flex items-center justify-between gap-2 border-b border-mofu-sub bg-mofu-bg/95 px-3.5 pb-2.5 backdrop-blur-sm">
          <div className="flex items-center gap-2 min-w-0">
            <img
              src={`${import.meta.env.BASE_URL}icons/icon-192.svg`}
              alt="MofuShelf"
              className="h-9 w-9 shrink-0 rounded-xl shadow-sm"
            />
            <div className="min-w-0">
              <h1 className="truncate text-sm font-extrabold leading-tight text-mofu-text">
                MofuShelf
              </h1>
              <p className="truncate text-[10px] font-bold text-mofu-muted">
                もふシェルフ・漫画管理
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => switchTab('shopping')}
            className="tap-target shrink-0 inline-flex items-center gap-1 rounded-2xl bg-mofu-sub px-2.5 py-1.5 text-[11px] font-extrabold text-mofu-text active:scale-95 transition"
          >
            <Bell className="h-3.5 w-3.5 text-mofu-pink-dark" />
            <span>通知</span>
            {missingOrUpcomingCount > 0 && (
              <span className="rounded-full bg-mofu-pink px-1.5 py-0.5 text-[10px] leading-none text-white">
                {missingOrUpcomingCount}
              </span>
            )}
          </button>
        </header>

        {/* トーストメッセージ */}
        {toastMessage && (
          <div className="sticky top-14 z-30 mx-3 mt-2 flex items-center gap-1.5 rounded-2xl bg-[#4A3F35] px-3 py-2 text-xs font-bold text-white shadow-mofu animate-pop-bounce">
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-mofu-yellow" />
            <span className="truncate">{toastMessage}</span>
          </div>
        )}

        {/* メインコンテンツ */}
        <main className="flex-1 px-3 pt-3 pb-28">
          {activeTab === 'bookshelf' && (
            <BookshelfView
              seriesList={seriesList}
              books={books}
              isCompactPreview={isCompactPreview}
              onToggleBookOwned={handleToggleBookOwned}
              onBulkOwnedUpTo={handleBulkOwnedUpTo}
              onUpdateSeriesStatus={handleUpdateSeriesStatus}
              onToggleSeriesNotify={handleToggleSeriesNotify}
              onToggleSeriesPin={handleToggleSeriesPin}
              onUpdateBookMeta={handleUpdateBookMeta}
              onDeleteSeries={handleDeleteSeries}
              onNavigateToScan={(tab) => {
                switchTab('scan', tab || 'barcode');
              }}
            />
          )}

          {activeTab === 'scan' && (
            <ScanAndAddView
              key={scanInitialTab}
              initialTab={scanInitialTab}
              seriesList={seriesList}
              books={books}
              rakutenAppId={settings.rakutenAppId}
              geminiApiKey={settings.geminiApiKey}
              onSaveGeminiApiKey={(key) => {
                setSettings((prev) => ({ ...prev, geminiApiKey: key }));
                showToast('Gemini APIキーを保存しました');
              }}
              onRegisterBookByData={handleRegisterBookByData}
              onBulkRegisterCatalog={handleBulkRegisterCatalog}
              onGoToBookshelf={() => switchTab('bookshelf')}
            />
          )}

          {activeTab === 'shopping' && (
            <ShoppingAndNewView
              seriesList={seriesList}
              books={books}
              rakutenAppId={settings.rakutenAppId}
              discordWebhookUrl={settings.discordWebhookUrl}
              browserPushEnabled={settings.browserPushEnabled !== false}
              onMarkBookPurchased={handleToggleBookOwned}
              onApplyDiscoveredVolumes={handleApplyDiscoveredVolumes}
              onShowToast={showToast}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              settings={settings}
              seriesList={seriesList}
              books={books}
              onSaveSettings={setSettings}
              onImportData={({ series, books: importedBooks }) => {
                setSeriesList(series);
                setBooks(importedBooks);
              }}
              onResetDemoData={handleResetDemoData}
              onShowToast={showToast}
            />
          )}
        </main>
        </div>

        {/* 下部フローティング iOS 26 Liquid Glass ナビゲーションバー（流体スライド・常時固定表示） */}
        <nav
          aria-label="メインナビゲーション"
          className="pointer-events-none fixed bottom-2.5 inset-x-0 z-50 px-2.5 pb-[max(0.25rem,env(safe-area-inset-bottom))]"
        >
          <div className="liquid-glass-dock pointer-events-auto relative mx-auto grid w-full max-w-md grid-cols-4 items-center rounded-full p-1.5">
            {/* 流体スライドするガラス水滴インジケータ */}
            <div
              aria-hidden="true"
              className="liquid-glass-slider pointer-events-none absolute top-1.5 bottom-1.5 left-1.5 w-[calc((100%-0.75rem)/4)]"
              style={{
                transform: `translate3d(${
                  (['bookshelf', 'scan', 'shopping', 'settings'] as ActiveTab[]).indexOf(
                    activeTab
                  ) * 100
                }%, 0, 0)`,
              }}
            >
              <div
                key={dropletAnimKey}
                className="liquid-glass-droplet h-full w-full rounded-full"
              />
            </div>

            <button
              type="button"
              onClick={() => switchTab('bookshelf')}
              className={`relative z-10 min-h-[48px] flex flex-col items-center justify-center gap-0.5 rounded-full px-1 py-1 transition-colors duration-300 active:scale-95 ${
                activeTab === 'bookshelf'
                  ? 'text-mofu-pink-dark'
                  : 'text-mofu-text/70 hover:text-mofu-text'
              }`}
            >
              <BookOpen className="h-[18px] w-[18px]" />
              <span className="text-[10px] font-extrabold leading-none">本棚</span>
            </button>

            <button
              type="button"
              onClick={() => switchTab('scan', 'barcode')}
              className={`relative z-10 min-h-[48px] flex flex-col items-center justify-center gap-0.5 rounded-full px-1 py-1 transition-colors duration-300 active:scale-95 ${
                activeTab === 'scan'
                  ? 'text-mofu-pink-dark'
                  : 'text-mofu-text/70 hover:text-mofu-text'
              }`}
            >
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-white shadow-sm transition-transform duration-300 ${
                  activeTab === 'scan'
                    ? 'bg-mofu-pink-dark scale-105'
                    : 'bg-mofu-pink'
                }`}
              >
                <ScanBarcode className="h-3.5 w-3.5" />
              </span>
              <span className="text-[10px] font-extrabold leading-none">
                スキャン
              </span>
            </button>

            <button
              type="button"
              onClick={() => switchTab('shopping')}
              className={`relative z-10 min-h-[48px] flex flex-col items-center justify-center gap-0.5 rounded-full px-1 py-1 transition-colors duration-300 active:scale-95 ${
                activeTab === 'shopping'
                  ? 'text-mofu-pink-dark'
                  : 'text-mofu-text/70 hover:text-mofu-text'
              }`}
            >
              <CalendarHeart className="h-[18px] w-[18px]" />
              <span className="text-[10px] font-extrabold leading-none truncate max-w-full">
                新刊・買物
              </span>
              {missingOrUpcomingCount > 0 && (
                <span className="absolute right-2 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-mofu-pink px-1 text-[9px] font-extrabold text-white shadow-sm">
                  {missingOrUpcomingCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => switchTab('settings')}
              className={`relative z-10 min-h-[48px] flex flex-col items-center justify-center gap-0.5 rounded-full px-1 py-1 transition-colors duration-300 active:scale-95 ${
                activeTab === 'settings'
                  ? 'text-mofu-pink-dark'
                  : 'text-mofu-text/70 hover:text-mofu-text'
              }`}
            >
              <Settings className="h-[18px] w-[18px]" />
              <span className="text-[10px] font-extrabold leading-none">設定</span>
            </button>
          </div>
        </nav>
      </div>
    </div>
  );
}

export default App;
