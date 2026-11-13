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

export async function sendLocalPushNotification(options: {
  title: string;
  body: string;
}): Promise<{ ok: boolean; message: string }> {
  if (typeof Notification === 'undefined') {
    return { ok: false, message: 'このブラウザは通知APIに対応していません。' };
  }

  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') {
    return { ok: false, message: '通知の許可がオフになっています。' };
  }

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(options.title, {
        body: options.body,
        icon: '/icons/icon-192.svg',
        badge: '/icons/icon-192.svg',
      });
    } else {
      new Notification(options.title, {
        body: options.body,
        icon: '/icons/icon-192.svg',
      });
    }
    return { ok: true, message: '端末にテスト通知を表示しました！' };
  } catch {
    return { ok: false, message: '通知の表示に失敗しました。' };
  }
}
