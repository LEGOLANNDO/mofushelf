import { AI_COVER_PRESETS, CATALOG_SERIES, buildIsbn } from '../data/mockData';
import { Series } from '../types/manga';
import { generatePastelCover } from '../utils/coverGenerator';
import {
  OPENBD_REAL_SERIES_PRESETS,
  OpenBdVolumeMeta,
  fetchBookByIsbn,
  fetchSeriesByOpenBdPreset,
  normalizeSeriesTitle,
  resolveSeriesPublishedVolumes,
  searchSeriesFromRakuten,
} from './bookApi';

export interface ExtractedCoverJson {
  title: string;
  volume: number;
  author: string;
}

export interface CoverCandidate {
  id: string;
  seriesId: string;
  title: string;
  seriesTitle: string;
  volumeNumber: number;
  totalPublished: number;
  volumesMeta?: OpenBdVolumeMeta[];
  author: string;
  publisher: string;
  isbn: string;
  coverUrl: string;
  salesDate: string;
  accentColor: string;
  source: 'rakuten' | 'openbd' | 'catalog';
}

export interface CoverSearchResponse {
  extracted: ExtractedCoverJson;
  usedLiveGemini: boolean;
  authorFallbackUsed: boolean;
  titleHitCount: number;
  candidates: CoverCandidate[];
}

function parseDataUrlParts(dataUrl: string): { mimeType: string; base64: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], base64: match[2] };
}

function parseGeminiJsonPayload(rawText: string): ExtractedCoverJson | null {
  try {
    const cleaned = rawText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim();
    const parsed = JSON.parse(cleaned) as Partial<ExtractedCoverJson>;
    const title = typeof parsed.title === 'string' ? parsed.title.trim() : '';
    const author = typeof parsed.author === 'string' ? parsed.author.trim() : '';
    const volNum = Number(parsed.volume);
    if (!title && !author) return null;
    return {
      title: title || '不明な作品',
      volume: Number.isFinite(volNum) && volNum > 0 ? Math.floor(volNum) : 1,
      author: author || '著者不明',
    };
  } catch {
    return null;
  }
}

function inferFromFilenameOrPreset(
  fileName?: string,
  presetId?: string
): ExtractedCoverJson {
  if (fileName) {
    const base = fileName.replace(/\.[^.]+$/, '');
    const volMatch = base.match(/(\d{1,3})/);
    const cleanTitle = base
      .replace(/[\d_\-]+/g, ' ')
      .trim();
    if (cleanTitle.length >= 2) {
      return {
        title: cleanTitle,
        volume: volMatch ? Number(volMatch[1]) : 1,
        author: '著者未指定',
      };
    }
  }
  const preset =
    AI_COVER_PRESETS.find((p) => p.id === presetId) || AI_COVER_PRESETS[0];
  return { ...preset.extracted };
}

