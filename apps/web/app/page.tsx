"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import styles from "./page.module.css";

/* ═══════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════ */

type Product = {
  sku: string;
  name: string;
  category: string;
  offers: { price: string; priceCurrency: string; availability: string };
  brand?: { name?: string };
  extensions?: { voiceDescription?: string; size?: string; gender?: string };
};

type Message = {
  role: "assistant" | "user";
  text: string;
  products?: Product[];
  isStreaming?: boolean;
};

type PaymentOrder = { id: string; amount: number; currency: string };
type RazorpayInstance = { open: () => void };
type RazorpayConstructor = new (
  options: Record<string, unknown>,
) => RazorpayInstance;

type SpeechRecognitionInstance = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult:
    | ((event: {
        results: ArrayLike<ArrayLike<{ transcript: string }>>;
      }) => void)
    | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;
type VoiceWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

type AmbientMood = "neutral" | "browsing" | "match" | "purchase" | "error";
type PurchaseStep = {
  label: string;
  detail: string;
  status: "pending" | "active" | "done" | "failed";
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/* ═══════════════════════════════════════════════════════════
   TypewriterText — character-by-character reveal
   ═══════════════════════════════════════════════════════════ */

function TypewriterText({
  text,
  speed = 18,
  onFinish,
}: {
  text: string;
  speed?: number;
  onFinish?: () => void;
}) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);
  const indexRef = useRef(0);

  useEffect(() => {
    indexRef.current = 0;
    setDisplayed("");
    setDone(false);

    const tick = () => {
      indexRef.current += 1;
      const next = text.slice(0, indexRef.current);
      setDisplayed(next);
      if (indexRef.current >= text.length) {
        setDone(true);
        onFinish?.();
        return;
      }
      // Adaptive speed: pause on punctuation
      const char = text[indexRef.current - 1];
      const delay =
        char === "." || char === "!" || char === "?"
          ? speed * 6
          : char === ","
            ? speed * 3
            : speed;
      timer = window.setTimeout(tick, delay);
    };

    let timer = window.setTimeout(tick, speed);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return (
    <span>
      {displayed}
      {!done && <span className={styles.typewriterCursor} />}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════
   ProductEmbed — in-chat product card
   ═══════════════════════════════════════════════════════════ */

function ProductEmbed({
  product,
  onAsk,
  onCompare,
}: {
  product: Product;
  onAsk: (p: Product) => void;
  onCompare: (sku: string) => void;
}) {
  return (
    <div className={styles.productEmbed} onClick={() => onAsk(product)}>
      <div
        className={styles.embedImage}
        style={{ backgroundImage: `url(${imageFor(product)})` }}
      />
      <div className={styles.embedInfo}>
        <span className={styles.embedCategory}>{product.category}</span>
        <span className={styles.embedName}>{product.name}</span>
        <span className={styles.embedPrice}>
          {product.offers.priceCurrency} {product.offers.price}
        </span>
      </div>
      <div className={styles.embedActions}>
        <button
          className={styles.embedActionPrimary}
          onClick={(e) => {
            e.stopPropagation();
            onAsk(product);
          }}
        >
          Ask about this
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onCompare(product.sku);
          }}
        >
          Compare
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   VoiceOrb — cinematic full-screen voice overlay
   ═══════════════════════════════════════════════════════════ */

function VoiceOrb({
  listening,
  processing,
  onClose,
}: {
  listening: boolean;
  processing: boolean;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!listening) {
      // Cleanup
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (streamRef.current)
        streamRef.current.getTracks().forEach((t) => t.stop());
      return;
    }

    let ctx: CanvasRenderingContext2D | null = null;
    const canvas = canvasRef.current;
    if (canvas) {
      ctx = canvas.getContext("2d");
      canvas.width = 220;
      canvas.height = 220;
    }

    async function startAudio() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        streamRef.current = stream;
        const audioCtx = new AudioContext();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        function draw() {
          if (!ctx || !canvas) return;
          animFrameRef.current = requestAnimationFrame(draw);
          analyser.getByteFrequencyData(dataArray);

          const avg =
            dataArray.reduce((a, b) => a + b, 0) / dataArray.length / 255;
          const cx = canvas.width / 2;
          const cy = canvas.height / 2;

          ctx.clearRect(0, 0, canvas.width, canvas.height);

          // Outer glow rings
          for (let i = 3; i >= 0; i--) {
            const radius = 50 + avg * 30 + i * 12;
            const alpha = 0.08 - i * 0.015;
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(232, 104, 74, ${alpha})`;
            ctx.fill();
          }

          // Frequency bars in a circle
          const bars = 48;
          for (let i = 0; i < bars; i++) {
            const angle = (i / bars) * Math.PI * 2 - Math.PI / 2;
            const val = (dataArray[i % dataArray.length]! / 255) * 35 + 3;
            const r1 = 55 + avg * 10;
            const r2 = r1 + val;

            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(angle) * r1, cy + Math.sin(angle) * r1);
            ctx.lineTo(cx + Math.cos(angle) * r2, cy + Math.sin(angle) * r2);
            ctx.strokeStyle = `rgba(232, 104, 74, ${0.4 + (dataArray[i % dataArray.length]! / 255) * 0.6})`;
            ctx.lineWidth = 2;
            ctx.lineCap = "round";
            ctx.stroke();
          }
        }

        draw();
      } catch {
        // Mic not available — still show orb visually
      }
    }

    void startAudio();

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (streamRef.current)
        streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, [listening]);

  return (
    <div className={styles.voiceOrbOverlay}>
      <button className={styles.voiceOrbClose} onClick={onClose}>
        ✕
      </button>
      <div className={styles.voiceOrbContainer}>
        <canvas ref={canvasRef} className={styles.voiceOrbCanvas} />
        <div
          className={`${styles.voiceOrbCore} ${listening ? styles.voiceOrbCoreListening : ""} ${processing ? styles.voiceOrbCoreProcessing : ""}`}
        />
        <div className={styles.voiceOrbRing} />
        <div className={styles.voiceOrbRing} />
        <div className={styles.voiceOrbRing} />
      </div>
      <p className={styles.voiceOrbLabel}>
        {processing
          ? "Processing your words..."
          : listening
            ? "Listening to you"
            : "Tap to speak"}
      </p>
      <p className={styles.voiceOrbHint}>
        {listening
          ? "Speak naturally — I'm all ears"
          : "Click the orb or press Space"}
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   PurchaseFlow — animated gating visualization
   ═══════════════════════════════════════════════════════════ */

function PurchaseFlow({
  onClose,
  onPay,
  paymentReady,
}: {
  onClose: () => void;
  onPay: () => void;
  paymentReady: boolean;
}) {
  const [steps, setSteps] = useState<PurchaseStep[]>([
    {
      label: "Identity confirmed",
      detail: "User explicitly said yes",
      status: "pending",
    },
    {
      label: "Stock verified",
      detail: "Checking live availability",
      status: "pending",
    },
    {
      label: "Payment prepared",
      detail: "Creating Razorpay order",
      status: "pending",
    },
  ]);

  useEffect(() => {
    // Animate steps sequentially
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(
      setTimeout(
        () =>
          setSteps((s) =>
            s.map((st, i) => (i === 0 ? { ...st, status: "active" } : st)),
          ),
        300,
      ),
    );
    timers.push(
      setTimeout(
        () =>
          setSteps((s) =>
            s.map((st, i) => (i === 0 ? { ...st, status: "done" } : st)),
          ),
        1200,
      ),
    );
    timers.push(
      setTimeout(
        () =>
          setSteps((s) =>
            s.map((st, i) => (i === 1 ? { ...st, status: "active" } : st)),
          ),
        1500,
      ),
    );
    timers.push(
      setTimeout(
        () =>
          setSteps((s) =>
            s.map((st, i) => (i === 1 ? { ...st, status: "done" } : st)),
          ),
        2800,
      ),
    );
    timers.push(
      setTimeout(
        () =>
          setSteps((s) =>
            s.map((st, i) => (i === 2 ? { ...st, status: "active" } : st)),
          ),
        3100,
      ),
    );
    timers.push(
      setTimeout(
        () =>
          setSteps((s) =>
            s.map((st, i) =>
              i === 2
                ? { ...st, status: paymentReady ? "done" : "failed" }
                : st,
            ),
          ),
        4200,
      ),
    );
    return () => timers.forEach(clearTimeout);
  }, [paymentReady]);

  const allDone = steps.every((s) => s.status === "done");

  return (
    <div className={styles.purchaseOverlay}>
      <div className={styles.purchaseSheet}>
        <div className={styles.purchaseHeader}>
          <p>Secure checkout</p>
          <h2>Verifying your purchase</h2>
        </div>

        <div className={styles.purchaseSteps}>
          {steps.map((step, i) => (
            <div key={step.label}>
              <div
                className={`${styles.purchaseStep} ${step.status === "active" ? styles.stepActive : ""} ${step.status === "done" ? styles.stepDone : ""} ${step.status === "failed" ? styles.stepFailed : ""}`}
              >
                <div className={styles.stepIcon}>
                  {step.status === "done"
                    ? "✓"
                    : step.status === "failed"
                      ? "✕"
                      : step.status === "active"
                        ? "◉"
                        : i + 1}
                </div>
                <div className={styles.stepContent}>
                  <strong>{step.label}</strong>
                  <small>{step.detail}</small>
                </div>
              </div>
              {i < steps.length - 1 && (
                <div
                  className={`${styles.stepLine} ${step.status === "done" ? styles.stepLineFilled : ""}`}
                />
              )}
            </div>
          ))}
        </div>

        <button
          className={styles.purchaseCTA}
          disabled={!allDone}
          onClick={onPay}
        >
          {allDone ? "Pay Now →" : "Verifying..."}
        </button>
        <button className={styles.purchaseClose} onClick={onClose}>
          Cancel and return
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Main Page Component
   ═══════════════════════════════════════════════════════════ */

export default function Home() {
  // ── State ──
  const [products, setProducts] = useState<Product[]>([]);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      text: "Hey there. Tell me what you're looking for — I'll search the catalog, compare options, and get you to checkout when you're ready.",
    },
  ]);
  const [sessionId, setSessionId] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [paymentOrder, setPaymentOrder] = useState<PaymentOrder>();
  const [paymentStatus, setPaymentStatus] = useState("");
  const [activeProduct, setActiveProduct] = useState<Product>();
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  const [speakReplies, setSpeakReplies] = useState(true);
  const [voiceLanguage, setVoiceLanguage] = useState("en-IN");
  const [sortHint, setSortHint] = useState("");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogCategory, setCatalogCategory] = useState("All");
  const [focusedProductSku, setFocusedProductSku] = useState("");
  const [savedSkus, setSavedSkus] = useState<string[]>([]);
  const [compareSkus, setCompareSkus] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState<number | null>(null);
  const [suggestedActions, setSuggestedActions] = useState<string[]>([
    "Find something for me",
    "Show bestsellers",
    "Help me compare",
  ]);
  const [showVoiceOrb, setShowVoiceOrb] = useState(false);
  const [voiceProcessing, setVoiceProcessing] = useState(false);
  const [ambientMood, setAmbientMood] = useState<AmbientMood>("neutral");
  const [showPurchaseFlow, setShowPurchaseFlow] = useState(false);
  const [streamingIndex, setStreamingIndex] = useState<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── Auto-scroll on new messages ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingIndex]);

  // ── Razorpay script ──
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    document.body.appendChild(script);
    return () => script.remove();
  }, []);

  // ── Keyboard shortcut ──
  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key === "k") {
        event.preventDefault();
        document
          .querySelector<HTMLInputElement>("[data-chat-input='true']")
          ?.focus();
      }
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  // ── Payment polling ──
  useEffect(() => {
    if (!paymentOrder) return;
    const timer = window.setInterval(async () => {
      const response = await fetch(
        `${API_URL}/payments/orders/${paymentOrder.id}`,
      );
      if (!response.ok) return;
      const payload = await response.json();
      setPaymentStatus(payload.data.status);
      if (["paid", "failed"].includes(payload.data.status))
        window.clearInterval(timer);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [paymentOrder]);

  // ── Voice support check ──
  useEffect(() => {
    const voiceWindow = window as VoiceWindow;
    setVoiceSupported(
      Boolean(
        voiceWindow.SpeechRecognition || voiceWindow.webkitSpeechRecognition,
      ),
    );
  }, []);

  // ── Initialize session + catalog ──
  useEffect(() => {
    async function initialise() {
      try {
        const [catalogResponse, sessionResponse] = await Promise.all([
          fetch(`${API_URL}/catalog/products?limit=6`),
          fetch(`${API_URL}/agent/session`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
          }),
        ]);
        if (!catalogResponse.ok || !sessionResponse.ok)
          throw new Error(
            "The assistant is offline. Start the backend on port 4000.",
          );
        const catalog = await catalogResponse.json();
        const session = await sessionResponse.json();
        setProducts(catalog.data ?? []);
        setSessionId(session.data.sessionId);
      } catch (initialisationError) {
        setError(
          initialisationError instanceof Error
            ? initialisationError.message
            : "Unable to connect to Hyber.",
        );
      } finally {
        setLoading(false);
      }
    }
    void initialise();
  }, []);

  // ── Ambient mood detection ──
  const detectMood = useCallback((reply: string): AmbientMood => {
    const lower = reply.toLowerCase();
    if (
      lower.includes("payment") ||
      lower.includes("order") ||
      lower.includes("purchase") ||
      lower.includes("checkout")
    )
      return "purchase";
    if (
      lower.includes("found") ||
      lower.includes("recommend") ||
      lower.includes("match") ||
      lower.includes("perfect") ||
      lower.includes("great choice")
    )
      return "match";
    if (
      lower.includes("error") ||
      lower.includes("sorry") ||
      lower.includes("unable") ||
      lower.includes("rejected")
    )
      return "error";
    if (
      lower.includes("search") ||
      lower.includes("browse") ||
      lower.includes("looking") ||
      lower.includes("options")
    )
      return "browsing";
    return "neutral";
  }, []);

  // ── Send message ──
  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !sessionId || sending) return;
    setDraft("");
    setError("");
    setMessages((current) => [...current, { role: "user", text }]);
    setSending(true);
    setAmbientMood("browsing");

    try {
      const response = await fetch(`${API_URL}/agent/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: text }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(
          payload.error?.message ?? "The assistant could not answer.",
        );

      const resultProducts = (payload.data.selectedProducts ?? []).map(
        normalizeProduct,
      );

      // Add message with streaming flag and embedded products
      setMessages((current) => {
        const newMsg: Message = {
          role: "assistant",
          text: payload.data.reply,
          products: resultProducts.length > 0 ? resultProducts : undefined,
          isStreaming: true,
        };
        setStreamingIndex(current.length);
        return [...current, newMsg];
      });

      // Detect mood from reply
      setAmbientMood(detectMood(payload.data.reply));

      setSuggestedActions(resultProductsForActions(payload.data.reply));

      if (speakReplies && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(
          new SpeechSynthesisUtterance(payload.data.reply),
        );
      }

      if (resultProducts.length > 0) {
        setActiveProduct(resultProducts[0]);
        setSortHint(resultProducts[0].category);
        setFocusedProductSku(resultProducts[0].sku);
        setProducts((current) => {
          const merged = [...resultProducts, ...current];
          return merged.filter(
            (product, index, all) =>
              all.findIndex(
                (candidate) => candidate.sku === product.sku,
              ) === index,
          );
        });
      }

      if (payload.data.paymentOrder) {
        setPaymentOrder(payload.data.paymentOrder);
        setShowPurchaseFlow(true);
        setAmbientMood("purchase");
      }
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "The assistant could not answer.",
      );
      setAmbientMood("error");
    } finally {
      setSending(false);
    }
  }

  function askAssistant(prompt: string) {
    setDraft(prompt);
  }

  function askAboutProduct(product: Product) {
    setActiveProduct(product);
    setFocusedProductSku(product.sku);
    setDraft(`Tell me about ${product.name}, SKU ${product.sku}`);
  }

  function runSuggestedAction(action: string) {
    setDraft(action);
    window.setTimeout(
      () =>
        document
          .querySelector<HTMLFormElement>("[data-voice-form='true']")
          ?.requestSubmit(),
      80,
    );
  }

  // ── Voice ──
  function toggleVoice() {
    const voiceWindow = window as VoiceWindow;
    const Recognition =
      voiceWindow.SpeechRecognition ?? voiceWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setError(
        "Voice input is not supported in this browser. Try Chrome or Edge.",
      );
      return;
    }

    if (voiceListening) {
      setVoiceListening(false);
      setShowVoiceOrb(false);
      return;
    }

    setShowVoiceOrb(true);
    const recognition = new Recognition();
    recognition.lang = voiceLanguage;
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? "";
      setDraft(transcript);
      setVoiceListening(false);
      setVoiceProcessing(true);
      window.setTimeout(() => {
        setShowVoiceOrb(false);
        setVoiceProcessing(false);
        if (handsFree && transcript) {
          window.setTimeout(() => {
            const form = document.querySelector(
              "[data-voice-form='true']",
            ) as HTMLFormElement | null;
            form?.requestSubmit();
          }, 120);
        }
      }, 600);
    };
    recognition.onend = () => setVoiceListening(false);
    recognition.onerror = () => {
      setVoiceListening(false);
      setShowVoiceOrb(false);
      setError("Voice input could not be heard. Please try again.");
    };
    setError("");
    setVoiceListening(true);
    recognition.start();
  }

  function speakMessage(text: string) {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  }

  function speakLatest() {
    const latest = [...messages]
      .reverse()
      .find((message) => message.role === "assistant");
    if (latest) speakMessage(latest.text);
  }

  async function copyMessage(text: string, index: number) {
    await navigator.clipboard?.writeText(text);
    setCopiedMessage(index);
    window.setTimeout(() => setCopiedMessage(null), 1400);
  }

  async function resetConversation() {
    const response = await fetch(`${API_URL}/agent/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (!response.ok) return setError("Could not start a fresh conversation.");
    const session = await response.json();
    setSessionId(session.data.sessionId);
    setMessages([
      {
        role: "assistant",
        text: "Fresh start. What are we looking for this time?",
      },
    ]);
    setActiveProduct(undefined);
    setFocusedProductSku("");
    setPaymentOrder(undefined);
    setPaymentStatus("");
    setContextOpen(false);
    setAmbientMood("neutral");
    setStreamingIndex(null);
  }

  async function openCheckout() {
    if (!paymentOrder) return;
    const config = await fetch(`${API_URL}/payments/config`).then((response) =>
      response.json(),
    );
    const Razorpay = (
      window as Window & { Razorpay?: RazorpayConstructor }
    ).Razorpay;
    if (!Razorpay || !config.data.keyId) {
      setError(
        "Add Razorpay test credentials to the backend before opening checkout.",
      );
      return;
    }
    new Razorpay({
      key: config.data.keyId,
      amount: paymentOrder.amount,
      currency: paymentOrder.currency,
      order_id: paymentOrder.id,
      name: "Hyber",
      description: "Hyber purchase",
      theme: { color: "#e8684a" },
    }).open();
    setShowPurchaseFlow(false);
  }

  function toggleCompare(sku: string) {
    setCompareSkus((current) =>
      current.includes(sku)
        ? current.filter((item) => item !== sku)
        : current.length < 2
          ? [...current, sku]
          : [current[1]!, sku],
    );
  }

  // ── Derived state ──
  const categories = useMemo(
    () => [
      "All",
      ...Array.from(new Set(products.map((product) => product.category))),
    ],
    [products],
  );

  const visibleProducts = useMemo(() => {
    return sortProducts(products, sortHint, activeProduct).filter((product) => {
      if (focusedProductSku && product.sku !== focusedProductSku) return false;
      const matchesCategory =
        catalogCategory === "All" || product.category === catalogCategory;
      const query = catalogQuery.toLowerCase();
      return (
        matchesCategory &&
        (!query ||
          `${product.name} ${product.category} ${product.sku}`
            .toLowerCase()
            .includes(query))
      );
    });
  }, [
    products,
    sortHint,
    activeProduct,
    focusedProductSku,
    catalogCategory,
    catalogQuery,
  ]);

  const savedProducts = useMemo(
    () => products.filter((product) => savedSkus.includes(product.sku)),
    [products, savedSkus],
  );
  const compareProducts = useMemo(
    () => products.filter((product) => compareSkus.includes(product.sku)),
    [products, compareSkus],
  );

  // ── Ambient mood class ──
  const ambientClass =
    ambientMood === "browsing"
      ? styles.ambientBrowsing
      : ambientMood === "match"
        ? styles.ambientMatch
        : ambientMood === "purchase"
          ? styles.ambientPurchase
          : ambientMood === "error"
            ? styles.ambientError
            : "";

  /* ═══════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════ */

  return (
    <>
      {/* ── Ambient Background ── */}
      <div className={`${styles.ambientBg} ${ambientClass}`}>
        <div className={styles.ambientBlob} />
        <div className={styles.ambientBlob} />
        <div className={styles.ambientBlob} />
      </div>

      {/* ── Voice Orb Overlay ── */}
      {showVoiceOrb && (
        <VoiceOrb
          listening={voiceListening}
          processing={voiceProcessing}
          onClose={() => {
            setShowVoiceOrb(false);
            setVoiceListening(false);
          }}
        />
      )}

      {/* ── Purchase Flow Overlay ── */}
      {showPurchaseFlow && paymentOrder && (
        <PurchaseFlow
          onClose={() => setShowPurchaseFlow(false)}
          onPay={() => void openCheckout()}
          paymentReady={Boolean(paymentOrder)}
        />
      )}

      <main className={styles.page}>
        {/* ── Header ── */}
        <header className={styles.header}>
          <a className={styles.wordmark} href="/" aria-label="Hyber home">
            <span className={styles.mark}>H</span>
            <span>hyber</span>
          </a>
          <div className={styles.headerMeta}>
            <span className={styles.statusDot} />
            <span>
              {loading
                ? "Connecting"
                : sessionId
                  ? "Assistant online"
                  : "Offline"}
            </span>
            <span className={styles.headerDivider} />
            <span>INR / India</span>
          </div>
        </header>

        {/* ── Intro ── */}
        <section className={styles.intro}>
          <p className={styles.kicker}>AI-powered voice commerce</p>
          <h1>
            Find something
            <br />
            <em>worth keeping.</em>
          </h1>
          <p className={styles.introText}>
            Hyber is your patient, conversational storefront. Browse the
            collection or talk to the AI salesperson — voice or text.
          </p>
        </section>

        {/* ── Workspace ── */}
        <section className={styles.workspace}>
          {/* ── Catalog Panel ── */}
          <div className={styles.catalogPanel}>
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.eyebrow}>
                  {focusedProductSku ? "Selected by Hyber" : "Curated today"}
                </p>
                <h2>
                  {focusedProductSku ? "Your match" : "From the catalog"}
                </h2>
              </div>
              <span className={styles.headingActions}>
                {focusedProductSku && (
                  <button
                    className={styles.clearFocus}
                    onClick={() => {
                      setFocusedProductSku("");
                      setActiveProduct(undefined);
                      setSortHint("");
                    }}
                  >
                    View all
                  </button>
                )}
                <span className={styles.count}>
                  {visibleProducts.length || "--"} of{" "}
                  {products.length || "--"}
                </span>
              </span>
            </div>

            <div className={styles.catalogTools}>
              <label className={styles.catalogSearch}>
                <span>⌕</span>
                <input
                  value={catalogQuery}
                  onChange={(event) => setCatalogQuery(event.target.value)}
                  placeholder="Search this collection"
                  aria-label="Search this collection"
                />
              </label>
              <div
                className={styles.categoryRail}
                role="tablist"
                aria-label="Product categories"
              >
                {categories.map((category) => (
                  <button
                    className={
                      catalogCategory === category ? styles.categoryActive : ""
                    }
                    key={category}
                    onClick={() => setCatalogCategory(category)}
                    role="tab"
                    aria-selected={catalogCategory === category}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.productGrid}>
              {visibleProducts.map((product, index) => (
                <article
                  className={`${styles.productCard} ${activeProduct?.sku === product.sku ? styles.activeCard : ""}`}
                  key={product.sku}
                >
                  <button
                    className={styles.productOpen}
                    onClick={() => askAboutProduct(product)}
                  >
                    <span
                      className={styles.productImage}
                      style={{
                        backgroundImage: `url(${imageFor(product)})`,
                      }}
                      aria-label={`${product.name} product image`}
                    />
                    <span className={styles.productInfo}>
                      <span className={styles.productMeta}>
                        <span className={styles.productCategory}>
                          {product.category}
                        </span>
                        <span className={styles.productIndex}>
                          0{index + 1}
                        </span>
                      </span>
                      <strong>{product.name}</strong>
                      <span className={styles.productBottom}>
                        <span>
                          {product.offers.priceCurrency}{" "}
                          {product.offers.price}
                        </span>
                        <span className={styles.inStock}>In stock</span>
                      </span>
                      <span className={styles.compareLink}>
                        {compareSkus.includes(product.sku)
                          ? "In compare"
                          : "＋ Compare"}
                      </span>
                    </span>
                  </button>
                  <button
                    className={`${styles.saveButton} ${savedSkus.includes(product.sku) ? styles.saved : ""}`}
                    onClick={() =>
                      setSavedSkus((current) =>
                        current.includes(product.sku)
                          ? current.filter((sku) => sku !== product.sku)
                          : [...current, product.sku],
                      )
                    }
                    aria-label={
                      savedSkus.includes(product.sku)
                        ? `Remove ${product.name} from shortlist`
                        : `Save ${product.name} to shortlist`
                    }
                  >
                    {savedSkus.includes(product.sku) ? "♥" : "♡"}
                  </button>
                  <button
                    className={styles.compareButton}
                    onClick={() => toggleCompare(product.sku)}
                    aria-label={`Compare ${product.name}`}
                  >
                    {compareSkus.includes(product.sku) ? "✓" : "＋"}
                  </button>
                </article>
              ))}
            </div>

            {!loading && products.length === 0 && !error && (
              <p className={styles.emptyState}>
                No products found in the catalog.
              </p>
            )}

            <button
              className={styles.catalogPrompt}
              onClick={() =>
                askAssistant("Show me your best options under INR 3000")
              }
            >
              Ask for a better match <span>↗</span>
            </button>

            {savedProducts.length > 0 && (
              <div className={styles.shortlist}>
                <div>
                  <p className={styles.eyebrow}>Your shortlist</p>
                  <span>{savedProducts.length} saved for later</span>
                </div>
                <div className={styles.shortlistItems}>
                  {savedProducts.map((product) => (
                    <button
                      key={product.sku}
                      onClick={() => {
                        setActiveProduct(product);
                        setFocusedProductSku(product.sku);
                      }}
                    >
                      <span
                        style={{
                          backgroundImage: `url(${imageFor(product)})`,
                        }}
                      />
                      <strong>{product.name}</strong>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ═══════════════════════════════════════
             CHAT PANEL
             ═══════════════════════════════════════ */}
          <div className={`${styles.chatPanel} ${styles.floatingChat}`}>
            {/* Chat Header */}
            <div className={styles.chatHeader}>
              <div className={styles.agentIdentity}>
                <span
                  className={`${styles.agentAvatar} ${voiceListening || sending ? styles.agentActive : ""}`}
                >
                  h
                </span>
                <span>
                  <strong>Hyber salesperson</strong>
                  <small>
                    {voiceListening
                      ? "Listening to you"
                      : sending
                        ? "Finding the right words"
                        : "Knows the collection"}
                  </small>
                </span>
              </div>
              <div className={styles.chatHeaderActions}>
                <span className={styles.livePill}>LIVE</span>
                <button
                  onClick={() => setContextOpen((value) => !value)}
                  aria-label="Open conversation context"
                >
                  ⌘
                </button>
                <button
                  onClick={() => void resetConversation()}
                  aria-label="Start a new conversation"
                >
                  ↻
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className={styles.messages} aria-live="polite">
              <div className={styles.dateLabel}>TODAY</div>
              {messages.map((message, index) => (
                <div key={`${message.role}-${index}`}>
                  <div
                    className={`${styles.messageRow} ${message.role === "user" ? styles.userRow : ""}`}
                  >
                    {message.role === "assistant" && (
                      <span className={styles.tinyAvatar}>h</span>
                    )}
                    <div className={styles.messageBubble}>
                      <p
                        className={
                          message.role === "user"
                            ? styles.userMessage
                            : styles.assistantMessage
                        }
                      >
                        {message.role === "assistant" &&
                        message.isStreaming &&
                        streamingIndex === index ? (
                          <TypewriterText
                            text={message.text}
                            speed={16}
                            onFinish={() => {
                              setStreamingIndex(null);
                              setMessages((msgs) =>
                                msgs.map((m, i) =>
                                  i === index
                                    ? { ...m, isStreaming: false }
                                    : m,
                                ),
                              );
                            }}
                          />
                        ) : (
                          message.text
                        )}
                      </p>
                      {message.role === "assistant" && (
                        <div className={styles.messageActions}>
                          <button
                            onClick={() => speakMessage(message.text)}
                          >
                            Listen
                          </button>
                          <button
                            onClick={() =>
                              void copyMessage(message.text, index)
                            }
                          >
                            {copiedMessage === index ? "Copied" : "Copy"}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ── In-chat Product Embeds ── */}
                  {message.products &&
                    message.products.length > 0 &&
                    (!message.isStreaming || streamingIndex !== index) && (
                      <div className={styles.productEmbedRow}>
                        {message.products.map((p) => (
                          <ProductEmbed
                            key={p.sku}
                            product={p}
                            onAsk={askAboutProduct}
                            onCompare={toggleCompare}
                          />
                        ))}
                      </div>
                    )}
                </div>
              ))}
              {sending && (
                <div className={styles.typing}>
                  <span />
                  <span />
                  <span /> thinking
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Suggested Actions */}
            <div className={styles.suggestedActions}>
              {suggestedActions.map((action) => (
                <button key={action} onClick={() => runSuggestedAction(action)}>
                  {action}
                  <span>↗</span>
                </button>
              ))}
            </div>

            {/* Context Card */}
            {contextOpen && (
              <aside className={styles.contextCard}>
                <div>
                  <small>CONVERSATION MEMORY</small>
                  <button
                    onClick={() => setContextOpen(false)}
                    aria-label="Close context"
                  >
                    ×
                  </button>
                </div>
                <strong>Hyber is keeping track of</strong>
                <ul>
                  <li>
                    {activeProduct
                      ? `Your interest in ${activeProduct.name}`
                      : "Your product preferences as they emerge"}
                  </li>
                  <li>
                    {savedProducts.length
                      ? `${savedProducts.length} shortlisted item${savedProducts.length > 1 ? "s" : ""}`
                      : "Nothing shortlisted yet"}
                  </li>
                  <li>
                    {voiceLanguage === "en-IN"
                      ? "English conversation"
                      : `${voiceLanguage} voice conversation`}
                  </li>
                </ul>
                <button
                  className={styles.contextAction}
                  onClick={() => void resetConversation()}
                >
                  Clear and start fresh
                </button>
              </aside>
            )}

            {/* Active Product Badge */}
            {activeProduct && (
              <button
                className={styles.activeProduct}
                onClick={() =>
                  askAssistant(`Tell me more about ${activeProduct.name}`)
                }
              >
                <span
                  className={styles.activeProductImage}
                  style={{
                    backgroundImage: `url(${imageFor(activeProduct)})`,
                  }}
                />
                <span>
                  <small>IN THIS CONVERSATION</small>
                  <strong>{activeProduct.name}</strong>
                  <em>
                    {activeProduct.offers.priceCurrency}{" "}
                    {activeProduct.offers.price}
                  </em>
                </span>
                <span className={styles.activeArrow}>↗</span>
              </button>
            )}

            {/* Error */}
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}

            {/* Payment Ready (inline) */}
            {paymentOrder && (
              <div className={styles.paymentReady}>
                <span className={styles.paymentIcon}>✓</span>
                <span>
                  <strong>
                    {paymentStatus === "paid"
                      ? "Payment confirmed"
                      : paymentStatus === "failed"
                        ? "Payment failed"
                        : "Payment ready"}
                  </strong>
                  <small>Razorpay order {paymentOrder.id}</small>
                </span>
                <b>{paymentStatus || "created"}</b>
                <button
                  onClick={() => setShowPurchaseFlow(true)}
                  disabled={paymentStatus === "paid"}
                >
                  {paymentStatus === "paid" ? "Done" : "Pay"}
                </button>
              </div>
            )}

            {/* Voice Mode Bar */}
            <div className={styles.voiceMode}>
              <span
                className={
                  voiceListening ? styles.voicePulse : styles.voiceIdle
                }
              />
              <span>
                {voiceListening
                  ? "Listening..."
                  : handsFree
                    ? "Hands-free mode"
                    : "Voice mode"}
              </span>
              <span className={styles.waveform} aria-hidden="true">
                {[1, 2, 3, 4, 5, 6, 7].map((bar) => (
                  <i
                    className={voiceListening ? styles.waveActive : ""}
                    key={bar}
                  />
                ))}
              </span>
              <select
                value={voiceLanguage}
                onChange={(event) => setVoiceLanguage(event.target.value)}
                aria-label="Voice language"
              >
                <option value="en-IN">English</option>
                <option value="hi-IN">Hindi</option>
                <option value="ta-IN">Tamil</option>
              </select>
              <button
                type="button"
                onClick={() => setHandsFree((value) => !value)}
                className={handsFree ? styles.voiceToggleActive : ""}
              >
                {handsFree ? "Hands-free" : "Manual"}
              </button>
              <button
                type="button"
                onClick={() => setSpeakReplies((value) => !value)}
              >
                {speakReplies ? "Sound on" : "Sound off"}
              </button>
              <button
                type="button"
                onClick={speakLatest}
                aria-label="Read latest answer aloud"
              >
                Listen
              </button>
            </div>

            {/* Composer */}
            <form
              className={styles.composer}
              data-voice-form="true"
              onSubmit={sendMessage}
            >
              <input
                data-chat-input="true"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={
                  voiceListening
                    ? "Speak now..."
                    : handsFree
                      ? "Hands-free is ready"
                      : "Ask about the collection..."
                }
                disabled={!sessionId || sending}
                aria-label="Message Hyber salesperson"
              />
              <span className={styles.shortcutHint}>⌘ K</span>
              <button
                type="button"
                className={styles.micButton}
                onClick={toggleVoice}
                disabled={!voiceSupported || sending}
                aria-label={
                  voiceListening
                    ? "Stop voice input"
                    : "Start voice input"
                }
              >
                {voiceListening ? "■" : "●"}
              </button>
              <button
                type="submit"
                disabled={!sessionId || !draft.trim() || sending}
                aria-label="Send message"
              >
                ↑
              </button>
            </form>

            {/* Quick Suggestions */}
            <div className={styles.suggestionRow}>
              <button
                onClick={() =>
                  askAssistant("I need something for everyday use")
                }
              >
                Everyday
              </button>
              <button
                onClick={() =>
                  askAssistant(
                    "What is in stock for men in size UK 9?",
                  )
                }
              >
                Men&apos;s UK 9
              </button>
              <button
                onClick={() =>
                  askAssistant(
                    "What is the most interesting thing here?",
                  )
                }
              >
                Surprise me
              </button>
            </div>
          </div>
        </section>

        {/* ── Footer ── */}
        <footer className={styles.footer}>
          <span>Built for considered choices.</span>
          <span>Every purchase is confirmed before it moves.</span>
        </footer>

        {/* ── Compare Tray ── */}
        {compareSkus.length > 0 && (
          <div className={styles.compareTray}>
            <div>
              <strong>Compare products</strong>
              <span>{compareSkus.length} of 2 selected</span>
            </div>
            <div className={styles.compareThumbs}>
              {compareProducts.map((product) => (
                <span
                  key={product.sku}
                  style={{
                    backgroundImage: `url(${imageFor(product)})`,
                  }}
                />
              ))}
            </div>
            <button
              onClick={() => setCompareOpen(true)}
              disabled={compareSkus.length < 2}
            >
              Compare now <span>↗</span>
            </button>
            <button
              className={styles.clearCompare}
              onClick={() => setCompareSkus([])}
              aria-label="Clear comparison"
            >
              ×
            </button>
          </div>
        )}

        {/* ── Compare Overlay ── */}
        {compareOpen && (
          <div
            className={styles.compareOverlay}
            role="dialog"
            aria-modal="true"
            aria-label="Compare products"
            onClick={() => setCompareOpen(false)}
          >
            <div
              className={styles.compareSheet}
              onClick={(event) => event.stopPropagation()}
            >
              <div className={styles.compareSheetHead}>
                <div>
                  <p className={styles.eyebrow}>Decision view</p>
                  <h2>Which one feels right?</h2>
                </div>
                <button
                  onClick={() => setCompareOpen(false)}
                  aria-label="Close comparison"
                >
                  ×
                </button>
              </div>
              <div className={styles.compareColumns}>
                {compareProducts.map((product) => (
                  <article key={product.sku}>
                    <span
                      className={styles.compareImage}
                      style={{
                        backgroundImage: `url(${imageFor(product)})`,
                      }}
                    />
                    <small>{product.category}</small>
                    <h3>{product.name}</h3>
                    <strong>
                      {product.offers.priceCurrency} {product.offers.price}
                    </strong>
                    <p>
                      {product.extensions?.voiceDescription ??
                        "A considered pick from the Hyber collection."}
                    </p>
                    <button
                      onClick={() => {
                        setActiveProduct(product);
                        setFocusedProductSku(product.sku);
                        setCompareOpen(false);
                      }}
                    >
                      Ask Hyber about this ↗
                    </button>
                  </article>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   Helper Functions
   ═══════════════════════════════════════════════════════════ */

function resultProductsForActions(reply: string) {
  const lowerReply = reply.toLowerCase();
  if (lowerReply.includes("under") || lowerReply.includes("price"))
    return [
      "Show cheaper options",
      "Compare these picks",
      "What makes this worth it?",
    ];
  if (lowerReply.includes("stock") || lowerReply.includes("available"))
    return [
      "Show only in-stock items",
      "Find a similar option",
      "Tell me more about this",
    ];
  return [
    "Show me alternatives",
    "Compare these picks",
    "Why do you recommend it?",
  ];
}

function imageFor(product: Product) {
  const category = product.category.toLowerCase();
  if (category.includes("footwear"))
    return "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=85";
  if (category.includes("electronics"))
    return "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=900&q=85";
  if (category.includes("apparel"))
    return "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=900&q=85";
  if (category.includes("home"))
    return "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=900&q=85";
  if (category.includes("beauty"))
    return "https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=900&q=85";
  return "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=900&q=85";
}

function normalizeProduct(value: unknown): Product {
  const product = value as Partial<Product> & {
    price?: string | number;
    currency?: string;
    availability?: string;
  };

  return {
    sku: product.sku ?? "unknown-product",
    name: product.name ?? "Selected product",
    category: product.category ?? "Collection",
    brand: product.brand,
    extensions: product.extensions,
    offers: product.offers ?? {
      price: String(product.price ?? "0"),
      priceCurrency: product.currency ?? "INR",
      availability: product.availability ?? "https://schema.org/InStock",
    },
  };
}

function sortProducts(
  products: Product[],
  hint: string,
  activeProduct?: Product,
) {
  const activeSku = activeProduct?.sku;
  return [...products].sort((left, right) => {
    const score = (product: Product) => {
      let value = 0;
      if (product.sku === activeSku) value += 100;
      if (hint && product.category === hint) value += 20;
      return value;
    };
    return score(right) - score(left);
  });
}
