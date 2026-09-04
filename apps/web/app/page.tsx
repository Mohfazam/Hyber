"use client";

import { FormEvent, useEffect, useState } from "react";
import styles from "./page.module.css";

type Product = {
  sku: string;
  name: string;
  category: string;
  offers: { price: string; priceCurrency: string; availability: string };
  brand?: { name?: string };
  extensions?: { voiceDescription?: string; size?: string; gender?: string };
};

type Message = { role: "assistant" | "user"; text: string };
type PaymentOrder = { id: string; amount: number; currency: string };
type RazorpayInstance = { open: () => void };
type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayInstance;
type SpeechRecognitionInstance = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;
type VoiceWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", text: "Tell me what you are looking for. I can search the catalog, compare options, and prepare a purchase when you are ready." },
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
  const [sortHint, setSortHint] = useState("");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogCategory, setCatalogCategory] = useState("All");

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    document.body.appendChild(script);
    return () => script.remove();
  }, []);

  useEffect(() => {
    if (!paymentOrder) return;
    const timer = window.setInterval(async () => {
      const response = await fetch(`${API_URL}/payments/orders/${paymentOrder.id}`);
      if (!response.ok) return;
      const payload = await response.json();
      setPaymentStatus(payload.data.status);
      if (["paid", "failed"].includes(payload.data.status)) window.clearInterval(timer);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [paymentOrder]);

  useEffect(() => {
    const voiceWindow = window as VoiceWindow;
    setVoiceSupported(Boolean(voiceWindow.SpeechRecognition || voiceWindow.webkitSpeechRecognition));
  }, []);

  useEffect(() => {
    async function initialise() {
      try {
        const [catalogResponse, sessionResponse] = await Promise.all([
          fetch(`${API_URL}/catalog/products?limit=6`),
          fetch(`${API_URL}/agent/session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }),
        ]);
        if (!catalogResponse.ok || !sessionResponse.ok) throw new Error("The assistant is offline. Start the backend on port 4000.");
        const catalog = await catalogResponse.json();
        const session = await sessionResponse.json();
        setProducts(catalog.data ?? []);
        setSessionId(session.data.sessionId);
      } catch (initialisationError) {
        setError(initialisationError instanceof Error ? initialisationError.message : "Unable to connect to Hyber.");
      } finally {
        setLoading(false);
      }
    }
    void initialise();
  }, []);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !sessionId || sending) return;
    setDraft("");
    setError("");
    setMessages((current) => [...current, { role: "user", text }]);
    setSending(true);
    try {
      const response = await fetch(`${API_URL}/agent/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: text }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "The assistant could not answer.");
      setMessages((current) => [...current, { role: "assistant", text: payload.data.reply }]);
      const resultProducts = (payload.data.selectedProducts ?? []).map(normalizeProduct);
      if (resultProducts.length > 0) {
        setActiveProduct(resultProducts[0]);
        setSortHint(resultProducts[0].category);
      }
      if (payload.data.paymentOrder) setPaymentOrder(payload.data.paymentOrder);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "The assistant could not answer.");
    } finally {
      setSending(false);
    }
  }

  function askAssistant(prompt: string) { setDraft(prompt); }

  function toggleVoice() {
    const voiceWindow = window as VoiceWindow;
    const Recognition = voiceWindow.SpeechRecognition ?? voiceWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setError("Voice input is not supported in this browser. Try Chrome or Edge.");
      return;
    }

    if (voiceListening) {
      setVoiceListening(false);
      return;
    }

    const recognition = new Recognition();
    recognition.lang = "en-IN";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? "";
      setDraft(transcript);
      setVoiceListening(false);
    };
    recognition.onend = () => setVoiceListening(false);
    recognition.onerror = () => {
      setVoiceListening(false);
      setError("Voice input could not be heard. Please try again.");
    };
    setError("");
    setVoiceListening(true);
    recognition.start();
  }

  function speakLatest() {
    const latest = [...messages].reverse().find((message) => message.role === "assistant");
    if (latest && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(latest.text));
    }
  }

  const categories = ["All", ...Array.from(new Set(products.map((product) => product.category)))];
  const visibleProducts = sortProducts(products, sortHint, activeProduct).filter((product) => {
    const matchesCategory = catalogCategory === "All" || product.category === catalogCategory;
    const query = catalogQuery.toLowerCase();
    return matchesCategory && (!query || `${product.name} ${product.category} ${product.sku}`.toLowerCase().includes(query));
  });

  async function openCheckout() {
    if (!paymentOrder) return;
    const config = await fetch(`${API_URL}/payments/config`).then((response) => response.json());
    const Razorpay = (window as Window & { Razorpay?: RazorpayConstructor }).Razorpay;
    if (!Razorpay || !config.data.keyId) {
      setError("Add Razorpay test credentials to the backend before opening checkout.");
      return;
    }
    new Razorpay({ key: config.data.keyId, amount: paymentOrder.amount, currency: paymentOrder.currency, order_id: paymentOrder.id, name: "Hyber", description: "Hyber purchase" }).open();
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <a className={styles.wordmark} href="/" aria-label="Hyber home"><span className={styles.mark}>H</span><span>hyber</span></a>
        <div className={styles.headerMeta}><span className={styles.statusDot} /><span>{loading ? "Connecting" : sessionId ? "Assistant online" : "Offline"}</span><span className={styles.headerDivider} /><span>INR / India</span></div>
      </header>

      <section className={styles.intro}>
        <p className={styles.kicker}>Personal shopping, with a memory</p>
        <h1>Find something<br /><em>worth keeping.</em></h1>
        <p className={styles.introText}>Hyber is your patient, conversational storefront. Browse the collection or ask the salesperson to narrow it down.</p>
      </section>

      <section className={styles.workspace}>
        <div className={styles.catalogPanel}>
          <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Curated today</p><h2>From the catalog</h2></div><span className={styles.count}>{visibleProducts.length || "--"} of {products.length || "--"}</span></div>
          <div className={styles.catalogTools}>
            <label className={styles.catalogSearch}><span>⌕</span><input value={catalogQuery} onChange={(event) => setCatalogQuery(event.target.value)} placeholder="Search this collection" aria-label="Search this collection" /></label>
            <div className={styles.categoryRail} role="tablist" aria-label="Product categories">
              {categories.map((category) => <button className={catalogCategory === category ? styles.categoryActive : ""} key={category} onClick={() => setCatalogCategory(category)} role="tab" aria-selected={catalogCategory === category}>{category}</button>)}
            </div>
          </div>
          <div className={styles.productGrid}>
            {visibleProducts.map((product, index) => (
              <button className={`${styles.productCard} ${activeProduct?.sku === product.sku ? styles.activeCard : ""}`} key={product.sku} onClick={() => { setActiveProduct(product); askAssistant(`Tell me about ${product.name}, SKU ${product.sku}`); }}>
                <span className={styles.productImage} style={{ backgroundImage: `url(${imageFor(product)})` }} aria-label={`${product.name} product image`} />
                <span className={styles.productInfo}><span className={styles.productMeta}><span className={styles.productCategory}>{product.category}</span><span className={styles.productIndex}>0{index + 1}</span></span><strong>{product.name}</strong><span className={styles.productBottom}><span>{product.offers.priceCurrency} {product.offers.price}</span><span className={styles.inStock}>In stock</span></span></span>
              </button>
            ))}
          </div>
          {!loading && products.length === 0 && !error && <p className={styles.emptyState}>No products found in the catalog.</p>}
          <button className={styles.catalogPrompt} onClick={() => askAssistant("Show me your best options under INR 3000")}>Ask for a better match <span>↗</span></button>
        </div>

        <div className={`${styles.chatPanel} ${styles.floatingChat}`}>
          <div className={styles.chatHeader}><div className={styles.agentIdentity}><span className={styles.agentAvatar}>h</span><span><strong>Hyber salesperson</strong><small>Knows the collection</small></span></div><span className={styles.livePill}>LIVE</span></div>
          <div className={styles.messages} aria-live="polite"><div className={styles.dateLabel}>TODAY</div>
            {messages.map((message, index) => <div className={`${styles.messageRow} ${message.role === "user" ? styles.userRow : ""}`} key={`${message.role}-${index}`}>{message.role === "assistant" && <span className={styles.tinyAvatar}>h</span>}<p className={message.role === "user" ? styles.userMessage : styles.assistantMessage}>{message.text}</p></div>)}
            {sending && <div className={styles.typing}><span /><span /><span /> thinking</div>}
          </div>
          {activeProduct && <button className={styles.activeProduct} onClick={() => askAssistant(`Tell me more about ${activeProduct.name}`)}><span className={styles.activeProductImage} style={{ backgroundImage: `url(${imageFor(activeProduct)})` }} /><span><small>IN THIS CONVERSATION</small><strong>{activeProduct.name}</strong><em>{activeProduct.offers.priceCurrency} {activeProduct.offers.price}</em></span><span className={styles.activeArrow}>↗</span></button>}
          {error && <p className={styles.error} role="alert">{error}</p>}
          {paymentOrder && <div className={styles.paymentReady}><span className={styles.paymentIcon}>✓</span><span><strong>{paymentStatus === "paid" ? "Payment confirmed" : paymentStatus === "failed" ? "Payment failed" : "Payment ready"}</strong><small>Razorpay order {paymentOrder.id}</small></span><b>{paymentStatus || "created"}</b><button onClick={() => void openCheckout()} disabled={paymentStatus === "paid"}>Pay</button></div>}
          <div className={styles.voiceMode}><span className={voiceListening ? styles.voicePulse : styles.voiceIdle} />{voiceListening ? "Listening..." : "Voice mode"}<button type="button" onClick={speakLatest} aria-label="Read latest answer aloud">Listen</button></div>
          <form className={styles.composer} onSubmit={sendMessage}><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={voiceListening ? "Speak now..." : "Ask about the collection..."} disabled={!sessionId || sending} aria-label="Message Hyber salesperson" /><button type="button" className={styles.micButton} onClick={toggleVoice} disabled={!voiceSupported || sending} aria-label={voiceListening ? "Stop voice input" : "Start voice input"}>{voiceListening ? "■" : "●"}</button><button type="submit" disabled={!sessionId || !draft.trim() || sending} aria-label="Send message">↑</button></form>
          <div className={styles.suggestionRow}><button onClick={() => askAssistant("I need something for everyday use")}>Everyday</button><button onClick={() => askAssistant("What is in stock for men in size UK 9?")}>Men&apos;s UK 9</button><button onClick={() => askAssistant("What is the most interesting thing here?")}>Surprise me</button></div>
        </div>
      </section>
      <footer className={styles.footer}><span>Built for considered choices.</span><span>Every purchase is confirmed before it moves.</span></footer>
    </main>
  );
}

function imageFor(product: Product) {
  const category = product.category.toLowerCase();
  if (category.includes("footwear")) return "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=85";
  if (category.includes("electronics")) return "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=900&q=85";
  if (category.includes("apparel")) return "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=900&q=85";
  if (category.includes("home")) return "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=900&q=85";
  if (category.includes("beauty")) return "https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=900&q=85";
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

function sortProducts(products: Product[], hint: string, activeProduct?: Product) {
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
