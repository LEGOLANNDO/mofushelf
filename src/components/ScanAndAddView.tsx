import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Barcode,
  Camera,
  Check,
  CheckCircle2,
  Globe,
  ImagePlus,
  KeyRound,
  Layers,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  Search,
  ShoppingBag,
  Sparkles,
  X,
} from 'lucide-react';
import { AI_COVER_PRESETS, CATALOG_SERIES } from '../data/mockData';
import {
  FetchedCatalogSeries,
  OPENBD_REAL_SERIES_PRESETS,
  OpenBdVolumeMeta,
  fetchBookByIsbn,
  fetchSeriesByOpenBdPreset,
  normalizeSeriesTitle,
  resolveSeriesPublishedVolumes,
  searchSeriesByKeyword,
} from '../services/bookApi';
import {
  CoverCandidate,
  CoverSearchResponse,
  ExtractedCoverJson,
  extractCoverInfoWithGemini,
  searchCandidatesFromExtractedJson,
} from '../services/geminiCoverService';
import { Book, CatalogSeries, Series } from '../types/manga';
import { generatePastelCover } from '../utils/coverGenerator';
import { validateIsbn13 } from '../utils/mangaHelpers';
import { BarcodeScannerBox } from './BarcodeScannerBox';

export type ScanSubTab = 'barcode' | 'ai_cover' | 'bulk_search';

interface ScanAndAddViewProps {
  initialTab?: ScanSubTab;
  seriesList: Series[];
  books: Book[];
  rakutenAppId: string;
  geminiApiKey: string;
  onSaveGeminiApiKey: (key: string) => void;
  onRegisterBookByData: (payload: {
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
  }) => { status: 'added' | 'updated' | 'duplicate'; book: Book };
  onBulkRegisterCatalog: (
    catalog: CatalogSeries | FetchedCatalogSeries,
    upToVolume: number
  ) => void;
  onGoToBookshelf: () => void;
}

interface ScanHistoryEntry {
  id: string;
  isbn: string;
  title: string;
  source?: 'openbd' | 'rakuten' | 'local';
  result: 'added' | 'duplicate' | 'ignored';
  message: string;
}

