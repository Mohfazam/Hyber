"use client";

import { FormEvent, useEffect, useState } from "react";
import styles from "./page.module.css";

type Product = {
  sku: string;
  name: string;
  category: string;
  offers: { price: string; priceCurrency: string; availability: string };
};

type Message = { role: "assistant" | "user"; text: string };
type PaymentOrder = { id: string; amount: number; currency: string };
type RazorpayInstance = { open: () => void };
type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayInstance;
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
      if (payload.data.paymentOrder) setPaymentOrder(payload.data.paymentOrder);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "The assistant could not answer.");
    } finally {
      setSending(false);
    }
  }

  function askAssistant(prompt: string) { setDraft(prompt); }

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
          <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Curated today</p><h2>From the catalog</h2></div><span className={styles.count}>{products.length || "--"} items</span></div>
          <div className={styles.productGrid}>
            {products.map((product) => (
              <button className={styles.productCard} key={product.sku} onClick={() => askAssistant(`Tell me about ${product.name}, SKU ${product.sku}`)}>
                <span className={styles.productImage} aria-hidden="true">{product.category.slice(0, 1)}</span>
                <span className={styles.productInfo}><span className={styles.productCategory}>{product.category}</span><strong>{product.name}</strong><span className={styles.productBottom}><span>{product.offers.priceCurrency} {product.offers.price}</span><span className={styles.inStock}>In stock</span></span></span>
              </button>
            ))}
          </div>
          {!loading && products.length === 0 && !error && <p className={styles.emptyState}>No products found in the catalog.</p>}
          <button className={styles.catalogPrompt} onClick={() => askAssistant("Show me your best options under INR 3000")}>Ask for a better match <span>↗</span></button>
        </div>

        <div className={styles.chatPanel}>
          <div className={styles.chatHeader}><div className={styles.agentIdentity}><span className={styles.agentAvatar}>h</span><span><strong>Hyber salesperson</strong><small>Knows the collection</small></span></div><span className={styles.livePill}>LIVE</span></div>
          <div className={styles.messages} aria-live="polite"><div className={styles.dateLabel}>TODAY</div>
            {messages.map((message, index) => <div className={`${styles.messageRow} ${message.role === "user" ? styles.userRow : ""}`} key={`${message.role}-${index}`}>{message.role === "assistant" && <span className={styles.tinyAvatar}>h</span>}<p className={message.role === "user" ? styles.userMessage : styles.assistantMessage}>{message.text}</p></div>)}
            {sending && <div className={styles.typing}><span /><span /><span /> thinking</div>}
          </div>
          {error && <p className={styles.error} role="alert">{error}</p>}
          {paymentOrder && <div className={styles.paymentReady}><span className={styles.paymentIcon}>✓</span><span><strong>{paymentStatus === "paid" ? "Payment confirmed" : paymentStatus === "failed" ? "Payment failed" : "Payment ready"}</strong><small>Razorpay order {paymentOrder.id}</small></span><b>{paymentStatus || "created"}</b><button onClick={() => void openCheckout()} disabled={paymentStatus === "paid"}>Pay</button></div>}
          <form className={styles.composer} onSubmit={sendMessage}><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ask about the collection..." disabled={!sessionId || sending} aria-label="Message Hyber salesperson" /><button type="submit" disabled={!sessionId || !draft.trim() || sending} aria-label="Send message">↑</button></form>
          <div className={styles.suggestionRow}><button onClick={() => askAssistant("I need something for everyday use")}>Everyday</button><button onClick={() => askAssistant("What is in stock for men in size UK 9?")}>Men&apos;s UK 9</button><button onClick={() => askAssistant("What is the most interesting thing here?")}>Surprise me</button></div>
        </div>
      </section>
      <footer className={styles.footer}><span>Built for considered choices.</span><span>Every purchase is confirmed before it moves.</span></footer>
    </main>
  );
}
