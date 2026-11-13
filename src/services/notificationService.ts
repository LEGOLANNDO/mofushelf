import { Book, Series } from '../types/manga';
import { formatCountdownLabel } from '../utils/mangaHelpers';

export async function sendDiscordNewReleaseWebhook(options: {
  webhookUrl: string;
  upcomingBooks: { book: Book; series?: Series }[];
}): Promise<{ ok: boolean; message: string }> {
  const url = options.webhookUrl.trim();
  if (!url || !url.startsWith('https://discord.com/api/webhooks/')) {
    return {
      ok: false,
      message: '有効な Discord Webhook URL (https://discord.com/api/webhooks/...) を入力してください。',
    };
  }

  const targets = options.upcomingBooks.slice(0, 5);
  const embeds =
    targets.length > 0
      ? targets.map(({ book, series }) => ({
          title: `📚 ${book.title}`,
          description: `${formatCountdownLabel(book.sales_date)}（発売日: ${book.sales_date}）\n著者: ${series?.author || '不明'} ／ ${series?.publisher || '出版社'}`,
          url: `https://books.rakuten.co.jp/search?sitem=${encodeURIComponent(book.title)}`,
          color: 0xff8fa3,
          thumbnail: book.cover_url.startsWith('http')
            ? { url: book.cover_url }
            : undefined,
        }))
      : [
          {
            title: '📚 MofuShelf テスト通知',
            description: '新刊チェック通知のテスト送信に成功しました！',
            color: 0x7ad9c5,
          },
        ];

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'MofuShelf 新刊お知らせ',
        content:
          targets.length > 0
            ? `✨ まもなく発売の漫画が ${targets.length}件 あります！`
            : '✨ MofuShelf からの通知テストです！',
        embeds,
      }),
    });

    if (!res.ok) {
      return { ok: false, message: `Discord送信エラー (${res.status})` };
    }
    return { ok: true, message: 'Discord Webhookへ新刊通知を送信しました！' };
  } catch {
    return { ok: false, message: 'Discordへの接続に失敗しました。URLをご確認ください。' };
  }
}

export type PhoneNotificationStatus =
  | 'granted'
  | 'denied'
  | 'default'
  | 'unsupported';

export function getPhoneNotificationStatus(): PhoneNotificationStatus {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return 'unsupported';
  }
  return Notification.permission;
}

export function isIosBrowserWithoutHomeScreen(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }
  const ua = navigator.userAgent || '';
  const isIos =
    /iPad|iPhone|iPod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!isIos) return false;
  const standalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
  return !standalone;
}

function getNotificationIconUrl(): string {
  const base = import.meta.env.BASE_URL || '/';
  return `${base.endsWith('/') ? base : `${base}/`}icons/icon-192.svg`;
}

export async function requestPhoneNotificationPermission(): Promise<{
  ok: boolean;
  status: PhoneNotificationStatus;
  message: string;
}> {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    if (isIosBrowserWithoutHomeScreen()) {
      return {
        ok: false,
        status: 'unsupported',
        message:
          'iPhoneでは「共有 → ホーム画面に追加」から起動すると通知をONにできます。',
      };
    }
    return {
      ok: false,
      status: 'unsupported',
      message: 'このブラウザは通知機能に対応していません。',
    };
  }

  let permission: NotificationPermission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }

  if (permission === 'granted') {
    const testRes = await sendLocalPushNotification({
      title: 'MofuShelf スマホ通知がONになりました',
      body: 'これから購読中コミックの新刊情報をスマホへ直接お知らせします！',
    });
    return {
      ok: true,
      status: 'granted',
      message: testRes.ok
        ? 'スマホ通知を許可し、テスト通知を送信しました！'
        : 'スマホ通知を許可しました！（表示にはホーム画面アプリ版をご利用ください）',
    };
  }

  if (permission === 'denied') {
    return {
      ok: false,
      status: 'denied',
      message:
        '端末またはブラウザの設定で通知がブロックされています。設定アプリから通知を許可してください。',
    };
  }

  return {
    ok: false,
    status: 'default',
    message: '通知の許可がキャンセルされました。',
  };
}

export async function sendLocalPushNotification(options: {
  title: string;
  body: string;
}): Promise<{ ok: boolean; message: string }> {
  if (typeof Notification === 'undefined') {
    return {
      ok: false,
      message: isIosBrowserWithoutHomeScreen()
        ? 'iPhoneでは「共有 → ホーム画面に追加」から開くと通知を表示できます。'
        : 'このブラウザは通知APIに対応していません。',
    };
  }

  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') {
    return { ok: false, message: '通知の許可がオフになっています。' };
  }

  const iconUrl = getNotificationIconUrl();

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && reg.active) {
        await reg.showNotification(options.title, {
          body: options.body,
          icon: iconUrl,
          badge: iconUrl,
          tag: 'mofushelf-release-alert',
        });
        return { ok: true, message: 'スマホへ直接通知を表示しました！' };
      }
    }
    new Notification(options.title, {
      body: options.body,
      icon: iconUrl,
      tag: 'mofushelf-release-alert',
    });
    return { ok: true, message: 'スマホへ直接通知を表示しました！' };
  } catch {
    return { ok: false, message: '通知の表示に失敗しました。' };
  }
}

export function downloadReleaseCalendarIcs(
  items: { title: string; releaseDate: string; publisher?: string }[]
): { ok: boolean; message: string } {
  const validItems = items.filter((it) => /^\d{4}-\d{2}-\d{2}$/.test(it.releaseDate));
  if (validItems.length === 0) {
    return { ok: false, message: '有効な発売日が設定された新刊がありません。' };
  }

  const nowStamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const escapeIcs = (str: string) =>
    str.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

  const events = validItems
    .map((item, idx) => {
      const ymd = item.releaseDate.replace(/-/g, '');
      const uid = `mofushelf-${ymd}-${idx}@legolanndo.github.io`;
      return [
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${nowStamp}`,
        `DTSTART:${ymd}T090000`,
        `DTEND:${ymd}T093000`,
        `SUMMARY:${escapeIcs(`📚 発売日: ${item.title}`)}`,
        `DESCRIPTION:${escapeIcs(`MofuShelf 登録コミック発売日${item.publisher ? `（${item.publisher}）` : ''}`)}`,
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${escapeIcs(`今日発売！『${item.title}』`)}`,
        'TRIGGER:PT0M',
        'END:VALARM',
        'END:VEVENT',
      ].join('\r\n');
    })
    .join('\r\n');

  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MofuShelf//Manga Release Reminder//JA',
    'CALSCALE:GREGORIAN',
    events,
    'END:VCALENDAR',
  ].join('\r\n');

  try {
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `mofushelf-release-${validItems.length}.ics`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    return {
      ok: true,
      message: `${validItems.length}件の発売日通知（当日朝9:00）をカレンダーに追加できます！`,
    };
  } catch {
    return { ok: false, message: 'カレンダーデータの作成に失敗しました。' };
  }
}
