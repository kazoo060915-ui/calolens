// Gemini API で食事写真／テキストからカロリー・PFCを推定する
import { num } from './utils.js';

const endpoint = (model, apiKey) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

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
- 日本食品標準成分表（八訂）や一般的な市販品・外食チェーンの栄養成分値を参考に、kcal・たんぱく質(g)・脂質(g)・炭水化物(g)を推定してください。
- 数値は現実的な値にし、kcal は整数、PFC は小数第1位まで。
- 調理油やドレッシング、ソースなど見えにくいカロリーも考慮してください。
- 食べ物が含まれていない場合は isFood=false、items は空配列にしてください。
- comment は日本語で、前向きで具体的なアドバイスを50文字以内で。`;

async function fetchWithRetry(url, options, maxRetries = 2) {
  let attempt = 0;
  while (attempt <= maxRetries) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000); // 20秒タイムアウト
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);

      // 503 または 429 の一時的エラーなら少し待ってリトライ
      if ((res.status === 503 || res.status === 429) && attempt < maxRetries) {
        attempt++;
        await new Promise((r) => setTimeout(r, attempt * 1500));
        continue;
      }
      return res;
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error('サーバーからの応答がタイムアウトしました。通信環境を確認し、もう一度お試しください。');
      }
      if (attempt < maxRetries) {
        attempt++;
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      throw err;
    }
  }
}

/**
 * @param {{imageDataUrl?: string, text?: string}} input
 * @param {{apiKey: string, model: string}} opts
 */
export async function analyzeMeal({ imageDataUrl, text }, { apiKey, model }) {
  if (!apiKey) throw new Error('Gemini APIキーが未設定です。設定画面から登録してください。');

  const cleanKey = apiKey.trim();
  const parts = [];
  if (imageDataUrl) {
    const [meta, data] = imageDataUrl.split(',');
    const mime = meta.match(/data:(.*?);/)?.[1] || 'image/jpeg';
    parts.push({ inline_data: { mime_type: mime, data } });
  }
  let prompt = PROMPT;
  if (text?.trim()) {
    prompt += imageDataUrl
      ? `\n\nユーザーからの補足: ${text.trim()}`
      : `\n\n以下は写真ではなくユーザーが入力した食事内容です。これをもとに推定してください:\n${text.trim()}`;
  }
  parts.push({ text: prompt });

  let res;
  try {
    res = await fetchWithRetry(endpoint(model, cleanKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cleanKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA },
      }),
    });
  } catch (err) {
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
    res = await fetchWithRetry(endpoint(model, cleanKey), {
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
