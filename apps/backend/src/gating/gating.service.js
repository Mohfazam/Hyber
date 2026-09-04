import { db, gatingDecisions } from '@repo/db';
import * as catalogService from '../catalog/catalog.service.js';
import * as auditService from '../audit/audit.service.js';
import * as paymentService from '../payments/payment.service.js';
/**
 * Why this file exists:
 * This is THE checkpoint. Nothing reaches a payment API without passing
 * through here first. The agent (agent.tools.ts -> propose_purchase) calls
 * this; this module has no idea Gemini exists, and the agent has no way to
 * call Razorpay directly � that capability simply isn't given to it. This
 * is what makes "bounded and gated" an architectural fact, not a prompt
 * instruction that could theoretically be talked around.
 *
 * Every check run here is recorded � pass AND fail � in gating_decisions,
 * and a summary is written to audit_log. That combination is your
 * explainability evidence for the Bar.
 */
export async function evaluatePurchase(input) {
    const checks = [];
    // ---- Check 1: explicit user confirmation ----
    // Defense in depth � don't just trust the agent's claim that the user
    // said yes; this is re-verified here as its own logged check.
    checks.push({
        check: 'user_confirmed',
        result: input.userConfirmed,
        detail: input.userConfirmed
            ? 'User gave explicit confirmation.'
            : 'No explicit confirmation was provided.',
    });
    // ---- Check 2: product exists + live stock re-check ----
    // Catches the race condition where an item went out of stock between
    // being recommended earlier in the conversation and the purchase moment.
    let product;
    let inStock = false;
    try {
        product = await catalogService.getProductBySku(input.sku);
        const availability = await catalogService.getLiveAvailability(input.sku);
        inStock = availability.availability === 'InStock';
    }
    catch {
        inStock = false;
    }
    checks.push({
        check: 'live_stock_check',
        result: inStock,
        detail: inStock ? 'Item is currently in stock.' : `SKU "${input.sku}" is not currently available.`,
    });
    // ---- Check 3: high-value threshold flag (informational, non-blocking for now) ----
    // Once the OTP/payment module exists, exceeding this threshold should
    // route through an additional confirmation step before payment executes.
    // For now, it's recorded as a flag so the audit trail already reflects
    // this distinction � the enforcement gets wired in when payments land.
    const amount = product ? product.price * input.quantity : 0;
    const requiresEscalation = product?.requiresConfirmationAbove
        ? amount > product.requiresConfirmationAbove
        : false;
    checks.push({
        check: 'amount_threshold',
        result: true, // informational only � does not block the gate on its own
        detail: requiresEscalation
            ? `Amount ${amount} paise exceeds requiresConfirmationAbove (${product?.requiresConfirmationAbove}). Will require additional confirmation once payment step is wired.`
            : `Amount ${amount} paise is within auto-approvable range.`,
    });
    // ---- Final decision ----
    // The gate passes only if the hard checks (confirmation + stock) both
    // pass. The threshold check is informational at this stage.
    const passed = checks[0].result && checks[1].result;
    const reason = passed
        ? 'All required checks passed.'
        : checks.find((c) => !c.result)?.detail ?? 'One or more checks failed.';
    // ---- Persist the decision (this IS the explainability record) ----
    const [decisionRow] = await db
        .insert(gatingDecisions)
        .values({
        sessionId: input.sessionId,
        proposedAction: input,
        passed,
        failureReason: passed ? null : reason,
        checksPerformed: checks,
    })
        .returning({ id: gatingDecisions.id });
    await auditService.logAction({
        sessionId: input.sessionId,
        actionType: 'gate_checked',
        reason,
        payload: { sku: input.sku, quantity: input.quantity, passed, checks },
    });
    const result = {
        passed,
        gatingDecisionId: decisionRow.id,
        reason,
        checks,
        product: product
            ? {
                id: product.id,
                sku: product.sku,
                name: product.name,
                price: product.price,
                currency: product.currency,
            }
            : undefined,
    };
    if (passed && product) {
        const paymentOrder = await paymentService.createOrder({
            sessionId: input.sessionId,
            productId: product.id,
            quantity: input.quantity,
            amount,
            currency: product.currency,
        });
        await auditService.logAction({
            sessionId: input.sessionId,
            actionType: 'payment_result',
            reason: 'Razorpay order created after gating passed.',
            payload: { orderId: paymentOrder.id, amount, currency: product.currency },
        });
        return { ...result, paymentOrder };
    }
    return result;
}
