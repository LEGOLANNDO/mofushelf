export type SeriesStatus = 'reading' | 'completed' | 'dropped';

export type BookTag = '特装版' | '店舗特典あり' | '友達に貸出中' | 'サイン本';

export const BOOK_TAGS: BookTag[] = [
  '特装版',
  '店舗特典あり',
  '友達に貸出中',
  'サイン本',
];

export interface Series {
  id: string;
  title: string;
  author: string;
  publisher: string;
  cover_url: string;
  notify_new_release: boolean;
  status: SeriesStatus;
  total_published: number;
  accent_color?: string;
  created_at: string;
}

export interface Book {
  id: string;
  series_id: string;
  isbn: string | null;
  title: string;
  volume_number: number;
  cover_url: string;
  sales_date: string;
  is_owned: boolean;
  is_special_edition: boolean;
  tags: BookTag[];
  memo: string;
  registered_at: string;
}

export interface CatalogSeries {
  id: string;
  title: string;
  author: string;
  publisher: string;
  total_published: number;
  status: SeriesStatus;
  accent_color: string;
  upcoming_volume?: {
    volume_number: number;
    sales_date: string;
    isbn: string;
  };
}

export interface AppSettings {
  geminiApiKey: string;
  rakutenAppId: string;
  discordWebhookUrl: string;
  browserPushEnabled?: boolean;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  passcodeEnabled: boolean;
  passcode: string;
}

export type ActiveTab = 'bookshelf' | 'scan' | 'shopping' | 'settings';
export type ViewportPreview = 'auto' | '320' | '375';
