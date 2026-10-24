import React, { useState } from 'react';
import { Invoice } from '../../types';
import { mockPayments } from '../../data/mockPayments';
import { X, CreditCard, ShieldCheck, ArrowRight, CheckCircle2, Lock } from 'lucide-react';
import { Button } from '../ui/Button';
import { useToast } from '../ui/useToast';
import { formatCurrency } from '../../utils/currencyConfig';

interface CheckoutModalProps {
  invoice: Invoice;
  onClose: () => void;
  onSuccess: () => void;
}

export function CheckoutModal({ invoice, onClose, onSuccess }: CheckoutModalProps) {
  const { toast } = useToast();
  
  const payments = mockPayments.filter(p => p.invoiceId === invoice.id);
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const balance = Math.max(0, invoice.total - totalPaid);

  const [step, setStep] = useState<'checkout' | 'processing' | 'success'>('checkout');
  const [selectedMethod, setSelectedMethod] = useState<'upi' | 'card'>('upi');

  const handlePay = () => {
    setStep('processing');
    
    // Simulate gateway processing delay
    setTimeout(() => {
      setStep('success');
      toast({
        title: 'Payment Successful',
        description: `Successfully paid ${formatCurrency(balance)} for Invoice ${invoice.invoiceNumber}.`
      });
    }, 2500);
  };

  return (
    <div className="fixed inset-0 z-[70] bg-base/90 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface w-full max-w-md rounded-panel border border-line shadow-2xl overflow-hidden flex flex-col relative">
        
        {step !== 'success' && (
          <button 
            onClick={onClose} 
            className="absolute top-4 right-4 p-2 bg-base/80 hover:bg-base rounded-full text-text-muted hover:text-text-main transition-colors z-10"
            disabled={step === 'processing'}
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {step === 'checkout' && (
          <div className="p-8">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-4">
                <CreditCard className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-text-main">Complete Payment</h2>
              <p className="text-sm text-text-muted mt-1">Invoice {invoice.invoiceNumber}</p>
            </div>

            <div className="bg-base border border-line rounded-xl p-6 mb-8 text-center">
              <p className="text-sm font-semibold text-text-muted mb-2">Amount to Pay</p>
              <p className="text-4xl font-bold text-primary">{formatCurrency(balance)}</p>
            </div>

            <div className="space-y-4 mb-8">
              <label className="block text-sm font-bold text-text-main mb-2">Select Payment Method</label>
              
              <div 
                className={`p-4 border rounded-xl cursor-pointer transition-all flex items-center justify-between ${selectedMethod === 'upi' ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-line hover:border-primary/50'}`}
                onClick={() => setSelectedMethod('upi')}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-base rounded-lg border border-line flex items-center justify-center">
                    <span className="font-bold text-primary text-xs">UPI</span>
                  </div>
                  <div>
                    <p className="font-semibold text-text-main">UPI Apps</p>
                    <p className="text-xs text-text-muted">GPay, PhonePe, Paytm</p>
                  </div>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedMethod === 'upi' ? 'border-primary' : 'border-text-muted/30'}`}>
                  {selectedMethod === 'upi' && <div className="w-2.5 h-2.5 bg-primary rounded-full" />}
                </div>
              </div>

              <div 
                className={`p-4 border rounded-xl cursor-pointer transition-all flex items-center justify-between ${selectedMethod === 'card' ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-line hover:border-primary/50'}`}
                onClick={() => setSelectedMethod('card')}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-base rounded-lg border border-line flex items-center justify-center">
                    <CreditCard className="w-5 h-5 text-text-muted" />
                  </div>
                  <div>
                    <p className="font-semibold text-text-main">Credit / Debit Card</p>
                    <p className="text-xs text-text-muted">Visa, Mastercard, RuPay</p>
                  </div>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedMethod === 'card' ? 'border-primary' : 'border-text-muted/30'}`}>
                  {selectedMethod === 'card' && <div className="w-2.5 h-2.5 bg-primary rounded-full" />}
                </div>
              </div>
            </div>

            <Button className="w-full py-4 text-lg font-bold gap-2" onClick={handlePay}>
              Pay {formatCurrency(balance)} <ArrowRight className="w-5 h-5" />
            </Button>

            <div className="mt-6 flex items-center justify-center gap-2 text-xs text-text-muted">
              <Lock className="w-3.5 h-3.5" />
              <span>Payments are secure and encrypted.</span>
            </div>
          </div>
        )}

        {step === 'processing' && (
          <div className="p-12 text-center flex flex-col items-center justify-center h-96">
            <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-6" />
            <h3 className="text-xl font-bold text-text-main mb-2">Processing Payment...</h3>
            <p className="text-sm text-text-muted">Please do not close this window or press back.</p>
            
            <div className="mt-8 flex items-center justify-center gap-2 text-xs text-text-muted">
              <ShieldCheck className="w-4 h-4 text-success" />
              <span>Secure Gateway Simulation</span>
            </div>
          </div>
        )}

        {step === 'success' && (
          <div className="p-12 text-center flex flex-col items-center justify-center h-96">
            <div className="w-20 h-20 bg-success/10 text-success rounded-full flex items-center justify-center mb-6 animate-bounce">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h3 className="text-2xl font-bold text-text-main mb-2">Payment Successful!</h3>
            <p className="text-text-muted mb-8">Your payment of <span className="font-bold text-text-main">{formatCurrency(balance)}</span> was received successfully.</p>
            
            <Button 
              className="w-full py-3" 
              onClick={() => {
                onSuccess();
                onClose();
              }}
            >
              Back to My Bills
            </Button>
          </div>
        )}

      </div>
    </div>
  );
}