export const ScanAndAddView: React.FC<ScanAndAddViewProps> = ({
  initialTab = 'barcode',
  seriesList,
  books,
  rakutenAppId,
  geminiApiKey,
  onSaveGeminiApiKey,
  onRegisterBookByData,
  onBulkRegisterCatalog,
  onGoToBookshelf,
}) => {
  const [activeTab, setActiveTab] = useState<ScanSubTab>(initialTab);

  // 1. バーコード連続スキャン状態
  const [cameraActive, setCameraActive] = useState(true);
  const [manualIsbn, setManualIsbn] = useState('');
  const [isLookingUpIsbn, setIsLookingUpIsbn] = useState(false);
  const [barcodeNotice, setBarcodeNotice] = useState<{
    tone: 'mint' | 'yellow' | 'pink';
    text: string;
    sourceLabel?: string;
  } | null>(null);
  const [duplicateBook, setDuplicateBook] = useState<Book | null>(null);
  const [scanHistory, setScanHistory] = useState<ScanHistoryEntry[]>([]);

  // 2. 表紙AI認識状態（ステップ3）
  const [selectedPresetId, setSelectedPresetId] = useState<string>(AI_COVER_PRESETS[0].id);
  const [uploadedPreviewUrl, setUploadedPreviewUrl] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const [isAnalyzingCover, setIsAnalyzingCover] = useState(false);
  const [coverSearchResult, setCoverSearchResult] = useState<CoverSearchResponse | null>(null);
  const [coverWarning, setCoverWarning] = useState<string | null>(null);
  const [editableExtract, setEditableExtract] = useState<ExtractedCoverJson>({
    title: '',
    volume: 1,
    author: '',
  });
  const [showGeminiKeyBox, setShowGeminiKeyBox] = useState(false);
  const [geminiKeyDraft, setGeminiKeyDraft] = useState(geminiApiKey);

  // 3. タイトル検索＆「ここまで持ってる」一括登録状態
  const [catalogQuery, setCatalogQuery] = useState('');
  const [apiSeriesResults, setApiSeriesResults] = useState<FetchedCatalogSeries[]>([]);
  const [lastQueryResultIds, setLastQueryResultIds] = useState<string[]>([]);
  const [isFetchingSeries, setIsFetchingSeries] = useState(false);
  const [bulkStatusMsg, setBulkStatusMsg] = useState<string | null>(null);
  const [selectedCatalog, setSelectedCatalog] = useState<
    CatalogSeries | FetchedCatalogSeries
  >(CATALOG_SERIES[3]);
  const [upToVolume, setUpToVolume] = useState<number>(12);
  const searchSeqRef = useRef(0);

  // 本棚の既存データ + API取得データ + カタログを正規化タイトル基準で統合（既刊巻数が多い方/API結果を優先）
  const searchableCatalog = useMemo(() => {
    const map = new Map<string, CatalogSeries | FetchedCatalogSeries>();
    const upsert = (c: CatalogSeries | FetchedCatalogSeries, prefer: boolean) => {
      const normKey = normalizeSeriesTitle(c.title) || c.id;
      const existing = map.get(normKey);
      if (
        !existing ||
        prefer ||
        c.total_published > existing.total_published
      ) {
        map.set(normKey, {
          ...c,
          total_published: existing
            ? Math.max(c.total_published, existing.total_published)
            : c.total_published,
        });
      }
    };

    CATALOG_SERIES.forEach((c) => upsert(c, false));
    seriesList.forEach((s) =>
      upsert(
        {
          id: s.id,
          title: s.title,
          author: s.author,
          publisher: s.publisher,
          total_published: s.total_published,
          status: s.status,
          accent_color: s.accent_color || '#FF8FA3',
        },
        false
      )
    );
    apiSeriesResults.forEach((c) => upsert(c, true));
    return Array.from(map.values());
  }, [apiSeriesResults, seriesList]);

  const filteredCatalog = useMemo(() => {
    const q = catalogQuery.trim().toLowerCase();
    if (!q) return searchableCatalog;
    const lastIdSet = new Set(lastQueryResultIds);
    const matched = searchableCatalog.filter(
      (c) =>
        lastIdSet.has(c.id) ||
        c.title.toLowerCase().includes(q) ||
        c.author.toLowerCase().includes(q)
    );
    if (matched.length > 0) return matched;
    if (isFetchingSeries) return searchableCatalog;
    return [
      {
        id: `custom-${q}`,
        title: catalogQuery.trim(),
        author: '新規タイトル作者',
        publisher: 'パステルコミックス',
        total_published: 15,
        status: 'reading' as const,
        accent_color: '#FF8FA3',
      },
    ];
  }, [catalogQuery, searchableCatalog, lastQueryResultIds, isFetchingSeries]);

  const handleSelectCatalog = (cat: CatalogSeries | FetchedCatalogSeries) => {
    setSelectedCatalog(cat);
    const existingSeries = seriesList.find(
      (s) =>
        s.id === cat.id ||
        normalizeSeriesTitle(s.title) === normalizeSeriesTitle(cat.title)
    );
    const existingBooks = books.filter(
      (b) => b.series_id === (existingSeries?.id || cat.id) && b.is_owned
    );
    const currentMax =
      existingBooks.length > 0
        ? Math.max(...existingBooks.map((b) => b.volume_number))
        : cat.total_published;
    setUpToVolume(Math.max(1, Math.min(cat.total_published, currentMax)));
  };

  // ISBNスキャン実行ハンドラ (978/979フィルタ + 重複チェック + openBD/楽天API取得)
  const processScannedIsbn = async (
    rawIsbn: string,
    presetHint?: { series: CatalogSeries; vol: number }
  ) => {
    const check = validateIsbn13(rawIsbn);
    if (!check.valid) {
      setBarcodeNotice({
        tone: check.isSecondRowJan ? 'yellow' : 'pink',
        text: check.reason || '読み取りエラー',
      });
      setScanHistory((prev) => [
        {
          id: `${Date.now()}`,
          isbn: check.cleaned || rawIsbn,
          title: check.isSecondRowJan ? '2段目JANコード (192〜)' : '不正なコード',
          source: 'local',
          result: 'ignored',
          message: check.isSecondRowJan ? '978/979フィルタで無視' : '桁数エラー',
        },
        ...prev.slice(0, 6),
      ]);
      return;
    }

    // 1. まずローカル本棚でISBN重複チェック（オフライン即応）
    const matchedExisting = books.find((b) => b.isbn === check.cleaned);
    if (matchedExisting) {
      if (matchedExisting.is_owned) {
        setDuplicateBook(matchedExisting);
        setBarcodeNotice({
          tone: 'pink',
          text: `重複検知: 『${matchedExisting.title}』はすでに所持しています！`,
        });
        setScanHistory((prev) => [
          {
            id: `${Date.now()}`,
            isbn: check.cleaned,
            title: matchedExisting.title,
            source: 'local',
            result: 'duplicate',
            message: 'すでに所持済み',
          },
          ...prev.slice(0, 6),
        ]);
        return;
      }

      const parentSeries = seriesList.find((s) => s.id === matchedExisting.series_id);
      onRegisterBookByData({
        seriesId: matchedExisting.series_id,
        seriesTitle: parentSeries?.title || matchedExisting.title,
        author: parentSeries?.author || '著者不明',
        publisher: parentSeries?.publisher || 'パステルコミックス',
        totalPublished: parentSeries?.total_published || matchedExisting.volume_number,
        accentColor: parentSeries?.accent_color || '#FF8FA3',
        volumeNumber: matchedExisting.volume_number,
        isbn: check.cleaned,
        isOwned: true,
      });

      setBarcodeNotice({
        tone: 'mint',
        text: `『${matchedExisting.title}』を本棚に登録しました！`,
        sourceLabel: 'ローカル蔵書',
      });
      setScanHistory((prev) => [
        {
          id: `${Date.now()}`,
          isbn: check.cleaned,
          title: matchedExisting.title,
          source: 'local',
          result: 'added',
          message: '所持に登録',
        },
        ...prev.slice(0, 6),
      ]);
      return;
    }

    // 2. openBD API / 楽天ブックスAPIへ問い合わせ
    setIsLookingUpIsbn(true);
    setBarcodeNotice({
      tone: 'mint',
      text: `ISBN ${check.cleaned} の書誌データをAPIから取得中...`,
    });

    try {
      const apiBook = await fetchBookByIsbn(check.cleaned, rakutenAppId);
      if (apiBook) {
        const seriesExtent = await resolveSeriesPublishedVolumes({
          seriesTitle: apiBook.seriesTitle,
          isbn: apiBook.isbn || check.cleaned,
          volumeNumber: apiBook.volumeNumber,
          rakutenAppId,
        });
        const resolvedSeriesTitle =
          seriesExtent.canonicalTitle || apiBook.seriesTitle;
        const seriesSlug =
          seriesExtent.canonicalSeriesId ||
          `api-${normalizeSeriesTitle(resolvedSeriesTitle)}`;

        const res = onRegisterBookByData({
          seriesId: seriesSlug,
          seriesTitle: resolvedSeriesTitle,
          author: apiBook.author,
          publisher: apiBook.publisher,
          totalPublished: Math.max(
            seriesExtent.totalPublished,
            apiBook.volumeNumber
          ),
          accentColor: '#7AD9C5',
          volumeNumber: apiBook.volumeNumber,
          isbn: apiBook.isbn || check.cleaned,
          isOwned: true,
          coverUrl: apiBook.coverUrl,
          salesDate: apiBook.salesDate,
          isSpecialEdition: apiBook.isSpecialEdition,
          volumesMeta: seriesExtent.volumes,
        });

        const srcLabel = apiBook.source === 'openbd' ? 'openBD API' : '楽天ブックスAPI';
        if (res.status === 'duplicate') {
          setDuplicateBook(res.book);
          setBarcodeNotice({
            tone: 'pink',
            text: `重複検知: 『${res.book.title}』はすでに所持しています！`,
            sourceLabel: srcLabel,
          });
          setScanHistory((prev) => [
            {
              id: `${Date.now()}`,
              isbn: check.cleaned,
              title: res.book.title,
              source: apiBook.source === 'openbd' ? 'openbd' : 'rakuten',
              result: 'duplicate',
              message: 'すでに所持済み',
            },
            ...prev.slice(0, 6),
          ]);
        } else {
          setBarcodeNotice({
            tone: 'mint',
            text: `『${apiBook.fullTitle}』を登録しました！（全${seriesExtent.totalPublished}巻中）`,
            sourceLabel: srcLabel,
          });
          setScanHistory((prev) => [
            {
              id: `${Date.now()}`,
              isbn: check.cleaned,
              title: apiBook.fullTitle,
              source: apiBook.source === 'openbd' ? 'openbd' : 'rakuten',
              result: 'added',
              message: `${srcLabel}で登録`,
            },
            ...prev.slice(0, 6),
          ]);
        }
        return;
      }

      // 3. API未収録時のフォールバック（デモプリセットや簡易登録）
      const fallbackSeries = presetHint?.series || CATALOG_SERIES[3];
      const fallbackVol = presetHint?.vol || Number(check.cleaned.slice(-2)) || 1;
      const res = onRegisterBookByData({
        seriesId: fallbackSeries.id,
        seriesTitle: fallbackSeries.title,
        author: fallbackSeries.author,
        publisher: fallbackSeries.publisher,
        totalPublished: Math.max(fallbackSeries.total_published, fallbackVol),
        accentColor: fallbackSeries.accent_color,
        volumeNumber: fallbackVol,
        isbn: check.cleaned,
        isOwned: true,
      });

      if (res.status === 'duplicate') {
        setDuplicateBook(res.book);
      } else {
        setBarcodeNotice({
          tone: 'yellow',
          text: `API未収録のためローカル候補『${res.book.title}』として登録しました。`,
          sourceLabel: 'ローカル補完',
        });
        setScanHistory((prev) => [
          {
            id: `${Date.now()}`,
            isbn: check.cleaned,
            title: res.book.title,
            source: 'local',
            result: 'added',
            message: '補完登録',
          },
          ...prev.slice(0, 6),
        ]);
      }
    } finally {
      setIsLookingUpIsbn(false);
    }
  };

  // デモ・実APIテスト用ワンタップトリガー
  const triggerRealOpenBdSample = (isbn: string) => {
    void processScannedIsbn(isbn);
  };

  const triggerDuplicateDemoScan = () => {
    const ownedBook = books.find((b) => b.is_owned && b.isbn);
    if (ownedBook && ownedBook.isbn) {
      void processScannedIsbn(ownedBook.isbn);
    }
  };

  const triggerSecondRowJanDemo = () => {
    void processScannedIsbn('1929979004804');
  };

  // openBD 実在シリーズ一括取得（認証不要）
  const handleLoadOpenBdPresetSeries = async (presetKey: string) => {
    setIsFetchingSeries(true);
    setBulkStatusMsg('openBD APIから実在シリーズの全巻書誌データを取得中...');
    try {
      const fetched = await fetchSeriesByOpenBdPreset(presetKey);
      if (fetched) {
        setApiSeriesResults((prev) => [
          fetched,
          ...prev.filter((item) => item.id !== fetched.id),
        ]);
        handleSelectCatalog(fetched);
        setBulkStatusMsg(
          `openBD APIから『${fetched.title}』（全${fetched.total_published}巻・書影付き）を取得しました！`
        );
      } else {
        setBulkStatusMsg('openBD APIからデータを取得できませんでした。');
      }
    } catch {
      setBulkStatusMsg(
        'openBD APIへの接続がタイムアウトまたは制限されました。内蔵カタログをお試しください。'
      );
    } finally {
      setIsFetchingSeries(false);
    }
  };

  // APIキー不要マルチソース全巻検索（国会図書館サーチ + iTunes + openBD + 楽天API）
  const executeBulkKeywordSearch = async (rawQuery: string) => {
    const trimmed = rawQuery.trim();
    if (!trimmed) return;
    const seq = ++searchSeqRef.current;
    setIsFetchingSeries(true);
    setBulkStatusMsg(`「${trimmed}」の全巻データを書誌APIから取得中...`);
    try {
      const results = await searchSeriesByKeyword(trimmed, rakutenAppId);
      if (seq !== searchSeqRef.current) return;
      if (results.length > 0) {
        setApiSeriesResults((prev) => {
          const normIds = new Set(results.map((r) => normalizeSeriesTitle(r.title)));
          return [
            ...results,
            ...prev.filter((p) => !normIds.has(normalizeSeriesTitle(p.title))),
          ];
        });
        setLastQueryResultIds(results.map((r) => r.id));
        handleSelectCatalog(results[0]);
        setBulkStatusMsg(
          `『${results[0].title}』など ${results.length}作品を取得（最大 全${results[0].total_published}巻）！`
        );
      } else {
        setLastQueryResultIds([]);
        setBulkStatusMsg(
          '外部書誌APIで該当コミックが見つかりませんでした。下の簡易作成候補または別表記をお試しください。'
        );
      }
    } catch {
      if (seq !== searchSeqRef.current) return;
      setBulkStatusMsg('書誌APIの検索中に通信エラーが発生しました。');
    } finally {
      if (seq === searchSeqRef.current) {
        setIsFetchingSeries(false);
      }
    }
  };

  useEffect(() => {
    if (activeTab !== 'bulk_search') return;
    const trimmed = catalogQuery.trim();
    if (trimmed.length < 2) {
      if (!trimmed) {
        setLastQueryResultIds([]);
      }
      return;
    }
    const timer = window.setTimeout(() => {
      void executeBulkKeywordSearch(trimmed);
    }, 450);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogQuery, activeTab]);

  const handleBulkSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void executeBulkKeywordSearch(catalogQuery);
  };

  // 表紙AI認識実行（画像アップロード or デモプリセット）
  const runCoverAnalysis = async (options: {
    presetId?: string;
    imageDataUrl?: string | null;
    fileName?: string;
  }) => {
    if (options.presetId) {
      setSelectedPresetId(options.presetId);
    }
    setIsAnalyzingCover(true);
    setCoverWarning(null);
    setCoverSearchResult(null);

    try {
      const geminiRes = await extractCoverInfoWithGemini({
        imageDataUrl: options.imageDataUrl,
        fileName: options.fileName,
        presetId: options.presetId,
        geminiApiKey,
      });

      if (geminiRes.warning) {
        setCoverWarning(geminiRes.warning);
      }

      setEditableExtract(geminiRes.extracted);

      const searchRes = await searchCandidatesFromExtractedJson({
        extracted: geminiRes.extracted,
        rakutenAppId,
        seriesList,
      });

      setCoverSearchResult({
        ...searchRes,
        usedLiveGemini: geminiRes.usedLiveGemini,
      });
    } finally {
      setIsAnalyzingCover(false);
    }
  };

  const handleRefineCoverSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editableExtract.title.trim() && !editableExtract.author.trim()) return;
    setIsAnalyzingCover(true);
    try {
      const searchRes = await searchCandidatesFromExtractedJson({
        extracted: editableExtract,
        rakutenAppId,
        seriesList,
      });
      setCoverSearchResult((prev) => ({
        ...searchRes,
        usedLiveGemini: prev?.usedLiveGemini ?? false,
      }));
    } finally {
      setIsAnalyzingCover(false);
    }
  };

  const handleCoverFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const dataUrl = reader.result;
        setUploadedPreviewUrl(dataUrl);
        void runCoverAnalysis({
          imageDataUrl: dataUrl,
          fileName: file.name,
          presetId: selectedPresetId,
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRegisterCoverCandidate = (
    candidate: CoverCandidate,
    isOwned: boolean
  ) => {
    const res = onRegisterBookByData({
      seriesId: candidate.seriesId,
      seriesTitle: candidate.seriesTitle,
      author: candidate.author,
      publisher: candidate.publisher,
      totalPublished: Math.max(candidate.totalPublished, candidate.volumeNumber, 1),
      accentColor: candidate.accentColor,
      volumeNumber: candidate.volumeNumber,
      isbn: candidate.isbn,
      isOwned,
      coverUrl: candidate.coverUrl,
      salesDate: candidate.salesDate,
      volumesMeta: candidate.volumesMeta,
    });
    if (res.status === 'duplicate') {
      setDuplicateBook(res.book);
    }
  };

  return (
    <div className="space-y-3">
      {/* 3つの登録モード切り替えタブ */}
      <div className="grid grid-cols-3 gap-1.5 rounded-2xl bg-mofu-sub p-1.5">
        {(
          [
            { key: 'barcode', label: 'バーコード', icon: Barcode },
            { key: 'ai_cover', label: '表紙AI', icon: Camera },
            { key: 'bulk_search', label: '一括登録', icon: Layers },
          ] as { key: ScanSubTab; label: string; icon: React.ElementType }[]
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`min-h-[44px] flex flex-col sm:flex-row items-center justify-center gap-1 rounded-xl px-1.5 py-1.5 text-[11px] font-extrabold transition ${
                active
                  ? 'bg-white text-mofu-pink-dark shadow-sm'
                  : 'text-mofu-muted hover:text-mofu-text'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 1. バーコード連続スキャンモード */}
      {activeTab === 'barcode' && (
        <div className="space-y-3">
          <div className="rounded-3xl bg-white p-3.5 shadow-mofu border border-mofu-pink/15 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-sm font-extrabold text-mofu-text">
                  バーコード連続スキャン
                </h2>
                <p className="text-[11px] text-mofu-muted">
                  <code className="font-bold text-mofu-pink-dark">978/979</code>{' '}
                  のみ認識 → openBD / 楽天API自動取得
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCameraActive((v) => !v)}
                className={`min-h-[38px] shrink-0 rounded-full px-3 text-[11px] font-extrabold transition ${
                  cameraActive
                    ? 'bg-mofu-mint/35 text-mofu-text'
                    : 'bg-mofu-sub text-mofu-muted'
                }`}
              >
                {cameraActive ? 'カメラON' : 'カメラOFF'}
              </button>
            </div>

            {/* html5-qrcode カメラコンポーネント */}
            <BarcodeScannerBox
              active={cameraActive}
              onToggleActive={() => setCameraActive((v) => !v)}
              onDetectedIsbn={(isbn) => {
                void processScannedIsbn(isbn);
              }}
              onIgnoredJan={(jan) => {
                void processScannedIsbn(jan);
              }}
            />

            {/* 手動ISBN入力 */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (manualIsbn.trim()) {
                  void processScannedIsbn(manualIsbn);
                  setManualIsbn('');
                }
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                inputMode="numeric"
                value={manualIsbn}
                onChange={(e) => setManualIsbn(e.target.value)}
                placeholder="ISBN13桁を入力 (例: 9784098501809)"
                className="h-11 min-w-0 flex-1 rounded-2xl border border-mofu-pink/25 bg-mofu-bg px-3 text-sm text-mofu-text focus:border-mofu-pink focus:outline-none"
              />
              <button
                type="submit"
                disabled={isLookingUpIsbn}
                className="min-h-[44px] shrink-0 inline-flex items-center justify-center rounded-2xl bg-mofu-mint px-4 text-xs font-extrabold text-mofu-text active:scale-95 transition disabled:opacity-60"
              >
                {isLookingUpIsbn ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  '検索登録'
                )}
              </button>
            </form>

            {barcodeNotice && (
              <div
                className={`rounded-2xl p-3 text-xs font-bold space-y-1 ${
                  barcodeNotice.tone === 'mint'
                    ? 'bg-mofu-mint/30 text-mofu-text'
                    : barcodeNotice.tone === 'yellow'
                      ? 'bg-mofu-yellow/55 text-mofu-text'
                      : 'bg-mofu-pink/20 text-mofu-pink-dark'
                }`}
              >
                {barcodeNotice.sourceLabel && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-extrabold text-mofu-text">
                    <Globe className="h-3 w-3 text-mofu-mint-dark" />
                    {barcodeNotice.sourceLabel}
                  </span>
                )}
                <p>{barcodeNotice.text}</p>
              </div>
            )}

            {/* 実openBD APIテスト & フィルタ動作テスト */}
            <div className="space-y-1.5 pt-1 border-t border-mofu-sub">
              <p className="text-[11px] font-bold text-mofu-muted">
                ワンタップ実API読取・フィルタテスト
              </p>
              <button
                type="button"
                disabled={isLookingUpIsbn}
                onClick={() => triggerRealOpenBdSample('9784098501809')}
                className="min-h-[44px] w-full flex items-center justify-between gap-2 rounded-2xl bg-mofu-pink px-3.5 py-2 text-left text-xs font-extrabold text-white shadow-sm active:scale-[0.98] transition disabled:opacity-60"
              >
                <span className="truncate">
                  ① 実ISBN読取: 葬送のフリーレン 1巻 (openBD)
                </span>
                <Sparkles className="h-4 w-4 shrink-0" />
              </button>
              <button
                type="button"
                disabled={isLookingUpIsbn}
                onClick={() => triggerRealOpenBdSample('9784088820118')}
                className="min-h-[44px] w-full flex items-center justify-between gap-2 rounded-2xl bg-mofu-mint/45 px-3.5 py-2 text-left text-xs font-extrabold text-mofu-text active:scale-[0.98] transition disabled:opacity-60"
              >
                <span className="truncate">
                  ② 実ISBN読取: SPY×FAMILY 1巻 (openBD)
                </span>
                <Globe className="h-4 w-4 shrink-0 text-mofu-mint-dark" />
              </button>
              <button
                type="button"
                onClick={triggerDuplicateDemoScan}
                className="min-h-[44px] w-full flex items-center justify-between gap-2 rounded-2xl bg-mofu-yellow/75 px-3.5 py-2 text-left text-xs font-extrabold text-mofu-text active:scale-[0.98] transition"
              >
                <span className="truncate">③ 所持済みISBN読取（重複警告テスト）</span>
                <AlertTriangle className="h-4 w-4 shrink-0 text-mofu-pink-dark" />
              </button>
              <button
                type="button"
                onClick={triggerSecondRowJanDemo}
                className="min-h-[44px] w-full flex items-center justify-between gap-2 rounded-2xl bg-mofu-sub px-3.5 py-2 text-left text-xs font-bold text-mofu-text active:scale-[0.98] transition"
              >
                <span className="truncate">④ 下段JANコード (192... 自動無視テスト)</span>
                <AlertCircle className="h-4 w-4 shrink-0 text-mofu-muted" />
              </button>
            </div>
          </div>

          {/* 連続スキャン履歴 */}
          {scanHistory.length > 0 && (
            <div className="rounded-3xl bg-mofu-sub p-3.5">
              <p className="mb-2 text-xs font-extrabold text-mofu-text">
                連続スキャン履歴
              </p>
              <div className="space-y-1.5">
                {scanHistory.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-bold text-mofu-text">{item.title}</p>
                      <p className="font-mono text-[10px] text-mofu-muted">{item.isbn}</p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                        item.result === 'added'
                          ? 'bg-mofu-mint/35 text-mofu-text'
                          : item.result === 'duplicate'
                            ? 'bg-mofu-pink/25 text-mofu-pink-dark'
                            : 'bg-mofu-yellow/60 text-mofu-text'
                      }`}
                    >
                      {item.message}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2. 表紙カメラAI認識モード（ステップ3: Gemini API JSON抽出 + 候補検索） */}
      {activeTab === 'ai_cover' && (
        <div className="space-y-3">
          <div className="rounded-3xl bg-white p-3.5 shadow-mofu border border-mofu-pink/15 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-sm font-extrabold text-mofu-text">
                  表紙カメラAI認識（シュリンク対策）
                </h2>
                <p className="text-[11px] text-mofu-muted">
                  表紙画像から Gemini 2.5 Flash で JSON を抽出し、書籍候補を検索します。
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowGeminiKeyBox((v) => !v)}
                className={`min-h-[36px] shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 text-[10px] font-extrabold transition ${
                  geminiApiKey.trim()
                    ? 'bg-mofu-mint/35 text-mofu-text'
                    : 'bg-mofu-sub text-mofu-muted'
                }`}
              >
                <KeyRound className="h-3 w-3" />
                <span>{geminiApiKey.trim() ? 'Gemini連携中' : 'APIキー設定'}</span>
              </button>
            </div>

            {showGeminiKeyBox && (
              <div className="rounded-2xl bg-mofu-sub p-2.5 space-y-2">
                <p className="text-[10px] font-bold text-mofu-muted">
                  Gemini API Key を入力すると、アップロード画像を実際に Gemini 2.5 Flash へ送信します（未設定時はデモ推定で動作）。
                </p>
                <div className="flex gap-1.5">
                  <input
                    type="password"
                    value={geminiKeyDraft}
                    onChange={(e) => setGeminiKeyDraft(e.target.value)}
                    placeholder="AIzaSy..."
                    className="h-10 min-w-0 flex-1 rounded-xl border border-mofu-pink/25 bg-white px-2.5 text-xs text-mofu-text"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      onSaveGeminiApiKey(geminiKeyDraft.trim());
                      setShowGeminiKeyBox(false);
                    }}
                    className="min-h-[40px] shrink-0 rounded-xl bg-mofu-pink px-3 text-xs font-extrabold text-white"
                  >
                    保存
                  </button>
                </div>
              </div>
            )}

            <label className="flex min-h-[56px] cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-mofu-pink/50 bg-mofu-sub/60 px-3 py-3 text-xs font-extrabold text-mofu-pink-dark hover:bg-mofu-sub transition">
              <ImagePlus className="h-5 w-5 shrink-0" />
              <span>表紙写真を撮影 / 画像アップロード</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleCoverFileChange}
                className="hidden"
              />
            </label>

            {uploadedPreviewUrl && (
              <div className="flex items-center gap-3 rounded-2xl bg-mofu-sub p-2.5">
                <img
                  src={uploadedPreviewUrl}
                  alt="アップロード表紙プレビュー"
                  className="h-16 w-12 shrink-0 rounded-xl object-cover shadow-sm"
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="truncate text-xs font-extrabold text-mofu-text">
                    {uploadedFileName || '選択した表紙画像'}
                  </p>
                  <button
                    type="button"
                    disabled={isAnalyzingCover}
                    onClick={() =>
                      void runCoverAnalysis({
                        imageDataUrl: uploadedPreviewUrl,
                        fileName: uploadedFileName,
                        presetId: selectedPresetId,
                      })
                    }
                    className="min-h-[34px] inline-flex items-center gap-1 rounded-xl bg-white px-2.5 text-[11px] font-extrabold text-mofu-pink-dark shadow-sm"
                  >
                    <RefreshCw className="h-3 w-3" />
                    この画像を再解析
                  </button>
                </div>
              </div>
            )}

            <div>
              <p className="mb-1.5 text-[11px] font-bold text-mofu-muted">
                デモ表紙でAI認識＆候補検索を試す:
              </p>
              <div className="space-y-1.5">
                {AI_COVER_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    disabled={isAnalyzingCover}
                    onClick={() => {
                      setUploadedPreviewUrl(null);
                      setUploadedFileName('');
                      void runCoverAnalysis({ presetId: preset.id });
                    }}
                    className={`min-h-[44px] w-full flex items-center justify-between gap-2 rounded-2xl px-3 py-2 text-left text-xs font-bold transition disabled:opacity-60 ${
                      selectedPresetId === preset.id && coverSearchResult
                        ? 'bg-mofu-pink text-white'
                        : 'bg-mofu-sub text-mofu-text hover:bg-mofu-pink/15'
                    }`}
                  >
                    <span className="truncate">{preset.label}</span>
                    <Sparkles className="h-4 w-4 shrink-0" />
                  </button>
                ))}
              </div>
            </div>

            {isAnalyzingCover && (
              <div className="rounded-2xl bg-mofu-sub p-4 text-center space-y-1">
                <Loader2 className="mx-auto h-5 w-5 animate-spin text-mofu-pink-dark" />
                <p className="text-xs font-extrabold text-mofu-pink-dark">
                  Gemini 2.5 Flash で表紙の文字を解析＆候補検索中...
                </p>
              </div>
            )}

            {coverWarning && (
              <div className="rounded-2xl bg-mofu-yellow/55 p-2.5 text-[11px] font-bold text-mofu-text">
                {coverWarning}
              </div>
            )}

            {!isAnalyzingCover && coverSearchResult && (
              <div className="space-y-3 pt-1">
                {/* 抽出JSON表示 */}
                <div className="rounded-2xl bg-[#4A3F35] p-3 text-[11px] text-[#FFFDF9] font-mono overflow-x-auto">
                  <div className="mb-1 flex items-center justify-between gap-2 font-sans">
                    <span className="text-[10px] font-bold text-mofu-mint">
                      AI抽出JSON結果:
                    </span>
                    <span className="rounded-full bg-white/15 px-2 py-0.5 text-[9px] font-bold text-white">
                      {coverSearchResult.usedLiveGemini
                        ? 'Gemini 2.5 Flash 実応答'
                        : 'ローカルAIシミュレート'}
                    </span>
                  </div>
                  <pre className="whitespace-pre-wrap break-all">
                    {JSON.stringify(coverSearchResult.extracted, null, 2)}
                  </pre>
                </div>

                {/* 抽出キーワードの微調整＆再検索フォーム */}
                <form
                  onSubmit={(e) => void handleRefineCoverSearch(e)}
                  className="rounded-2xl bg-mofu-sub p-2.5 space-y-2"
                >
                  <p className="text-[10px] font-bold text-mofu-muted">
                    抽出結果の微調整・再検索:
                  </p>
                  <div className="grid grid-cols-12 gap-1.5">
                    <input
                      type="text"
                      value={editableExtract.title}
                      onChange={(e) =>
                        setEditableExtract((prev) => ({
                          ...prev,
                          title: e.target.value,
                        }))
                      }
                      placeholder="作品名"
                      className="col-span-8 h-10 rounded-xl border border-mofu-pink/20 bg-white px-2.5 text-xs text-mofu-text"
                    />
                    <input
                      type="number"
                      min={1}
                      value={editableExtract.volume}
                      onChange={(e) =>
                        setEditableExtract((prev) => ({
                          ...prev,
                          volume: Math.max(1, Number(e.target.value) || 1),
                        }))
                      }
                      placeholder="巻"
                      className="col-span-4 h-10 rounded-xl border border-mofu-pink/20 bg-white px-2 text-xs text-mofu-text"
                    />
                  </div>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={editableExtract.author}
                      onChange={(e) =>
                        setEditableExtract((prev) => ({
                          ...prev,
                          author: e.target.value,
                        }))
                      }
                      placeholder="著者名"
                      className="h-10 min-w-0 flex-1 rounded-xl border border-mofu-pink/20 bg-white px-2.5 text-xs text-mofu-text"
                    />
                    <button
                      type="submit"
                      className="min-h-[40px] shrink-0 rounded-xl bg-mofu-mint px-3 text-xs font-extrabold text-mofu-text active:scale-95 transition"
                    >
                      再検索
                    </button>
                  </div>
                </form>

                {coverSearchResult.authorFallbackUsed && (
                  <div className="rounded-2xl bg-mofu-yellow/55 p-2.5 text-[11px] font-bold text-mofu-text">
                    タイトル検索が0件だったため、著者名「
                    {coverSearchResult.extracted.author}」で再検索しました！
                  </div>
                )}

                {/* 書籍候補リスト */}
                <div className="space-y-2">
                  <p className="text-[11px] font-extrabold text-mofu-text">
                    書籍候補 ({coverSearchResult.candidates.length}件)
                  </p>
                  {coverSearchResult.candidates.map((cand) => {
                    const fallbackCover = generatePastelCover(
                      cand.seriesTitle,
                      cand.volumeNumber,
                      cand.author,
                      cand.accentColor
                    );
                    return (
                      <div
                        key={cand.id}
                        className="flex items-center gap-2.5 rounded-2xl border border-mofu-mint bg-mofu-mint/15 p-2.5"
                      >
                        <img
                          src={cand.coverUrl}
                          alt={cand.title}
                          onError={(e) => {
                            e.currentTarget.src = fallbackCover;
                          }}
                          className="h-24 w-16 shrink-0 rounded-xl object-cover shadow-sm"
                        />
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className="rounded-full bg-white px-2 py-0.5 text-[9px] font-extrabold text-mofu-mint-dark">
                              {cand.source === 'openbd'
                                ? 'openBD実書誌'
                                : cand.source === 'rakuten'
                                  ? '楽天ブックス'
                                  : 'カタログ候補'}
                            </span>
                            <span className="text-[10px] font-bold text-mofu-muted truncate">
                              {cand.publisher}
                            </span>
                          </div>
                          <h3 className="text-xs font-extrabold text-mofu-text line-clamp-2">
                            {cand.title}
                          </h3>
                          <p className="truncate text-[11px] text-mofu-muted">
                            {cand.author}
                          </p>
                          <div className="flex gap-1.5 pt-0.5">
                            <button
                              type="button"
                              onClick={() =>
                                handleRegisterCoverCandidate(cand, true)
                              }
                              className="min-h-[38px] flex-1 rounded-xl bg-mofu-pink px-2.5 py-1.5 text-[11px] font-extrabold text-white active:scale-95 transition"
                            >
                              1タップ所持登録
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleRegisterCoverCandidate(cand, false)
                              }
                              aria-label="買うリストに追加"
                              title="買うリストに追加"
                              className="min-h-[38px] shrink-0 inline-flex items-center justify-center rounded-xl bg-white px-2.5 text-[11px] font-extrabold text-mofu-text border border-mofu-pink/25 active:scale-95 transition"
                            >
                              <ShoppingBag className="h-3.5 w-3.5 text-mofu-pink-dark" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. タイトル検索＆「ここまで持ってる」一括登録モード */}
      {activeTab === 'bulk_search' && (
        <div className="space-y-3">
          <div className="rounded-3xl bg-white p-3.5 shadow-mofu border border-mofu-pink/15 space-y-2.5">
            <div>
              <h2 className="text-sm font-extrabold text-mofu-text">
                タイトル検索＆一括登録
              </h2>
              <p className="text-[11px] text-mofu-muted">
                iTunes・openBD（APIキー不要）や楽天ブックスAPIから全既刊を取得し、「1巻〜○巻まで」まとめて登録できます。
              </p>
            </div>

            <form onSubmit={handleBulkSearchSubmit} className="flex gap-1.5">
              <div className="relative flex-1 min-w-0">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mofu-muted" />
                <input
                  type="search"
                  value={catalogQuery}
                  onChange={(e) => setCatalogQuery(e.target.value)}
                  placeholder="作品名を入力 (例: ダンダダン)..."
                  className="h-11 w-full rounded-2xl border border-mofu-pink/25 bg-mofu-bg pl-9 pr-3 text-sm text-mofu-text focus:border-mofu-pink focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={isFetchingSeries}
                className="min-h-[44px] shrink-0 rounded-2xl bg-mofu-mint px-3 text-xs font-extrabold text-mofu-text active:scale-95 transition disabled:opacity-60"
              >
                {isFetchingSeries ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  '全巻検索'
                )}
              </button>
            </form>

            {/* openBD + マルチソース 実在シリーズ全巻取得ボタン (認証不要) */}
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-mofu-muted flex items-center gap-1">
                <Globe className="h-3 w-3 text-mofu-mint-dark" />
                実データ全巻取得（APIキー不要）:
              </p>
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                {OPENBD_REAL_SERIES_PRESETS.map((preset) => (
                  <button
                    key={preset.key}
                    type="button"
                    disabled={isFetchingSeries}
                    onClick={() => void handleLoadOpenBdPresetSeries(preset.key)}
                    className="min-h-[38px] shrink-0 rounded-full border border-mofu-mint bg-mofu-mint/20 px-3 py-1 text-[11px] font-extrabold text-mofu-text hover:bg-mofu-mint/35 transition disabled:opacity-60"
                  >
                    + {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {bulkStatusMsg && (
              <p className="rounded-xl bg-mofu-sub px-2.5 py-2 text-[11px] font-bold text-mofu-text">
                {bulkStatusMsg}
              </p>
            )}

            {/* 候補ピル横スクロール */}
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
              {filteredCatalog.map((cat) => {
                const selected = selectedCatalog.id === cat.id;
                const alreadyInShelf = seriesList.some(
                  (s) =>
                    s.id === cat.id ||
                    normalizeSeriesTitle(s.title) === normalizeSeriesTitle(cat.title)
                );
                const isApi = 'source' in cat;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => handleSelectCatalog(cat)}
                    className={`min-h-[40px] shrink-0 rounded-2xl px-3 py-1.5 text-left text-xs font-bold transition border ${
                      selected
                        ? 'border-mofu-pink bg-mofu-pink text-white shadow-sm'
                        : 'border-mofu-sub bg-mofu-sub text-mofu-text'
                    }`}
                  >
                    <span>{cat.title}</span>
                    <span
                      className={`ml-1 text-[10px] font-extrabold ${
                        selected ? 'text-white/90' : 'text-mofu-muted'
                      }`}
                    >
                      ({cat.total_published}巻)
                    </span>
                    {isApi ? (
                      <span
                        className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-extrabold ${
                          selected
                            ? 'bg-white text-mofu-pink-dark'
                            : 'bg-mofu-yellow text-mofu-text'
                        }`}
                      >
                        実API
                      </span>
                    ) : !alreadyInShelf ? (
                      <span
                        className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-extrabold ${
                          selected
                            ? 'bg-white text-mofu-pink-dark'
                            : 'bg-mofu-mint text-mofu-text'
                        }`}
                      >
                        新登録
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 「ここまで持ってる」一括登録パネル */}
          <div className="rounded-3xl bg-white p-3.5 shadow-mofu border border-mofu-pink/15 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-extrabold text-mofu-text leading-snug">
                  {selectedCatalog.title}
                </h3>
                <p className="text-[11px] text-mofu-muted">
                  {selectedCatalog.author} ／ 既刊 {selectedCatalog.total_published}巻
                </p>
              </div>
              <button
                type="button"
                onClick={() => setUpToVolume(selectedCatalog.total_published)}
                className="shrink-0 rounded-full bg-mofu-sub px-2.5 py-1 text-[11px] font-extrabold text-mofu-pink-dark hover:bg-mofu-pink/15 active:scale-95 transition"
              >
                全{selectedCatalog.total_published}巻を選択
              </button>
            </div>

            <div className="rounded-2xl bg-mofu-sub p-3 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setUpToVolume((v) => Math.max(1, v - 1))}
                  aria-label="巻数を1減らす"
                  className="tap-target flex items-center justify-center rounded-2xl bg-white text-mofu-text shadow-sm active:scale-95 transition"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <div className="flex-1 text-center">
                  <span className="text-base font-extrabold text-mofu-text">
                    1巻 〜 {upToVolume}巻
                  </span>
                  <p className="text-[10px] font-bold text-mofu-muted">
                    下の表紙タップでも巻数を指定できます
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setUpToVolume((v) =>
                      Math.min(selectedCatalog.total_published, v + 1)
                    )
                  }
                  aria-label="巻数を1増やす"
                  className="tap-target flex items-center justify-center rounded-2xl bg-white text-mofu-text shadow-sm active:scale-95 transition"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              <input
                type="range"
                min={1}
                max={selectedCatalog.total_published}
                value={upToVolume}
                onChange={(e) => setUpToVolume(Number(e.target.value))}
                className="w-full accent-[#FF8FA3]"
              />

              <button
                type="button"
                onClick={() => {
                  onBulkRegisterCatalog(selectedCatalog, upToVolume);
                }}
                className="min-h-[48px] w-full flex items-center justify-center gap-1.5 rounded-2xl bg-mofu-pink px-4 py-3 text-sm font-extrabold text-white shadow-mofu active:scale-[0.98] transition"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>1巻〜{upToVolume}巻までまとめて所持登録！</span>
              </button>
            </div>

            {/* 既刊表紙グリッド */}
            <div className="grid grid-cols-4 gap-1.5">
              {Array.from(
                { length: selectedCatalog.total_published },
                (_, idx) => idx + 1
              ).map((vol) => {
                const included = vol <= upToVolume;
                const apiVol =
                  'volumes' in selectedCatalog
                    ? selectedCatalog.volumes?.find((v) => v.volumeNumber === vol)
                    : undefined;
                const fallbackCover = generatePastelCover(
                  selectedCatalog.title,
                  vol,
                  selectedCatalog.author,
                  selectedCatalog.accent_color
                );
                return (
                  <button
                    key={vol}
                    type="button"
                    onClick={() => setUpToVolume(vol)}
                    className={`relative overflow-hidden rounded-xl border p-1 text-center transition ${
                      included
                        ? 'border-mofu-pink bg-mofu-pink/10 ring-1 ring-mofu-pink/40'
                        : 'border-mofu-sub bg-mofu-bg opacity-65'
                    }`}
                  >
                    <div className="relative aspect-[5/7] overflow-hidden rounded-lg">
                      <img
                        src={apiVol?.coverUrl || fallbackCover}
                        alt={`${selectedCatalog.title} ${vol}巻`}
                        onError={(e) => {
                          e.currentTarget.src = fallbackCover;
                        }}
                        className="h-full w-full object-cover"
                      />
                      {included && (
                        <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-mofu-pink text-white shadow">
                          <Check className="h-3 w-3" />
                        </span>
                      )}
                    </div>
                    <span className="mt-0.5 block text-[10px] font-extrabold text-mofu-text">
                      {vol}巻
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={onGoToBookshelf}
              className="min-h-[44px] w-full rounded-2xl bg-mofu-sub text-xs font-extrabold text-mofu-text hover:bg-mofu-pink/15 transition"
            >
              本棚へ戻って確認する
            </button>
          </div>
        </div>
      )}

      {/* 重複購入防止アラートモーダル */}
      {duplicateBook && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-mofu-text/55 p-4"
          role="alertdialog"
          aria-modal="true"
        >
          <div className="w-full max-w-xs rounded-3xl border-4 border-mofu-yellow bg-mofu-bg p-5 text-center shadow-mofu-lg animate-pop-bounce">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-mofu-pink text-white shadow-mofu">
              <AlertTriangle className="h-8 w-8" />
            </div>
            <h3 className="mt-3 text-lg font-extrabold text-mofu-pink-dark">
              すでに持っています！
            </h3>
            <p className="mt-1 text-xs font-bold text-mofu-muted">
              重複購入ストップ！この巻は本棚に登録済みです。
            </p>

            <div className="mt-3 flex items-center gap-3 rounded-2xl bg-mofu-sub p-3 text-left">
              <img
                src={duplicateBook.cover_url}
                alt={duplicateBook.title}
                onError={(e) => {
                  e.currentTarget.src = generatePastelCover(
                    duplicateBook.title,
                    duplicateBook.volume_number
                  );
                }}
                className="h-20 w-14 shrink-0 rounded-xl object-cover shadow-sm"
              />
              <div className="min-w-0">
                <p className="text-xs font-extrabold text-mofu-text line-clamp-2">
                  {duplicateBook.title}
                </p>
                {duplicateBook.isbn && (
                  <p className="mt-0.5 font-mono text-[10px] text-mofu-muted">
                    {duplicateBook.isbn}
                  </p>
                )}
                {duplicateBook.memo && (
                  <p className="mt-1 rounded-lg bg-white px-2 py-0.5 text-[10px] font-bold text-mofu-pink-dark">
                    メモ: {duplicateBook.memo}
                  </p>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setDuplicateBook(null)}
              className="mt-4 min-h-[44px] w-full inline-flex items-center justify-center gap-1 rounded-2xl bg-mofu-pink text-sm font-extrabold text-white shadow-sm active:scale-95 transition"
            >
              <X className="h-4 w-4" />
              OK（買わずに閉じる）
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