export async function extractCoverInfoWithGemini(options: {
  imageDataUrl?: string | null;
  fileName?: string;
  presetId?: string;
  geminiApiKey?: string;
}): Promise<{ extracted: ExtractedCoverJson; usedLiveGemini: boolean; warning?: string }> {
  const { imageDataUrl, fileName, presetId, geminiApiKey } = options;

  if (imageDataUrl && geminiApiKey && geminiApiKey.trim()) {
    const parts = parseDataUrlParts(imageDataUrl);
    if (parts) {
      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
          geminiApiKey.trim()
        )}`;
        const prompt = [
          'あなたは日本の漫画の表紙画像を読み取るアシスタントです。',
          '画像の表紙から「作品名（巻数を除いたタイトル）」「巻数（整数）」「著者名」を読み取り、以下のJSON形式のみを返してください。',
          '{ "title": "作品名", "volume": 1, "author": "著者名" }',
        ].join('\n');

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt },
                  {
                    inline_data: {
                      mime_type: parts.mimeType,
                      data: parts.base64,
                    },
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: 'application/json',
            },
          }),
        });

        if (res.ok) {
          const json = (await res.json()) as {
            candidates?: { content?: { parts?: { text?: string }[] } }[];
          };
          const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
          const extracted = parseGeminiJsonPayload(text);
          if (extracted) {
            return { extracted, usedLiveGemini: true };
          }
        }
        return {
          extracted: inferFromFilenameOrPreset(fileName, presetId),
          usedLiveGemini: false,
          warning: 'Gemini API応答を解析できなかったため、ローカル推定値を使用しました。',
        };
      } catch {
        return {
          extracted: inferFromFilenameOrPreset(fileName, presetId),
          usedLiveGemini: false,
          warning: 'Gemini APIへの通信に失敗したため、ローカル推定値を使用しました。',
        };
      }
    }
  }

  return {
    extracted: inferFromFilenameOrPreset(fileName, presetId),
    usedLiveGemini: false,
  };
}

export async function searchCandidatesFromExtractedJson(options: {
  extracted: ExtractedCoverJson;
  rakutenAppId?: string;
  seriesList: Series[];
}): Promise<Omit<CoverSearchResponse, 'usedLiveGemini'>> {
  const { extracted, rakutenAppId, seriesList } = options;
  const targetVol = Math.max(1, extracted.volume || 1);
  const candidates: CoverCandidate[] = [];
  let authorFallbackUsed = false;
  let titleHitCount = 0;

  // 1. 楽天ブックスAPIが有効な場合は実検索 + 0件時著者名フォールバック
  if (rakutenAppId && rakutenAppId.trim()) {
    try {
      let rakutenSeries = await searchSeriesFromRakuten(
        extracted.title,
        rakutenAppId,
        false
      );
      titleHitCount = rakutenSeries.length;

      if (rakutenSeries.length === 0 && extracted.author.trim()) {
        rakutenSeries = await searchSeriesFromRakuten(
          extracted.author,
          rakutenAppId,
          true
        );
        if (rakutenSeries.length > 0) {
          authorFallbackUsed = true;
        }
      }

      rakutenSeries.slice(0, 3).forEach((series) => {
        const matchedVol =
          series.volumes?.find((v) => v.volumeNumber === targetVol) ||
          series.volumes?.[0];
        if (!matchedVol) return;
        candidates.push({
          id: `rakuten-${series.id}-${matchedVol.volumeNumber}`,
          seriesId: series.id,
          title: matchedVol.title,
          seriesTitle: series.title,
          volumeNumber: matchedVol.volumeNumber,
          totalPublished: Math.max(series.total_published, matchedVol.volumeNumber),
          volumesMeta: series.volumes,
          author: series.author,
          publisher: series.publisher,
          isbn: matchedVol.isbn,
          coverUrl: matchedVol.coverUrl,
          salesDate: matchedVol.salesDate,
          accentColor: series.accent_color,
          source: 'rakuten',
        });
      });
    } catch {
      // API失敗時はopenBD/ローカルカタログ検索へ継続
    }
  }

  // 2. openBD実在シリーズプリセット & ローカルカタログ・本棚横断検索
  const normQueryTitle = normalizeSeriesTitle(extracted.title);
  const normQueryAuthor = normalizeSeriesTitle(extracted.author);

  // openBD 実在プリセット照合（例: 葬送のフリーレン / SPY×FAMILY / チェンソーマン）
  for (const preset of OPENBD_REAL_SERIES_PRESETS) {
    const normLabel = normalizeSeriesTitle(preset.label);
    const titleMatched =
      normQueryTitle.length >= 2 &&
      (normLabel.includes(normQueryTitle) || normQueryTitle.includes(normLabel));

    const authorMatchFrieren =
      preset.key === 'frieren' && normQueryAuthor.includes('山田鐘人');
    const authorMatchSpy =
      preset.key === 'spyxfamily' && normQueryAuthor.includes('遠藤達哉');
    const authorMatchChainsaw =
      preset.key === 'chainsaw' && normQueryAuthor.includes('藤本タツキ');
    const authorMatched = authorMatchFrieren || authorMatchSpy || authorMatchChainsaw;

    if (titleMatched || (!titleMatched && authorMatched)) {
      if (titleMatched) {
        titleHitCount += 1;
      } else {
        authorFallbackUsed = true;
      }

      const idx = Math.min(Math.max(0, targetVol - 1), preset.isbns.length - 1);
      const targetIsbn = preset.isbns[idx];
      const [fetched, fullSeries] = await Promise.all([
        fetchBookByIsbn(targetIsbn, rakutenAppId),
        fetchSeriesByOpenBdPreset(preset.key).catch(() => null),
      ]);
      if (fetched) {
        candidates.push({
          id: `openbd-${preset.key}-${fetched.volumeNumber}`,
          seriesId: `openbd-${preset.key}`,
          title: fetched.fullTitle,
          seriesTitle: fetched.seriesTitle,
          volumeNumber: fetched.volumeNumber,
          totalPublished: Math.max(
            fullSeries?.total_published || preset.isbns.length,
            fetched.volumeNumber
          ),
          volumesMeta: fullSeries?.volumes,
          author: fetched.author,
          publisher: fetched.publisher,
          isbn: fetched.isbn,
          coverUrl: fetched.coverUrl,
          salesDate: fetched.salesDate,
          accentColor: preset.accentColor,
          source: 'openbd',
        });
      }
    }
  }

  // カタログ＋既存本棚からタイトル検索
  const unifiedPool = [
    ...CATALOG_SERIES.map((c) => ({
      id: c.id,
      title: c.title,
      author: c.author,
      publisher: c.publisher,
      accentColor: c.accent_color,
      totalPublished: c.total_published,
    })),
    ...seriesList.map((s) => ({
      id: s.id,
      title: s.title,
      author: s.author,
      publisher: s.publisher,
      accentColor: s.accent_color || '#FF8FA3',
      totalPublished: s.total_published,
    })),
  ];

  const seenSeriesIds = new Set<string>();
  const dedupedPool = unifiedPool.filter((item) => {
    if (seenSeriesIds.has(item.id)) return false;
    seenSeriesIds.add(item.id);
    return true;
  });

  const titleMatches = dedupedPool.filter((item) => {
    const normTitle = normalizeSeriesTitle(item.title);
    return (
      normQueryTitle.length >= 2 &&
      (normTitle.includes(normQueryTitle) || normQueryTitle.includes(normTitle))
    );
  });

  titleHitCount += titleMatches.length;

  let effectiveMatches = titleMatches;
  if (effectiveMatches.length === 0 && candidates.length === 0 && normQueryAuthor.length >= 2) {
    // タイトル検索0件時: 著者名で再検索するフォールバック
    effectiveMatches = dedupedPool.filter((item) => {
      const normAuthor = normalizeSeriesTitle(item.author);
      return (
        normAuthor.includes(normQueryAuthor) || normQueryAuthor.includes(normAuthor)
      );
    });
    if (effectiveMatches.length > 0) {
      authorFallbackUsed = true;
    }
  }

  effectiveMatches.forEach((item, idx) => {
    const vol = Math.min(targetVol, Math.max(targetVol, item.totalPublished));
    const displayVol = targetVol;
    const totalPublished = Math.max(item.totalPublished, displayVol);
    candidates.push({
      id: `cat-${item.id}-${displayVol}`,
      seriesId: item.id,
      title: `${item.title} ${displayVol}巻`,
      seriesTitle: item.title,
      volumeNumber: displayVol,
      totalPublished,
      author: item.author,
      publisher: item.publisher,
      isbn: buildIsbn(10 + idx, displayVol),
      coverUrl: generatePastelCover(
        item.title,
        displayVol,
        item.author,
        item.accentColor
      ),
      salesDate: new Date().toISOString().slice(0, 10),
      accentColor: item.accentColor,
      source: 'catalog',
    });

    // 巻数違いの近傍候補（+1巻）も1件添えて候補リストらしく表示
    if (vol >= displayVol && displayVol < item.totalPublished) {
      const nextVol = displayVol + 1;
      candidates.push({
        id: `cat-${item.id}-${nextVol}`,
        seriesId: item.id,
        title: `${item.title} ${nextVol}巻`,
        seriesTitle: item.title,
        volumeNumber: nextVol,
        totalPublished,
        author: item.author,
        publisher: item.publisher,
        isbn: buildIsbn(10 + idx, nextVol),
        coverUrl: generatePastelCover(
          item.title,
          nextVol,
          item.author,
          item.accentColor
        ),
        salesDate: new Date().toISOString().slice(0, 10),
        accentColor: item.accentColor,
        source: 'catalog',
      });
    }
  });

  // それでも0件なら、発売中巻数をオンライン照会してから新規候補カードを1枚生成
  if (candidates.length === 0) {
    const resolvedExtent = await resolveSeriesPublishedVolumes({
      seriesTitle: extracted.title,
      volumeNumber: targetVol,
      rakutenAppId,
    });
    const slug =
      resolvedExtent.canonicalSeriesId || `custom-${normQueryTitle || Date.now()}`;
    const resolvedTitle = resolvedExtent.canonicalTitle || extracted.title;
    candidates.push({
      id: `custom-${slug}-${targetVol}`,
      seriesId: slug,
      title: `${resolvedTitle} ${targetVol}巻`,
      seriesTitle: resolvedTitle,
      volumeNumber: targetVol,
      totalPublished: resolvedExtent.totalPublished,
      volumesMeta: resolvedExtent.volumes,
      author: extracted.author,
      publisher: '出版社未設定',
      isbn: buildIsbn(99, targetVol),
      coverUrl: generatePastelCover(
        resolvedTitle,
        targetVol,
        extracted.author,
        '#FF8FA3'
      ),
      salesDate: new Date().toISOString().slice(0, 10),
      accentColor: '#FF8FA3',
      source: 'catalog',
    });
  }

  return {
    extracted,
    authorFallbackUsed,
    titleHitCount,
    candidates,
  };
}
