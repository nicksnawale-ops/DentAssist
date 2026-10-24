import { createPaymentOrder, verifyOnlinePayment } from '../api/billingService';
import { ApiError, InvoiceDetail } from '../types';

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (event: string, cb: (r: any) => void) => void };
  }
}

const SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';
let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  scriptPromise ??= new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = SCRIPT_URL;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => {
      scriptPromise = null;
      reject(new Error('Could not load the payment window. Check your internet connection.'));
    };
    document.body.appendChild(el);
  });
  return scriptPromise;
}

export type OnlinePaymentResult =
  | { status: 'paid'; invoice: InvoiceDetail }
  | { status: 'cancelled' }
  | { status: 'failed'; error: ApiError };

/**
 * Opens Razorpay Checkout (UPI, cards, net banking) for the invoice's balance,
 * then verifies the payment with the server before reporting success.
 */
export async function payInvoiceOnline(invoiceId: string): Promise<OnlinePaymentResult> {
  const orderRes = await createPaymentOrder(invoiceId);
  if (!orderRes.data) return { status: 'failed', error: orderRes.error! };
  const order = orderRes.data;

  try {
    await loadScript();
  } catch (e) {
    return { status: 'failed', error: { message: (e as Error).message, code: 'CHECKOUT_UNAVAILABLE' } };
  }

  return new Promise(resolve => {
    const checkout = new window.Razorpay!({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amountPaise,
      currency: order.currency,
      name: order.clinicName || 'DentAssist',
      description: `Invoice ${order.invoiceNumber}`,
      prefill: { name: order.patientName, email: order.patientEmail || '', contact: order.patientPhone || '' },
      theme: { color: '#0F4C5C' },
      modal: { ondismiss: () => resolve({ status: 'cancelled' }) },
      handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
        const verified = await verifyOnlinePayment({
          razorpayOrderId: response.razorpay_order_id,
          razorpayPaymentId: response.razorpay_payment_id,
          razorpaySignature: response.razorpay_signature,
        });
        resolve(verified.data ? { status: 'paid', invoice: verified.data } : { status: 'failed', error: verified.error! });
      },
    });
    checkout.on('payment.failed', (r: any) =>
      resolve({ status: 'failed', error: { message: r?.error?.description || 'The payment did not go through.', code: 'PAYMENT_FAILED' } }),
    );
    checkout.open();
  });
}
