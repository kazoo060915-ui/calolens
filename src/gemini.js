// Gemini API で食事写真／テキストからカロリー・PFCを推定する
import { num } from './utils.js';

const endpoint = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    isFood: { type: 'BOOLEAN', description: '食べ物・飲み物が含まれているか' },
    mealName: { type: 'STRING', description: '食事全体の短い名前（例: 焼き魚定食）' },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING', description: '料理・食品名' },
          amount: { type: 'STRING', description: '推定量（例: 茶碗1杯 150g）' },
          kcal: { type: 'NUMBER', description: 'エネルギー(kcal)' },
          protein: { type: 'NUMBER', description: 'たんぱく質(g)' },
          fat: { type: 'NUMBER', description: '脂質(g)' },
          carbs: { type: 'NUMBER', description: '炭水化物(g)' },
        },
        required: ['name', 'amount', 'kcal', 'protein', 'fat', 'carbs'],
      },
    },
    comment: { type: 'STRING', description: '栄養バランスについての一言アドバイス（50文字以内）' },
  },
  required: ['isFood', 'mealName', 'items', 'comment'],
};

const PROMPT = `あなたは日本の管理栄養士です。食事の内容を分析して栄養価を推定してください。

ルール:
- 料理・食品ごとに items を分けてください（ご飯、味噌汁、主菜などは別々に）。
- 器の大きさや一般的な1人前の量から分量を推定し、amount に「茶碗1杯 150g」のように記載してください。
- 【重要】袋入りのパン（スティックパン、ロールパン、食パンなど）や複数個入りの市販食品・お菓子が写っている場合は、1袋全体の合計ではなく必ず「1本あたり」「1個あたり」「1枚あたり」を1単位として栄養価を算出してください（ユーザーが後から本数・個数を＋ボタンで増やせるようにするため）。
- パッケージに「栄養成分表示」やカロリー表記の文字が見える場合は、その数値を最優先で正確に読み取ってください。
- 日本食品標準成分表（八訂）や一般的な市販品・外食チェーンの栄養成分値を参考に、kcal・たんぱく質(g)・脂質(g)・炭水化物(g)を推定してください。
- 数値は現実的な値にし、kcal は整数、PFC は小数第1位まで。
- 調理油やドレッシング、ソースなど見えにくいカロリーも考慮してください。
- 食べ物が含まれていない場合は isFood=false、items は空配列にしてください。
- comment は日本語で、前向きで具体的なアドバイスを50文字以内で。`;

const LABEL_PROMPT = `あなたは市販食品の栄養成分表示・バーコード・パッケージ読み取りの専門家です。
画像に写っている「栄養成分表示ラベル」「商品パッケージ」「バーコード（JANコード）」から、商品の栄養価を正確に読み取ってください。

ルール:
- 「栄養成分表示」が写っている場合は、そこに記載された熱量(kcal)・たんぱく質(g)・脂質(g)・炭水化物(g)の数値をそのまま正確に採用してください（isFood=true にしてください）。
- スティックパンや複数個入りの袋パン・お菓子などの場合は、1袋全体ではなく「1本あたり」「1個あたり」「1枚あたり」の単位で出力してください（amount に「1本」「1個」「1包装」など表示単位を記載）。
- 栄養成分表示が写っておらずパッケージ表面やバーコードのみの場合は、メーカー名・商品名（ヤマザキ、セブンイレブン、ローソン、ファミリーマート等）を特定し、公式の栄養成分値（1個・1本あたり）を推定してください。
- comment には読み取った商品の特徴や栄養面の一言コメントを50文字以内で記載してください。`;

