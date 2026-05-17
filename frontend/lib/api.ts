const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type Product = {
  id: string;
  title: string;
  category: string;
  brand?: string | null;
  price_try: number | null;
  rating?: number | null;
  score: number;
  reason?: string;
};

export type SearchResponse = {
  session_id:         string;
  status:             "clarifying" | "results";
  question?:          string;
  results?:           Product[];
  extracted_features?: Record<string, unknown> | null;
};

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`API hatası ${res.status}: ${detail}`);
  }
  return res.json();
}

export async function startSearch(userInput: string, imageFile?: File): Promise<SearchResponse> {
  const form = new FormData();
  form.append("user_input", userInput);
  if (imageFile) form.append("image", imageFile);
  // No Content-Type header - browser sets multipart boundary automatically.
  const res = await fetch(`${API_BASE}/search`, { method: "POST", body: form });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`API hatası ${res.status}: ${detail}`);
  }
  return res.json();
}

export function sendAnswer(sessionId: string, answer: string): Promise<SearchResponse> {
  return post("/answer", { session_id: sessionId, answer });
}

export function imageUrl(productId: string): string {
  return `${API_BASE}/images/${productId}_1.jpg`;
}

export function imageUrls(productId: string, count = 3): string[] {
  return Array.from({ length: count }, (_, i) => `${API_BASE}/images/${productId}_${i + 1}.jpg`);
}

export async function transcribeAudio(blob: Blob): Promise<string> {
  const form = new FormData();
  form.append("audio", blob, "recording.webm");
  const res = await fetch(`${API_BASE}/transcribe`, { method: "POST", body: form });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`Transkripsiyon hatası ${res.status}: ${detail}`);
  }
  const data = await res.json();
  return (data.text as string) ?? "";
}
