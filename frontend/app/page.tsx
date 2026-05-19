"use client";

import { useEffect, useRef, useState } from "react";
import {
  Search, Loader2, ArrowLeft, Sparkles, Mic, Send,
  ImageIcon, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  startSearch,
  sendAnswer,
  imageUrls,
  type Product,
  type SearchResponse,
} from "@/lib/api";

type Screen = "search" | "clarifying" | "results";

interface State {
  screen:            Screen;
  sessionId:         string;
  question:          string;
  results:           Product[];
  loading:           boolean;
  error:             string;
  extractedFeatures: Record<string, unknown> | null;
}

const INITIAL_STATE: State = {
  screen:            "search",
  sessionId:         "",
  question:          "",
  results:           [],
  loading:           false,
  error:             "",
  extractedFeatures: null,
};

const EXAMPLES = [
  "Kağıtları dosyalamak için delen alet",
  "Eskiden annem bir alet ile kahve çekirdeğini toz haline getirirdi",
  "İlkokulda kullandığım boncuklu hesap aleti",
  "Arkadaşımın evinde gördüğüm retro lamba",
  "Koşu için mavi turuncu spor ayakkabı 42 numara",
];

const PROGRESS_MSGS_TEXT  = ["Tarif analiz ediliyor...",             "Ürünler arasında geziniyorum...", "En iyi eşleşmeler sıralanıyor..."];
const PROGRESS_MSGS_IMAGE = ["Görsel analiz ediliyor...",            "Ürünler arasında geziniyorum...", "En iyi eşleşmeler sıralanıyor..."];
const PROGRESS_MSGS_BOTH  = ["Görsel ve tarif analiz ediliyor...",   "Ürünler arasında geziniyorum...", "En iyi eşleşmeler sıralanıyor..."];
const PROGRESS_MSGS_ANSWER = ["Cevabın analiz ediliyor..."];

const RESULT_MSGS = [
  "Ürünleri buldum, işte en yakın eşleşmeler.",
  "Aradığına en yakın seçenekleri sıraladım.",
  "İşte aradığına en yakın ürünler.",
  "Aramanı tamamladım, işte sonuçlar.",
  "En iyi eşleşmeleri hazırladım, işte o ürünler.",
];

// Shared between the search and clarifying screens for visual consistency.
const PILL_INPUT_CLS =
  "h-14 rounded-full pl-6 pr-48 text-base bg-[var(--input-bg)] border-[var(--border-color)] shadow-md " +
  "focus-visible:ring-1 focus-visible:ring-[var(--color-brand)] focus-visible:border-[var(--color-brand)] focus-visible:shadow-lg transition-shadow duration-200";

function scoreBadgeStyle(score: number): string {
  const s = score * 10;
  if (s >= 8.0) return "bg-[var(--color-brand)] text-white";
  if (s >= 6.0) return "bg-[var(--color-brand-soft)] text-[var(--color-primary)]";
  return "bg-[var(--border-color)] text-[var(--color-secondary)]";
}

const toTitleCase = (str: string) =>
  str.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

function buildSummary(count: number, features: Record<string, unknown> | null): string {
  const category = features?.category as string | undefined;
  if (category) return `${toTitleCase(category)} kategorisinde ${count} sonuç buldum.`;
  return `${count} ürün arasında en iyi eşleşmeleri sıraladım.`;
}

function MicButton({
  recording,
  onPressStart,
  onPressEnd,
  disabled,
}: {
  recording:    boolean;
  onPressStart: () => void;
  onPressEnd:   () => void;
  disabled?:    boolean;
}) {
  return (
    <button
      type="button"
      onMouseDown={onPressStart}
      onMouseUp={onPressEnd}
      onMouseLeave={onPressEnd}
      onTouchStart={(e) => { e.preventDefault(); onPressStart(); }}
      onTouchEnd={(e) => { e.preventDefault(); onPressEnd(); }}
      disabled={disabled}
      className="relative flex items-center justify-center select-none focus:outline-none disabled:opacity-40"
      title={recording ? "Bırak, gönder" : "Basılı tut, konuş"}
    >
      {recording && (
        <span
          className="absolute -inset-1 rounded-full bg-red-400"
          style={{ animation: "mic-ring 1.5s ease-in-out infinite" }}
        />
      )}
      <Mic
        className={`relative z-10 h-5 w-5 transition-colors ${
          recording ? "text-red-500" : "text-[var(--color-secondary)] hover:text-[var(--color-brand)]"
        }`}
        style={recording ? { animation: "mic-scale 1.2s ease-in-out infinite" } : undefined}
      />
    </button>
  );
}

function SpeechToggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={enabled ? "Seslendirmeyi kapat" : "Seslendirmeyi aç"}
      className="flex items-center gap-2 focus:outline-none group"
    >
      <span className="text-xs text-[var(--color-secondary)] group-hover:text-[var(--color-primary)] transition-colors select-none">
        Ses
      </span>
      <span
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 ${
          enabled ? "bg-[var(--color-brand)]" : "bg-[var(--bg-accent)]"
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
            enabled ? "translate-x-[18px]" : "translate-x-[2px]"
          }`}
        />
      </span>
    </button>
  );
}

function ShimmerMessage({ text }: { text: string }) {
  return (
    <span className="shimmer-text text-sm select-none">{text}</span>
  );
}

const NUM_IMAGES = 3;

function ProductCard({ product, rank, onClick }: { product: Product; rank: number; onClick: () => void }) {
  const isBest     = rank === 1;
  const scoreLabel = (product.score * 10).toFixed(1);
  const srcs       = imageUrls(product.id, NUM_IMAGES);

  const [hoveredIdx, setHoveredIdx] = useState(0);
  const [isHovered, setIsHovered]   = useState(false);
  const [imgErrors, setImgErrors]   = useState<boolean[]>(() => Array(NUM_IMAGES).fill(false));

  const validIndices = srcs.map((_, i) => i).filter((i) => !imgErrors[i]);
  const allErrored   = validIndices.length === 0;
  const displayIdx   = validIndices.includes(hoveredIdx) ? hoveredIdx : (validIndices[0] ?? 0);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (validIndices.length <= 1) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const pos  = Math.min(Math.floor(relX * validIndices.length), validIndices.length - 1);
    setHoveredIdx(validIndices[pos]);
  };

  const markError = (i: number) =>
    setImgErrors((prev) => { const next = [...prev]; next[i] = true; return next; });

  return (
    <Card
      className={`rounded-2xl overflow-hidden transition-all duration-200 origin-center cursor-pointer ${
        isBest
          ? "ring-2 ring-[var(--color-brand-soft)] shadow-xl hover:shadow-2xl hover:scale-[1.005]"
          : "border border-transparent hover:border-[var(--color-brand-soft)] hover:shadow-lg hover:scale-[1.01]"
      }`}
      onClick={onClick}
    >
      {/* Image area */}
      <div
        className="relative aspect-square bg-muted overflow-hidden cursor-pointer select-none"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => { setIsHovered(false); setHoveredIdx(0); }}
        onMouseMove={handleMouseMove}
      >
        {allErrored ? (
          <div className="h-full bg-muted" />
        ) : (
          srcs.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={src}
              alt={i === 0 ? product.title : ""}
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-200 ${
                displayIdx === i ? "opacity-100" : "opacity-0"
              }`}
              onError={() => markError(i)}
            />
          ))
        )}

        {/* Slider dots */}
        {isHovered && validIndices.length > 1 && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1 z-10 pointer-events-none">
            {validIndices.map((i) => (
              <div
                key={i}
                className={`w-1.5 h-1.5 rounded-full transition-colors duration-150 ${
                  displayIdx === i ? "bg-white" : "bg-white/50"
                }`}
              />
            ))}
          </div>
        )}

        {/* Rank badge */}
        <div className="absolute top-2 left-2 bg-black/60 text-white text-[11px] font-bold rounded-full w-6 h-6 flex items-center justify-center z-10">
          {rank}
        </div>

        {/* Best / Alt badge */}
        <div className={`absolute top-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded-full z-10 ${
          isBest
            ? "bg-[var(--bg-accent)] text-[var(--color-brand)]"
            : "bg-black/50 text-white"
        }`}>
          {isBest ? "En İyi Eşleşme" : "Alternatif"}
        </div>
      </div>

      {/* Card info */}
      <CardContent className="p-3 space-y-1.5">
        {product.brand && (
          <p className="text-[11px] text-[var(--color-secondary)] uppercase tracking-wide truncate">
            {product.brand}
          </p>
        )}
        <h3 className="font-medium text-sm leading-snug line-clamp-2 min-h-[2.5rem] text-[var(--color-primary)]">
          {product.title}
        </h3>
        {product.rating != null && (
          <div className="flex items-center gap-1">
            <span className="text-amber-400 text-xs">★</span>
            <span className="text-xs text-[var(--color-secondary)]">{product.rating.toFixed(1)}</span>
          </div>
        )}
        {product.reason && (
          <p className="text-[11px] text-[var(--color-secondary)] italic leading-relaxed line-clamp-2">
            {product.reason}
          </p>
        )}
        <div className="flex items-center justify-between gap-2 pt-0.5">
          {product.price_try != null ? (
            <span className="font-bold text-sm text-[var(--color-brand)]">{product.price_try.toFixed(2)} TL</span>
          ) : (
            <span />
          )}
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${scoreBadgeStyle(product.score)}`}>
            {scoreLabel}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function ProductModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const srcs = imageUrls(product.id, NUM_IMAGES);
  const [imgIdx, setImgIdx]             = useState(0);
  const [imgErrors, setImgErrors]       = useState<boolean[]>(() => Array(NUM_IMAGES).fill(false));
  const [galleryHovered, setGalleryHovered] = useState(false);

  const valid      = srcs.map((src, i) => ({ src, i })).filter(({ i }) => !imgErrors[i]);
  const validCount = valid.length;
  const safeIdx    = Math.min(imgIdx, Math.max(validCount - 1, 0));

  const markError = (i: number) =>
    setImgErrors((prev) => { const next = [...prev]; next[i] = true; return next; });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const scoreLabel  = (product.score * 10).toFixed(1);
  const filledStars = Math.round(product.rating ?? 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(28,25,23,0.6)" }}
      onClick={onClose}
    >
      <div
        className="relative bg-[var(--card-bg)] rounded-2xl shadow-2xl w-full max-w-[800px] flex flex-col md:flex-row overflow-hidden h-auto md:h-[600px]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 z-20 bg-[var(--bg-accent)] border border-[var(--border-color)] rounded-full w-8 h-8 flex items-center justify-center shadow-sm hover:bg-[var(--color-brand-soft)] transition-colors"
        >
          <X className="h-4 w-4 text-[var(--color-secondary)]" />
        </button>

        {/* ── Left: gallery (50%) ── */}
        <div className="w-full md:w-1/2 md:h-full flex flex-col bg-white border-b md:border-b-0 md:border-r border-[var(--border-color)] overflow-hidden">

            {/* Main image */}
            <div
              className="relative flex-1 min-h-[200px] overflow-hidden flex items-center justify-center"
              onMouseEnter={() => setGalleryHovered(true)}
              onMouseLeave={() => setGalleryHovered(false)}
            >
              {validCount === 0 ? (
                <div className="h-full bg-muted" />
              ) : (
                <>
                  {valid.map(({ src, i }, pos) => (
                    <div
                      key={i}
                      className={`absolute inset-0 flex items-center justify-center transition-opacity duration-200 ${
                        safeIdx === pos ? "opacity-100" : "opacity-0"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={src}
                        alt={pos === 0 ? product.title : ""}
                        className="max-h-full max-w-full object-contain"
                        onError={() => markError(i)}
                      />
                    </div>
                  ))}

                  {validCount > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setImgIdx((j) => (j - 1 + validCount) % validCount); }}
                        className={`absolute left-2 top-1/2 -translate-y-1/2 bg-white/80 rounded-full w-8 h-8 flex items-center justify-center shadow hover:bg-white z-10 text-lg font-bold transition-opacity duration-200 ${
                          galleryHovered ? "opacity-100" : "opacity-30"
                        }`}
                      >
                        ‹
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setImgIdx((j) => (j + 1) % validCount); }}
                        className={`absolute right-2 top-1/2 -translate-y-1/2 bg-white/80 rounded-full w-8 h-8 flex items-center justify-center shadow hover:bg-white z-10 text-lg font-bold transition-opacity duration-200 ${
                          galleryHovered ? "opacity-100" : "opacity-30"
                        }`}
                      >
                        ›
                      </button>
                    </>
                  )}
                </>
              )}
            </div>

            {/* Thumbnail strip */}
            {validCount > 1 && (
              <div className="flex justify-center gap-2 p-2 overflow-x-auto shrink-0 bg-[var(--card-bg)] border-t border-[var(--border-color)]">
                {valid.map(({ src, i }, pos) => (
                  <button
                    key={i}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setImgIdx(pos); }}
                    className={`shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-colors ${
                      safeIdx === pos
                        ? "border-[var(--color-brand)]"
                        : "border-transparent hover:border-[var(--color-brand-soft)]"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt=""
                      className="w-full h-full object-cover"
                      onError={() => markError(i)}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── Right: product info (50%), scrollable ── */}
          <div className="w-full md:w-1/2 md:h-full overflow-y-auto p-5 md:p-6 space-y-4">

            {/* Brand */}
            {product.brand && (
              <p className="text-xs font-semibold text-[var(--color-secondary)] uppercase tracking-widest">
                {product.brand}
              </p>
            )}

            {/* Title */}
            <h2 className="text-base font-bold leading-snug pr-6 text-[var(--color-primary)]">{product.title}</h2>

            {/* Rating stars */}
            {product.rating != null && (
              <div className="flex items-center gap-1.5">
                <span className="flex">
                  {Array.from({ length: 5 }, (_, i) => (
                    <span key={i} className={i < filledStars ? "text-amber-400" : "text-[var(--border-color)]"}>
                      ★
                    </span>
                  ))}
                </span>
                <span className="text-sm text-[var(--color-secondary)]">{product.rating.toFixed(1)}</span>
              </div>
            )}

            {/* Price + score */}
            <div className="flex items-center gap-3 flex-wrap">
              {product.price_try != null && (
                <span className="text-2xl font-bold text-[var(--color-brand)]">{product.price_try.toFixed(2)} TL</span>
              )}
              <span className={`text-sm font-semibold px-2.5 py-0.5 rounded-full ${scoreBadgeStyle(product.score)}`}>
                {scoreLabel}
              </span>
            </div>

            {/* Category */}
            <p className="text-xs text-[var(--color-secondary)]">
              <span className="font-semibold uppercase tracking-wide mr-1">Kategori</span>
              {toTitleCase(product.category)}
            </p>

            {/* arif's reason - highlighted box */}
            {product.reason && (
              <div className="rounded-xl bg-[var(--bg-accent)] border border-[var(--color-brand-soft)] p-3 space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-brand)]">
                  arif&apos;in notu
                </p>
                <p className="text-sm text-[var(--color-primary)] italic leading-relaxed">
                  {product.reason}
                </p>
              </div>
            )}
          </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [state, setState]           = useState<State>(INITIAL_STATE);
  const [inputValue, setInputValue] = useState("");
  const [recording, setRecording]   = useState(false);
  const [showExamples, setShowExamples]       = useState(false);
  const [progressIdx, setProgressIdx]         = useState(0);
  const [imageFile, setImageFile]             = useState<File | null>(null);
  const [imagePrev, setImagePrev]             = useState<string | null>(null);
  const [isSpeechEnabled, setIsSpeechEnabled]     = useState(false);
  const [selectedProduct, setSelectedProduct]     = useState<Product | null>(null);
  const [progressMsgs, setProgressMsgs]           = useState<string[]>(PROGRESS_MSGS_TEXT);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef          = useRef<any>(null);
  const keepRecordingRef        = useRef(false);
  const userManuallyDisabledRef = useRef(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const inputRef           = useRef<HTMLInputElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const audioCtxRef        = useRef<any>(null);
  const fileInputRef       = useRef<HTMLInputElement>(null);

  const patch = (p: Partial<State>) => setState((s) => ({ ...s, ...p }));

  // Revoke object URL when imagePrev changes to avoid memory leaks.
  useEffect(() => {
    return () => { if (imagePrev) URL.revokeObjectURL(imagePrev); };
  }, [imagePrev]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowExamples(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!state.loading) { setProgressIdx(0); return; }
    if (progressIdx >= progressMsgs.length - 1) return;
    const t = setTimeout(() => setProgressIdx((i) => i + 1), 1500);
    return () => clearTimeout(t);
  }, [state.loading, progressIdx, progressMsgs.length]);

  useEffect(() => {
    if (recording && inputRef.current) {
      inputRef.current.scrollLeft = inputRef.current.scrollWidth;
    }
  }, [inputValue, recording]);

  // Only speak when a NEW question arrives - not when the toggle is switched on mid-session.
  const lastSpokenQuestionRef = useRef<string>("");

  useEffect(() => {
    if (!state.question || state.screen !== "clarifying" || !isSpeechEnabled || typeof window === "undefined") return;
    if (state.question === lastSpokenQuestionRef.current) return; // already spoken
    lastSpokenQuestionRef.current = state.question;
    const synth = window.speechSynthesis;

    const doSpeak = () => {
      const voices = synth.getVoices();
      const tr     = voices.filter((v) => v.lang.startsWith("tr"));
      const voice  = tr.find((v) => /Google|Microsoft/i.test(v.name)) ?? tr[0] ?? null;
      const utterance = new SpeechSynthesisUtterance(state.question);
      utterance.lang  = "tr-TR";
      utterance.rate  = 0.85;
      utterance.pitch = 1.05;
      if (voice) utterance.voice = voice;
      synth.cancel();
      synth.speak(utterance);
    };

    if (synth.getVoices().length > 0) {
      doSpeak();
    } else {
      synth.onvoiceschanged = doSpeak;
    }
    return () => { synth.onvoiceschanged = null; };
  }, [state.screen, state.question, isSpeechEnabled]);

  const playBeep = (freq: number, durationMs: number) => {
    if (typeof window === "undefined") return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const AC = window.AudioContext ?? (window as any).webkitAudioContext;
      if (!AC) return;
      if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
        audioCtxRef.current = new AC();
      }
      const ctx  = audioCtxRef.current;
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + durationMs / 1000);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + durationMs / 1000);
    } catch {
      // AudioContext may be blocked before a user gesture
    }
  };

  const speakTurkish = (text: string) => {
    if (typeof window === "undefined") return;
    const synth = window.speechSynthesis;
    const doSpeak = () => {
      const voices = synth.getVoices();
      const tr     = voices.filter((v) => v.lang.startsWith("tr"));
      const voice  = tr.find((v) => /Google|Microsoft/i.test(v.name)) ?? tr[0] ?? null;
      const utt = new SpeechSynthesisUtterance(text);
      utt.lang = "tr-TR"; utt.rate = 0.85; utt.pitch = 1.05;
      if (voice) utt.voice = voice;
      synth.cancel();
      synth.speak(utt);
    };
    if (synth.getVoices().length > 0) doSpeak();
    else synth.onvoiceschanged = doSpeak;
  };

  const startListening = () => {
    if (typeof window === "undefined") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) { patch({ error: "Tarayıcınız ses tanımayı desteklemiyor (Chrome önerilir)" }); return; }

    // Auto-enable TTS on first mic use, unless the user explicitly turned it off.
    if (!userManuallyDisabledRef.current) setIsSpeechEnabled(true);
    playBeep(880, 80);
    keepRecordingRef.current = true;

    const recognition = new SR();
    recognition.lang            = "tr-TR";
    recognition.interimResults  = true;
    recognition.maxAlternatives = 1;
    recognition.continuous      = true;

    recognition.onresult = (event: { results: SpeechRecognitionResultList }) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setInputValue(transcript);
    };

    recognition.onerror = (event: { error: string }) => {
      if (event.error !== "aborted" && event.error !== "no-speech") {
        patch({ error: "Ses tanıma hatası: " + event.error });
        keepRecordingRef.current = false;
        setRecording(false);
        recognitionRef.current = null;
      }
    };

    recognition.onend = () => {
      if (keepRecordingRef.current) {
        recognition.start(); // browser ended the session while button is still held - restart
      } else {
        setRecording(false);
        recognitionRef.current = null;
      }
    };

    recognition.start();
    recognitionRef.current = recognition;
    setRecording(true);
  };

  const stopListening = () => {
    if (!keepRecordingRef.current) return;
    keepRecordingRef.current = false;
    recognitionRef.current?.stop();
    playBeep(440, 120);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePrev(URL.createObjectURL(file));
    e.target.value = ""; // allow re-selecting the same file
  };

  const clearImage = () => {
    setImageFile(null);
    setImagePrev(null);
    // Re-show suggestions if the input is currently focused.
    if (document.activeElement === inputRef.current) setShowExamples(true);
  };

  const handleResponse = (data: SearchResponse) => {
    if (data.status === "clarifying" && data.question) {
      // Show "preparing question" message now that we know a new question is coming.
      setProgressMsgs(["Yeni soru hazırlanıyor..."]);
      setProgressIdx(0);
      patch({ screen: "clarifying", question: data.question, sessionId: data.session_id });
      setInputValue("");
    } else {
      // Sort by score descending regardless of LLM reordering.
      const sorted = [...(data.results ?? [])].sort((a, b) => b.score - a.score);
      patch({
        screen:            "results",
        results:           sorted,
        sessionId:         data.session_id,
        extractedFeatures: data.extracted_features ?? null,
      });
      if (isSpeechEnabled) {
        const msg = RESULT_MSGS[Math.floor(Math.random() * RESULT_MSGS.length)];
        setTimeout(() => speakTurkish(msg), 800);
      }
    }
  };

  const handleSearch = async () => {
    const query = inputValue.trim();
    if (!query && !imageFile) return;
    setShowExamples(false);
    const msgs = imageFile && query ? PROGRESS_MSGS_BOTH
               : imageFile          ? PROGRESS_MSGS_IMAGE
               :                      PROGRESS_MSGS_TEXT;
    setProgressMsgs(msgs);
    setProgressIdx(0);
    patch({ loading: true, error: "" });
    try {
      const data = await startSearch(query, imageFile ?? undefined);
      handleResponse(data);
    } catch (e) {
      patch({ error: e instanceof Error ? e.message : "Bağlantı hatası" });
    } finally {
      patch({ loading: false });
    }
  };

  const handleAnswer = async () => {
    const ans = inputValue.trim();
    if (!ans) return;
    setProgressMsgs(PROGRESS_MSGS_ANSWER);
    setProgressIdx(0);
    patch({ loading: true, error: "" });
    try {
      const data = await sendAnswer(state.sessionId, ans);
      handleResponse(data);
    } catch (e) {
      patch({ error: e instanceof Error ? e.message : "Bağlantı hatası" });
    } finally {
      patch({ loading: false });
    }
  };

  const handleSpeechToggle = () => {
    if (isSpeechEnabled) {
      // User is turning it off - cancel any ongoing speech immediately.
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
      userManuallyDisabledRef.current = true;
      setIsSpeechEnabled(false);
    } else {
      // User is turning it on - don't re-speak the current question; next trigger will fire.
      userManuallyDisabledRef.current = false;
      setIsSpeechEnabled(true);
    }
  };

  const handleReset = () => {
    setState(INITIAL_STATE);
    setInputValue("");
    setImageFile(null);
    setImagePrev(null);
  };

  const onKey = (handler: () => void) => (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !state.loading) handler();
  };

  // ── Search screen ──────────────────────────────────────────────────────────

  if (state.screen === "search") {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-6 bg-[var(--bg-primary)]">
        <div className="w-full max-w-2xl -translate-y-16">
          <div className="flex items-center justify-center">
            <div className="flex items-center justify-center gap-3">
              <div className="relative">
                <Sparkles className="h-10 w-10 text-[var(--color-brand)]" />
                {/* Twinkling particles */}
                <span className="absolute w-1 h-1 rounded-full bg-[var(--color-brand)]" style={{ top: "-4px",  left: "6px",  animation: "twinkle 2.2s ease-in-out infinite",               animationDelay: "0s"    }} />
                <span className="absolute w-1 h-1 rounded-full bg-[var(--color-brand-soft)]" style={{ top: "2px",   right: "-4px", animation: "twinkle 2.2s ease-in-out infinite",              animationDelay: "0.6s"  }} />
                <span className="absolute w-0.5 h-0.5 rounded-full bg-[var(--color-brand)]" style={{ bottom: "2px", left: "-3px",  animation: "twinkle 2.2s ease-in-out infinite",              animationDelay: "1.1s"  }} />
                <span className="absolute w-1 h-1 rounded-full bg-[var(--color-brand-soft)]" style={{ bottom: "-3px", right: "5px", animation: "twinkle 2.2s ease-in-out infinite",             animationDelay: "1.7s"  }} />
              </div>
              <h1
                className="text-7xl font-bold tracking-tight"
                style={{
                  background: "linear-gradient(135deg, var(--color-brand), var(--color-primary))",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                arif
              </h1>
            </div>
          </div>

          <div className="mt-12 space-y-0">
            <div ref={searchContainerRef} className="relative">
              <div className="relative flex items-center">
                <Input
                  ref={inputRef}
                  placeholder={imagePrev ? "İsteğe bağlı ek tarif..." : "Aklınızdaki ürünü tarif edin..."}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={onKey(handleSearch)}
                  onFocus={() => setShowExamples(true)}
                  disabled={state.loading}
                  maxLength={200}
                  className={PILL_INPUT_CLS}
                  autoFocus
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
                  <SpeechToggle enabled={isSpeechEnabled} onToggle={handleSpeechToggle} />
                  <span className="h-5 w-px bg-[var(--border-color)] shrink-0" />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={state.loading}
                    className="flex items-center justify-center focus:outline-none disabled:opacity-40"
                    title="Görsel ekle"
                  >
                    <ImageIcon className={`h-5 w-5 transition-colors ${imageFile ? "text-[var(--color-brand)]" : "text-[var(--color-secondary)] hover:text-[var(--color-brand)]"}`} />
                  </button>
                  <MicButton
                    recording={recording}
                    onPressStart={startListening}
                    onPressEnd={stopListening}
                    disabled={state.loading}
                  />
                  <Button
                    onClick={handleSearch}
                    disabled={state.loading || (!inputValue.trim() && !imageFile)}
                    size="icon"
                    className="rounded-full h-10 w-10 shrink-0"
                  >
                    {state.loading
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Search className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {/* Thumbnail - absolute below-left of search bar, no layout impact */}
              {imagePrev && (
                <div className="absolute top-full left-3 mt-2 z-20">
                  <div className="relative shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imagePrev}
                      alt="Seçilen görsel"
                      className="h-11 w-11 rounded-lg border border-[var(--border-color)] shadow-sm object-cover"
                    />
                    <button
                      type="button"
                      onClick={clearImage}
                      className={`absolute -top-1.5 -right-1.5 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-full w-4 h-4 flex items-center justify-center shadow-sm hover:bg-[var(--bg-accent)] transition-colors ${state.loading ? "hidden" : ""}`}
                      title="Görseli kaldır"
                    >
                      <X className="h-2.5 w-2.5 text-[var(--color-secondary)]" />
                    </button>
                  </div>
                </div>
              )}

              {showExamples && !state.loading && !imagePrev && (
                <div className="absolute top-full mt-2 left-0 right-0 bg-[var(--card-bg)] rounded-2xl shadow-xl border border-[var(--border-color)] p-4 z-10">
                  <p className="text-xs font-semibold text-[var(--color-secondary)] uppercase tracking-wide mb-3">
                    Şöyle arayabilirsiniz:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {EXAMPLES.map((ex) => (
                      <button
                        key={ex}
                        type="button"
                        onClick={() => { setInputValue(ex); setShowExamples(false); }}
                        className="text-sm px-3 py-1.5 rounded-full bg-[var(--bg-accent)] hover:bg-[var(--color-brand-soft)] text-[var(--color-primary)] transition-colors"
                      >
                        {ex}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Loading shimmer - absolute so it doesn't shift the layout */}
              {state.loading && (
                <div className={`absolute top-full left-0 mt-3 ${imagePrev ? "pl-16" : "pl-6"}`}>
                  <ShimmerMessage text={progressMsgs[progressIdx]} />
                </div>
              )}
            </div>

            {/* Reserved space for error - prevents layout shift */}
            <div className="min-h-[1.5rem] pt-1 pl-6">
              {state.error && <p className="text-destructive text-sm">{state.error}</p>}
            </div>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageSelect}
        />
      </main>
    );
  }

  // ── Clarifying screen ──────────────────────────────────────────────────────

  if (state.screen === "clarifying") {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-6 bg-[var(--bg-secondary)]">
        <div className="w-full max-w-2xl -translate-y-8 space-y-8">
          <div className="space-y-3 pl-6">
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold tracking-widest bg-[var(--bg-accent)]">
              <Sparkles className="h-3 w-3 text-[var(--color-brand)]" />
              <span className="flex items-baseline gap-1">
                <span
                  style={{
                    fontSize: "1em",
                    background: "linear-gradient(135deg, var(--color-brand), var(--color-primary))",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                    letterSpacing: "inherit",
                  }}
                >
                  arif
                </span>
                <span
                  className="uppercase text-[var(--color-primary)]"
                  style={{ fontSize: "0.75em", letterSpacing: "inherit" }}
                >
                  SORUYOR
                </span>
              </span>
            </span>
            <h2 className="text-2xl font-semibold leading-snug text-[var(--color-primary)]">{state.question}</h2>
          </div>

          <div className="clarifying-ring relative">
            <div className="relative flex items-center">
              <Input
                ref={inputRef}
                placeholder="Cevabınızı yazın..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={onKey(handleAnswer)}
                disabled={state.loading}
                maxLength={100}
                className={PILL_INPUT_CLS}
                autoFocus
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
                <SpeechToggle enabled={isSpeechEnabled} onToggle={handleSpeechToggle} />
                <span className="h-5 w-px bg-[var(--border-color)] shrink-0" />
                <MicButton
                  recording={recording}
                  onPressStart={startListening}
                  onPressEnd={stopListening}
                  disabled={state.loading}
                />
                <Button
                  onClick={handleAnswer}
                  disabled={state.loading || !inputValue.trim()}
                  size="icon"
                  className="rounded-full h-10 w-10 shrink-0"
                  title="Cevapla"
                >
                  {state.loading
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {state.loading && (
              <div className="absolute top-full left-0 mt-3 pl-6">
                <ShimmerMessage text={progressMsgs[progressIdx]} />
              </div>
            )}
          </div>

          <div className="min-h-[1.5rem] pl-6">
            {state.error && <p className="text-destructive text-sm">{state.error}</p>}
          </div>

          <div className="pl-6">
            <button
              onClick={handleReset}
              className="text-sm text-[var(--color-secondary)] hover:text-[var(--color-primary)] transition-colors underline-offset-4 hover:underline"
            >
              Aramayı sıfırla
            </button>
          </div>
        </div>
      </main>
    );
  }

  // ── Results screen ─────────────────────────────────────────────────────────

  const summaryText = buildSummary(state.results.length, state.extractedFeatures);
  const [best, ...rest] = state.results;

  return (
    <main className="min-h-screen p-6 bg-[var(--bg-primary)]">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-[var(--color-primary)]">Sonuçlar</h2>
            <p className="text-[var(--color-secondary)] text-sm">
              <span className="font-medium text-[var(--color-brand)]">arif:</span> {summaryText}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <SpeechToggle enabled={isSpeechEnabled} onToggle={handleSpeechToggle} />
            <Button variant="outline" onClick={handleReset}>
              <ArrowLeft className="h-4 w-4" />
              Yeni Arama
            </Button>
          </div>
        </div>

        {state.results.length === 0 ? (
          <div className="flex flex-col items-center py-20 gap-3 text-[var(--color-secondary)]">
            <span className="text-5xl">🔍</span>
            <p>Eşleşen ürün bulunamadı.</p>
            <Button variant="ghost" onClick={handleReset}>Tekrar dene</Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <div className="col-span-full">
              <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide bg-[var(--bg-accent)] text-[var(--color-brand)]">
                En İyi Eşleşme
              </span>
            </div>

            <ProductCard product={best} rank={1} onClick={() => setSelectedProduct(best)} />

            {rest.length > 0 && (
              <div className="col-span-full pt-1">
                <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide bg-[var(--border-color)] text-[var(--color-secondary)]">
                  Alternatifler
                </span>
              </div>
            )}

            {rest.map((product, i) => (
              <ProductCard key={product.id} product={product} rank={i + 2} onClick={() => setSelectedProduct(product)} />
            ))}
          </div>
        )}
      </div>

      {selectedProduct && (
        <ProductModal product={selectedProduct} onClose={() => setSelectedProduct(null)} />
      )}
    </main>
  );
}
