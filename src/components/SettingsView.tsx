import React, { useEffect, useRef, useState } from 'react';
import {
  BellRing,
  CheckCircle2,
  Cloud,
  Copy,
  Database,
  Download,
  HelpCircle,
  KeyRound,
  Lock,
  PlusSquare,
  QrCode,
  RotateCcw,
  Save,
  Send,
  Smartphone,
  Upload,
} from 'lucide-react';
import {
  PhoneNotificationStatus,
  getPhoneNotificationStatus,
  isIosBrowserWithoutHomeScreen,
  requestPhoneNotificationPermission,
  sendDiscordNewReleaseWebhook,
  sendLocalPushNotification,
} from '../services/notificationService';
import {
  SUPABASE_SCHEMA_SQL,
  syncShelfToSupabase,
} from '../services/storageService';
import { AppSettings, Book, Series } from '../types/manga';

interface SettingsViewProps {
  settings: AppSettings;
  seriesList: Series[];
  books: Book[];
  onSaveSettings: (next: AppSettings) => void;
  onImportData: (payload: { series: Series[]; books: Book[] }) => void;
  onResetDemoData: () => void;
  onShowToast: (msg: string) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  seriesList,
  books,
  onSaveSettings,
  onImportData,
  onResetDemoData,
  onShowToast,
}) => {
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [discordPreviewOpen, setDiscordPreviewOpen] = useState(false);
  const [schemaOpen, setSchemaOpen] = useState(false);
  const [iosGuideOpen, setIosGuideOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const CLOUD_SHARE_URL = 'https://legolanndo.github.io/mofushelf/';
  const LAN_SHARE_URL = 'http://192.168.1.100:5173';
  const [shareUrl, setShareUrl] = useState(() => {
    if (typeof window === 'undefined') return CLOUD_SHARE_URL;
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return CLOUD_SHARE_URL;
    }
    return window.location.href;
  });
  const [swReady, setSwReady] = useState(false);
  const [phoneNotifStatus, setPhoneNotifStatus] = useState<PhoneNotificationStatus>(() =>
    getPhoneNotificationStatus()
  );
  const needsIosHomeScreen = isIosBrowserWithoutHomeScreen();
  const [isSyncing, setIsSyncing] = useState(false);
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<
    (Event & { prompt: () => Promise<void> }) | null
  >(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        setSwReady(Boolean(reg));
      });
    }
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredInstallPrompt(e as Event & { prompt: () => Promise<void> });
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleExportJson = () => {
    const data = {
      app: 'MofuShelf',
      exported_at: new Date().toISOString(),
      series: seriesList,
      books,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mofushelf-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onShowToast('蔵書データをJSONで書き出しました！');
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (Array.isArray(parsed.series) && Array.isArray(parsed.books)) {
          onImportData({ series: parsed.series, books: parsed.books });
          onShowToast('バックアップデータを復元しました！');
        } else {
          onShowToast('JSONの形式が正しくありません。');
        }
      } catch {
        onShowToast('JSONの読み込みに失敗しました。');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-3">
      {/* PWA & ストレージ稼働ステータス */}
      <div className="rounded-3xl bg-mofu-sub p-3.5 border border-mofu-pink/15 space-y-2">
        <div className="flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-mofu-pink-dark" />
          <h2 className="text-sm font-extrabold text-mofu-text">
            PWA・オフライン保存ステータス
          </h2>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="flex items-center gap-1.5 rounded-2xl bg-white px-2.5 py-2 font-bold text-mofu-text">
            <CheckCircle2
              className={`h-4 w-4 shrink-0 ${
                swReady ? 'text-mofu-mint-dark' : 'text-mofu-muted'
              }`}
            />
            <span className="truncate">
              SW: {swReady ? 'オフライン対応中' : '待機/開発モード'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 rounded-2xl bg-white px-2.5 py-2 font-bold text-mofu-text">
            <Database className="h-4 w-4 shrink-0 text-mofu-mint-dark" />
            <span className="truncate">IndexedDB 自動同期</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {deferredInstallPrompt && (
            <button
              type="button"
              onClick={async () => {
                await deferredInstallPrompt.prompt();
                setDeferredInstallPrompt(null);
              }}
              className="min-h-[36px] inline-flex items-center gap-1 rounded-xl bg-mofu-pink px-3 py-1.5 text-[11px] font-extrabold text-white shadow-sm active:scale-95 transition"
            >
              <PlusSquare className="h-3.5 w-3.5" />
              <span>アプリをインストール</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setIosGuideOpen((v) => !v)}
            className="min-h-[36px] inline-flex items-center gap-1 rounded-xl bg-white px-3 py-1.5 text-[11px] font-bold text-mofu-text border border-mofu-pink/20 active:scale-95 transition"
          >
            <HelpCircle className="h-3.5 w-3.5 text-mofu-pink-dark" />
            <span>iPhoneホーム画面追加の手順</span>
          </button>
          <button
            type="button"
            onClick={() => setQrOpen((v) => !v)}
            className="min-h-[36px] inline-flex items-center gap-1 rounded-xl bg-white px-3 py-1.5 text-[11px] font-extrabold text-mofu-pink-dark border border-mofu-pink/25 active:scale-95 transition"
          >
            <QrCode className="h-3.5 w-3.5" />
            <span>QRコードでiPhoneから開く</span>
          </button>
        </div>

        {iosGuideOpen && (
          <ol className="rounded-2xl bg-white p-3 text-[11px] text-mofu-text space-y-1 border border-mofu-pink/15 list-decimal list-inside">
            <li>Safari でこのページを開く</li>
            <li>画面下部の「共有」アイコンをタップ</li>
            <li>「ホーム画面に追加」→ 右上の「追加」をタップ</li>
            <li className="list-none text-[10px] text-mofu-muted pt-0.5">
              ※ 次回からアドレスバーなしの全画面PWAとして起動します。
            </li>
          </ol>
        )}

        {qrOpen && (
          <div className="rounded-2xl bg-white p-3 space-y-2.5 border border-mofu-pink/20">
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setShareUrl(CLOUD_SHARE_URL)}
                className={`rounded-xl px-2.5 py-1 text-[10px] font-extrabold transition ${
                  shareUrl.trim() === CLOUD_SHARE_URL
                    ? 'bg-mofu-pink text-white'
                    : 'bg-mofu-sub text-mofu-text'
                }`}
              >
                クラウドURL（PC不要・HTTPS）
              </button>
              <button
                type="button"
                onClick={() => setShareUrl(LAN_SHARE_URL)}
                className={`rounded-xl px-2.5 py-1 text-[10px] font-extrabold transition ${
                  shareUrl.trim() === LAN_SHARE_URL
                    ? 'bg-mofu-pink text-white'
                    : 'bg-mofu-sub text-mofu-text'
                }`}
              >
                自宅Wi-Fi LAN（PC起動時）
              </button>
            </div>
            <p className="text-[11px] font-bold text-mofu-text">
              iPhone標準カメラで読み取ってアクセスできます（HTTPS公開版はPC電源OFFでもカメラ利用可）：
            </p>
            <div className="flex flex-col items-center">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=8&data=${encodeURIComponent(
                  shareUrl.trim() || CLOUD_SHARE_URL
                )}`}
                alt="iPhone共有用QRコード"
                className="h-36 w-36 rounded-2xl border border-mofu-sub bg-white p-1.5 shadow-sm"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="url"
                value={shareUrl}
                onChange={(e) => setShareUrl(e.target.value)}
                aria-label="共有URL"
                className="h-9 min-w-0 flex-1 rounded-xl border border-mofu-pink/25 bg-mofu-bg px-2.5 font-mono text-[11px] text-mofu-text focus:border-mofu-pink focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(shareUrl.trim());
                  onShowToast('共有URLをコピーしました');
                }}
                className="min-h-[36px] shrink-0 inline-flex items-center gap-1 rounded-xl bg-mofu-sub px-2.5 text-[11px] font-bold text-mofu-text active:scale-95 transition"
              >
                <Copy className="h-3.5 w-3.5" />
                <span>コピー</span>
              </button>
            </div>
            <p className="text-[10px] leading-relaxed text-mofu-muted">
              ※ iPhone実機でカメラバーコード読取を使う場合は、同梱設定で Vercel / Cloudflare Pages（無料HTTPS）へ公開するとSafariのカメラ権限が有効になります。
            </p>
          </div>
        )}
      </div>

      {/* スマホ直接プッシュ通知＆API設定 */}
      <div className="rounded-3xl bg-white p-4 shadow-mofu border border-mofu-pink/15 space-y-3">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-mofu-pink-dark" />
          <h2 className="text-sm font-extrabold text-mofu-text">
            スマホ直接通知・API連携設定
          </h2>
        </div>

        {/* 📱 スマホ（iPhone / Android）直接プッシュ通知セクション */}
        <div className="rounded-2xl bg-mofu-sub/80 p-3 space-y-2.5 border border-mofu-pink/15">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <Smartphone className="h-4 w-4 shrink-0 text-mofu-pink-dark" />
              <span className="text-xs font-extrabold text-mofu-text truncate">
                スマホへの直接通知（Discord不要）
              </span>
            </div>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                phoneNotifStatus === 'granted'
                  ? 'bg-mofu-mint text-mofu-text'
                  : phoneNotifStatus === 'denied'
                    ? 'bg-mofu-pink/20 text-mofu-pink-dark'
                    : 'bg-mofu-yellow text-mofu-text'
              }`}
            >
              {phoneNotifStatus === 'granted'
                ? '許可済み ✅'
                : phoneNotifStatus === 'denied'
                  ? 'ブロック中'
                  : needsIosHomeScreen
                    ? 'ホーム画面追加が必要'
                    : '未設定'}
            </span>
          </div>

          <div className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2">
            <div className="min-w-0">
              <p className="text-xs font-bold text-mofu-text">
                起動時の自動新刊スマホ通知
              </p>
              <p className="text-[10px] text-mofu-muted">
                新刊や3日以内の発売予定がある時にバナー表示
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                const next = {
                  ...draft,
                  browserPushEnabled: !(draft.browserPushEnabled !== false),
                };
                setDraft(next);
                onSaveSettings(next);
                onShowToast(
                  next.browserPushEnabled
                    ? '自動スマホ通知をONにしました'
                    : '自動スマホ通知をOFFにしました'
                );
              }}
              className={`min-h-[34px] shrink-0 rounded-full px-3 text-[11px] font-extrabold transition ${
                draft.browserPushEnabled !== false
                  ? 'bg-mofu-mint text-mofu-text'
                  : 'bg-mofu-sub text-mofu-muted'
              }`}
            >
              {draft.browserPushEnabled !== false ? 'ON' : 'OFF'}
            </button>
          </div>

          <button
            type="button"
            onClick={async () => {
              const res = await requestPhoneNotificationPermission();
              setPhoneNotifStatus(res.status);
              onShowToast(res.message);
            }}
            className="min-h-[42px] w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-mofu-pink px-3 text-xs font-extrabold text-white shadow-sm active:scale-95 transition"
          >
            <BellRing className="h-4 w-4 shrink-0" />
            <span>
              {phoneNotifStatus === 'granted'
                ? '今すぐスマホにテスト通知を送る'
                : 'スマホ通知を許可してテスト送信'}
            </span>
          </button>

          <p className="text-[10px] leading-relaxed text-mofu-muted">
            ※ iPhoneでは「共有 → ホーム画面に追加」から起動すると通知が届きます（iOS標準PWA機能）。アプリを開いていない日の通知も受け取りたい場合は「新刊・買物」タブの「カレンダー通知一括登録」もご利用いただけます。
          </p>
        </div>

        <label className="block text-xs font-bold text-mofu-muted">
          Gemini API Key（表紙AI認識用・任意）
          <input
            type="password"
            value={draft.geminiApiKey}
            onChange={(e) =>
              setDraft((prev) => ({ ...prev, geminiApiKey: e.target.value }))
            }
            placeholder="AIzaSy..."
            className="mt-1 h-11 w-full rounded-2xl border border-mofu-pink/25 bg-mofu-bg px-3 text-sm text-mofu-text focus:border-mofu-pink focus:outline-none"
          />
        </label>

        <label className="block text-xs font-bold text-mofu-muted">
          楽天ブックス アプリID（任意）
          <input
            type="text"
            value={draft.rakutenAppId}
            onChange={(e) =>
              setDraft((prev) => ({ ...prev, rakutenAppId: e.target.value }))
            }
            placeholder="1038..."
            className="mt-1 h-11 w-full rounded-2xl border border-mofu-pink/25 bg-mofu-bg px-3 text-sm text-mofu-text focus:border-mofu-pink focus:outline-none"
          />
        </label>

        <label className="block text-xs font-bold text-mofu-muted">
          Discord Webhook URL（任意・Discordにも通知したい場合）
          <input
            type="url"
            value={draft.discordWebhookUrl}
            onChange={(e) =>
              setDraft((prev) => ({ ...prev, discordWebhookUrl: e.target.value }))
            }
            placeholder="https://discord.com/api/webhooks/..."
            className="mt-1 h-11 w-full rounded-2xl border border-mofu-pink/25 bg-mofu-bg px-3 text-sm text-mofu-text focus:border-mofu-pink focus:outline-none"
          />
        </label>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              onSaveSettings(draft);
              onShowToast('設定をローカルに保存しました');
            }}
            className="min-h-[44px] flex-1 inline-flex items-center justify-center gap-1.5 rounded-2xl bg-mofu-pink px-3 text-xs font-extrabold text-white active:scale-95 transition"
          >
            <Save className="h-4 w-4" />
            設定を保存
          </button>
          <button
            type="button"
            onClick={() => setDiscordPreviewOpen((v) => !v)}
            className="min-h-[44px] shrink-0 inline-flex items-center justify-center gap-1 rounded-2xl bg-mofu-sub px-3 text-xs font-extrabold text-mofu-text"
          >
            <BellRing className="h-4 w-4 text-mofu-pink-dark" />
            通知テスト詳細
          </button>
        </div>

        {discordPreviewOpen && (
          <div className="space-y-2 rounded-2xl bg-[#313338] p-3 text-xs text-white">
            <p className="text-[10px] font-bold text-[#949BA4]">
              Discord Webhook / スマホWebプッシュ 通知テスト
            </p>
            <div className="border-l-4 border-mofu-pink pl-2.5 space-y-0.5">
              <p className="font-extrabold text-mofu-pink">
                📚 新刊がもうすぐ発売されます！
              </p>
              <p className="font-bold">葬送のフリーレン 15巻</p>
              <p className="text-[11px] text-white/80">
                あと3日で発売 ／ 小学館
              </p>
            </div>
            <div className="grid grid-cols-2 gap-1.5 pt-1">
              <button
                type="button"
                onClick={async () => {
                  onSaveSettings(draft);
                  const res = await sendDiscordNewReleaseWebhook({
                    webhookUrl: draft.discordWebhookUrl,
                    upcomingBooks: [],
                  });
                  onShowToast(res.message);
                }}
                className="min-h-[38px] inline-flex items-center justify-center gap-1 rounded-xl bg-[#5865F2] px-2 text-[11px] font-extrabold text-white"
              >
                <Send className="h-3 w-3" />
                Discord実送信
              </button>
              <button
                type="button"
                onClick={async () => {
                  const res = await sendLocalPushNotification({
                    title: 'MofuShelf 新刊テスト通知',
                    body: '購読中のシリーズに新刊のお知らせがあります！',
                  });
                  onShowToast(res.message);
                }}
                className="min-h-[38px] inline-flex items-center justify-center gap-1 rounded-xl bg-mofu-mint px-2 text-[11px] font-extrabold text-mofu-text"
              >
                <BellRing className="h-3 w-3" />
                端末通知テスト
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Supabase クラウド同期（任意） */}
      <div className="rounded-3xl bg-white p-4 shadow-mofu border border-mofu-pink/15 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Cloud className="h-4 w-4 shrink-0 text-mofu-mint-dark" />
            <h2 className="text-sm font-extrabold text-mofu-text truncate">
              Supabase クラウドDB連携
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setSchemaOpen((v) => !v)}
            className="min-h-[32px] shrink-0 rounded-full bg-mofu-sub px-2.5 text-[10px] font-extrabold text-mofu-text"
          >
            SQL表示
          </button>
        </div>

        <input
          type="url"
          value={draft.supabaseUrl || ''}
          onChange={(e) =>
            setDraft((prev) => ({ ...prev, supabaseUrl: e.target.value }))
          }
          placeholder="Supabase Project URL (https://xxx.supabase.co)"
          className="h-10 w-full rounded-2xl border border-mofu-pink/25 bg-mofu-bg px-3 text-xs text-mofu-text focus:border-mofu-pink focus:outline-none"
        />
        <input
          type="password"
          value={draft.supabaseAnonKey || ''}
          onChange={(e) =>
            setDraft((prev) => ({ ...prev, supabaseAnonKey: e.target.value }))
          }
          placeholder="Supabase Anon Key"
          className="h-10 w-full rounded-2xl border border-mofu-pink/25 bg-mofu-bg px-3 text-xs text-mofu-text focus:border-mofu-pink focus:outline-none"
        />

        <button
          type="button"
          disabled={isSyncing}
          onClick={async () => {
            onSaveSettings(draft);
            setIsSyncing(true);
            const res = await syncShelfToSupabase({
              supabaseUrl: draft.supabaseUrl || '',
              supabaseAnonKey: draft.supabaseAnonKey || '',
              seriesList,
              books,
            });
            setIsSyncing(false);
            onShowToast(res.message);
          }}
          className="min-h-[42px] w-full inline-flex items-center justify-center gap-1.5 rounded-2xl bg-mofu-mint px-3 text-xs font-extrabold text-mofu-text active:scale-95 transition disabled:opacity-60"
        >
          <Cloud className="h-4 w-4" />
          <span>{isSyncing ? '同期中...' : 'Supabaseへ蔵書データを同期'}</span>
        </button>

        {schemaOpen && (
          <div className="rounded-2xl bg-[#4A3F35] p-3 text-[10px] text-white space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-mofu-mint">PostgreSQL テーブルSQL</span>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(SUPABASE_SCHEMA_SQL);
                  onShowToast('SQLをコピーしました');
                }}
                className="inline-flex items-center gap-1 rounded-lg bg-white/15 px-2 py-1 text-[10px] font-bold"
              >
                <Copy className="h-3 w-3" />
                コピー
              </button>
            </div>
            <pre className="overflow-x-auto whitespace-pre-wrap font-mono">
              {SUPABASE_SCHEMA_SQL}
            </pre>
          </div>
        )}
      </div>

      {/* 簡易パスコードロック */}
      <div className="rounded-3xl bg-white p-4 shadow-mofu border border-mofu-pink/15 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Lock className="h-4 w-4 shrink-0 text-mofu-pink-dark" />
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-mofu-text">
                簡易パスコードロック
              </p>
              <p className="text-[11px] text-mofu-muted">
                起動時に4桁パスコードを要求します
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              const next = { ...draft, passcodeEnabled: !draft.passcodeEnabled };
              setDraft(next);
              onSaveSettings(next);
            }}
            className={`min-h-[38px] shrink-0 rounded-full px-3.5 text-xs font-extrabold transition ${
              draft.passcodeEnabled
                ? 'bg-mofu-mint text-mofu-text'
                : 'bg-mofu-sub text-mofu-muted'
            }`}
          >
            {draft.passcodeEnabled ? 'ON' : 'OFF'}
          </button>
        </div>
        {draft.passcodeEnabled && (
          <input
            type="text"
            maxLength={4}
            inputMode="numeric"
            value={draft.passcode}
            onChange={(e) => {
              const next = {
                ...draft,
                passcode: e.target.value.replace(/[^0-9]/g, ''),
              };
              setDraft(next);
              onSaveSettings(next);
            }}
            placeholder="4桁数字（例: 1234）"
            className="h-11 w-full rounded-2xl border border-mofu-pink/25 bg-mofu-bg px-3 text-sm font-mono text-mofu-text"
          />
        )}
      </div>

      {/* バックアップ・初期化 */}
      <div className="rounded-3xl bg-white p-4 shadow-mofu border border-mofu-pink/15 space-y-2.5">
        <h2 className="text-sm font-extrabold text-mofu-text">
          データ管理（バックアップ）
        </h2>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleExportJson}
            className="min-h-[44px] flex items-center justify-center gap-1.5 rounded-2xl bg-mofu-sub px-3 text-xs font-extrabold text-mofu-text active:scale-95 transition"
          >
            <Download className="h-4 w-4 text-mofu-pink-dark" />
            JSON書出
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[44px] flex items-center justify-center gap-1.5 rounded-2xl bg-mofu-sub px-3 text-xs font-extrabold text-mofu-text active:scale-95 transition"
          >
            <Upload className="h-4 w-4 text-mofu-mint-dark" />
            JSON読込
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            onChange={handleImportFile}
            className="hidden"
          />
        </div>

        <button
          type="button"
          onClick={onResetDemoData}
          className="min-h-[44px] w-full flex items-center justify-center gap-1.5 rounded-2xl border border-mofu-pink/35 bg-mofu-bg px-3 text-xs font-extrabold text-mofu-pink-dark active:scale-95 transition"
        >
          <RotateCcw className="h-4 w-4" />
          本棚データをすべて削除して空にする（リセット）
        </button>
      </div>
    </div>
  );
};