/** 画像からバーコード(JAN)を検出し、Open Food Factsから製品情報を取得できれば返す */
async function lookupBarcodeFromImage(imageDataUrl) {
  try {
    if (!('BarcodeDetector' in window)) return null;
    const img = new Image();
    img.src = imageDataUrl;
    await img.decode();
    const detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a'] });
    const codes = await detector.detect(img);
    const code = codes?.[0]?.rawValue;
    if (!code) return null;
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`);
    if (!res.ok) return `検出バーコード(JAN): ${code}`;
    const json = await res.json();
    if (json.status !== 1 || !json.product) return `検出バーコード(JAN): ${code}`;
    const p = json.product;
    const n = p.nutriments || {};
    return [
      `検出バーコード(JAN): ${code}`,
      `商品名: ${p.product_name_ja || p.product_name || ''}`,
      `ブランド: ${p.brands || ''}`,
      `1食/1個量: ${p.serving_size || p.quantity || ''}`,
      n['energy-kcal_serving'] ? `1単位kcal: ${n['energy-kcal_serving']}` : '',
      n['proteins_serving'] ? `1単位P: ${n['proteins_serving']}g` : '',
      n['fat_serving'] ? `1単位F: ${n['fat_serving']}g` : '',
      n['carbohydrates_serving'] ? `1単位C: ${n['carbohydrates_serving']}g` : '',
      n['energy-kcal_100g'] ? `100gあたりkcal: ${n['energy-kcal_100g']}` : '',
      n['proteins_100g'] ? `100gあたりP: ${n['proteins_100g']}g` : '',
      n['fat_100g'] ? `100gあたりF: ${n['fat_100g']}g` : '',
      n['carbohydrates_100g'] ? `100gあたりC: ${n['carbohydrates_100g']}g` : '',
    ]
      .filter(Boolean)
      .join(' / ');
  } catch {
    return null;
  }
}

async function fetchWithRetry(url, options, maxRetries = 2) {
  let attempt = 0;
  while (attempt <= maxRetries) {
    const controller = new AbortController();
    const onExternalAbort = () => controller.abort();
    options.signal?.addEventListener('abort', onExternalAbort, { once: true });
    const timeoutId = setTimeout(() => controller.abort(), 20000); // 20秒タイムアウト
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });

      // 503 または 429 の一時的エラーなら少し待ってリトライ
      if ((res.status === 503 || res.status === 429) && attempt < maxRetries) {
        attempt++;
        await new Promise((r) => setTimeout(r, attempt * 1500));
        continue;
      }
      return res;
    } catch (err) {
      if (options.signal?.aborted) {
        throw err;
      }
      if (err.name === 'AbortError') {
        throw new Error('サーバーからの応答がタイムアウトしました。通信環境を確認し、もう一度お試しください。');
      }
      if (attempt < maxRetries) {
        attempt++;
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
      options.signal?.removeEventListener('abort', onExternalAbort);
    }
  }
}

/**
 * @param {{imageDataUrl?: string, text?: string, mode?: 'meal' | 'label'}} input
 * @param {{apiKey: string, model: string, signal?: AbortSignal}} opts
 */
export async function analyzeMeal({ imageDataUrl, text, mode = 'meal' }, { apiKey, model, signal }) {
  if (!apiKey) throw new Error('Gemini APIキーが未設定です。設定画面から登録してください。');

  const cleanKey = apiKey.trim();
  const parts = [];
  let barcodeInfo = null;
  if (imageDataUrl) {
    const [meta, data] = imageDataUrl.split(',');
    const mime = meta.match(/data:(.*?);/)?.[1] || 'image/jpeg';
    parts.push({ inline_data: { mime_type: mime, data } });
    barcodeInfo = await lookupBarcodeFromImage(imageDataUrl);
  }
  let prompt = mode === 'label' ? LABEL_PROMPT : PROMPT;
  if (barcodeInfo) {
    prompt += `\n\n【バーコードデータベース照会結果（参考情報）】\n${barcodeInfo}`;
  }
  if (text?.trim()) {
    prompt += imageDataUrl
      ? `\n\nユーザーからの補足: ${text.trim()}`
      : `\n\n以下は写真ではなくユーザーが入力した食事内容です。これをもとに推定してください:\n${text.trim()}`;
  }
  parts.push({ text: prompt });

  let res;
  try {
    res = await fetchWithRetry(endpoint(model), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cleanKey },
      signal,
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA },
      }),
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new Error(err.message || '通信に失敗しました。インターネット接続を確認してください。');
  }

  if (!res.ok) {
    let msg = '';
    try {
      msg = (await res.json())?.error?.message || '';
    } catch {
      /* noop */
    }
    if (/API key/i.test(msg) || res.status === 401 || res.status === 403)
      throw new Error('APIキーが無効です。Google AI Studioで正しいキーをご確認ください。');
    if (res.status === 404) throw new Error(`モデル「${model}」が見つかりません。設定画面でモデルを変更してください。`);
    if (res.status === 429) throw new Error('APIの利用上限に達しました。少し時間をおいて再試行してください。');
    if (res.status === 503 || /high demand/i.test(msg)) {
      throw new Error(`GoogleのAIサーバーが混雑しています（503）。設定画面で「Gemini 3.5 Flash-Lite（高速）」に変更してお試しください。`);
    }
    if (res.status >= 500) throw new Error('AIサーバーが混み合っています。少し待ってから再試行してください。');
    throw new Error(`AI解析に失敗しました（${res.status}）${msg ? '：' + msg : ''}`);
  }

  const json = await res.json();
  const out = (json.candidates?.[0]?.content?.parts || [])
    .filter((p) => !p.thought)
    .map((p) => p.text || '')
    .join('');
  if (!out) {
    const reason = json.promptFeedback?.blockReason || json.candidates?.[0]?.finishReason;
    throw new Error(`AIから結果を取得できませんでした${reason ? `（${reason}）` : ''}`);
  }

  let data;
  try {
    data = JSON.parse(out);
  } catch {
    throw new Error('AIの応答を読み取れませんでした。もう一度お試しください。');
  }

  return {
    isFood: data.isFood !== false,
    mealName: data.mealName || '',
    comment: data.comment || '',
    items: (data.items || []).map((i) => ({
      name: String(i.name || ''),
      amount: String(i.amount || ''),
      kcal: Math.round(num(i.kcal)),
      protein: Math.round(num(i.protein) * 10) / 10,
      fat: Math.round(num(i.fat) * 10) / 10,
      carbs: Math.round(num(i.carbs) * 10) / 10,
    })),
  };
}

/** APIキーとモデルの疎通確認 */
export async function testConnection({ apiKey, model }) {
  if (!apiKey) throw new Error('APIキーを入力してください');
  const cleanKey = apiKey.trim();

  let res;
  try {
    res = await fetchWithRetry(endpoint(model), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cleanKey },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'OKとだけ返答してください' }] }] }),
    });
  } catch (err) {
    throw new Error(err.message || '通信に失敗しました。');
  }

  if (!res.ok) {
    let msg = '';
    try {
      msg = (await res.json())?.error?.message || '';
    } catch {
      /* noop */
    }
    if (res.status === 400 || res.status === 401 || res.status === 403 || /API key/i.test(msg)) {
      throw new Error(`APIキーが無効です（${res.status}）。コピーしたキーをご確認ください。`);
    }
    if (res.status === 503 || /high demand/i.test(msg)) {
      throw new Error(`GoogleのAIサーバーが一時的に混雑しています（503）。設定画面で「Gemini 3.5 Flash-Lite（高速）」に変更してお試しください。`);
    }
    throw new Error(`${res.status} ${msg}`);
  }
  return true;
}
