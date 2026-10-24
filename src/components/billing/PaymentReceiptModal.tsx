import React, { useState } from 'react';
import { Invoice, Payment } from '../../types';
import { mockPatients } from '../../data/mockPatients';
import { mockClinics } from '../../data/mockClinics';
import { Button } from '../ui/Button';
import { X, Printer, Download, MessageCircle, Building2, CheckCircle2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useToast } from '../ui/useToast';
import { formatCurrency } from '../../utils/currencyConfig';

interface PaymentReceiptModalProps {
  invoice: Invoice;
  payment: Payment;
  onClose: () => void;
}

export function PaymentReceiptModal({ invoice, payment, onClose }: PaymentReceiptModalProps) {
  const patient = mockPatients.find(p => p.id === invoice.patientId);
  const clinic = mockClinics.find(c => c.id === invoice.clinicId);
  const { toast } = useToast();
  const patientName = patient ? `${patient.firstName} ${patient.lastName}` : '';
  
  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);
  const [whatsAppSent, setWhatsAppSent] = useState(false);

  const handleSendWhatsApp = () => {
    setIsSendingWhatsApp(true);
    setTimeout(() => {
      setIsSendingWhatsApp(false);
      setWhatsAppSent(true);
      toast({
        title: "WhatsApp Receipt Sent",
        description: `Receipt for ${formatCurrency(payment.amount)} sent to ${patientName}.`,
      });
      setTimeout(() => setWhatsAppSent(false), 3000);
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-base/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface w-full max-w-4xl rounded-panel border border-line shadow-2xl flex flex-col h-[90vh]">
         {/* Header */}
         <div className="p-4 border-b border-line flex justify-between items-center bg-base">
           <h2 className="text-lg font-bold text-text-main flex items-center gap-2">
             Payment Receipt
           </h2>
           <div className="flex items-center gap-2">
             <Button variant="outline" size="sm" className="gap-2">
               <Printer className="w-4 h-4" /> Print
             </Button>
             <Button variant="outline" size="sm" className="gap-2">
               <Download className="w-4 h-4" /> PDF
             </Button>
             <Button 
                variant="primary" 
                size="sm" 
                className={`gap-2 ${whatsAppSent ? 'bg-success hover:bg-success text-white' : 'bg-green-600 hover:bg-green-700'}`}
                onClick={handleSendWhatsApp}
                disabled={isSendingWhatsApp || whatsAppSent}
              >
               {isSendingWhatsApp ? (
                 <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
               ) : whatsAppSent ? (
                 <CheckCircle2 className="w-4 h-4" />
               ) : (
                 <MessageCircle className="w-4 h-4" />
               )}
               {whatsAppSent ? 'Sent' : 'WhatsApp Receipt'}
             </Button>
             <button onClick={onClose} className="p-2 ml-2 text-text-muted hover:bg-text-muted/10 rounded-full transition-colors">
               <X className="w-5 h-5" />
             </button>
           </div>
         </div>

         {/* Receipt Content */}
         <div className="flex-1 overflow-y-auto p-8 bg-base">
            <div className="max-w-2xl mx-auto bg-white text-gray-900 p-10 rounded-xl shadow-panel border border-gray-200">
              
              <div className="flex justify-between items-start border-b border-gray-200 pb-8">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Building2 className="w-6 h-6 text-blue-600" />
                    <h1 className="text-xl font-bold">{clinic?.name}</h1>
                  </div>
                  <p className="text-sm text-gray-500">
                    {clinic?.address 
                      ? (typeof clinic.address === 'string' ? clinic.address : `${clinic.address.street}, ${clinic.address.city}, ${clinic.address.state} ${clinic.address.pincode}`) 
                      : '123 Dental Street, Healthcare City'}
                  </p>
                  <p className="text-sm text-gray-500">{clinic?.phone} • {clinic?.email}</p>
                </div>
                <div className="text-right">
                  <h2 className="text-3xl font-black text-gray-900 uppercase tracking-tight">Receipt</h2>
                  <p className="text-sm font-semibold text-gray-500 mt-1">RCPT-{payment.id.split('_')[1] || Date.now().toString().slice(-6)}</p>
                  <p className="text-sm text-gray-500 mt-1">Date: {format(parseISO(payment.paidAt), 'MMM d, yyyy')}</p>
                </div>
              </div>

              <div className="mt-8 flex justify-between">
                <div>
                  <p className="text-xs font-bold text-gray-400 mb-2">Received From</p>
                  <h3 className="text-lg font-bold text-gray-900">{patientName}</h3>
                  <p className="text-sm text-gray-500">{patient?.phone}</p>
                  <p className="text-sm text-gray-500">{patient?.email}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-gray-400 mb-2">Payment Details</p>
                  <p className="text-sm font-medium text-gray-900">For Invoice: {invoice.invoiceNumber}</p>
                  <p className="text-sm text-gray-500">Method: {payment.method}</p>
                  {payment.referenceNumber && <p className="text-sm text-gray-500">Ref: {payment.referenceNumber}</p>}
                </div>
              </div>

              <div className="mt-12 bg-gray-50 rounded-lg p-8 text-center border border-gray-100">
                <p className="text-sm font-medium text-gray-500 mb-2">Amount Received</p>
                <h2 className="text-5xl font-black text-blue-600">{formatCurrency(payment.amount)}</h2>
                
                <div className="mt-6 flex justify-center gap-4 text-sm">
                  <div className="bg-white px-4 py-2 rounded shadow-panel border border-gray-200">
                    <span className="text-gray-500">Invoice Total: </span>
                    <span className="font-bold text-gray-900">{formatCurrency(invoice.total)}</span>
                  </div>
                </div>
              </div>

              <div className="mt-16 pt-8 border-t border-gray-200 flex justify-between items-end">
                <div>
                  <p className="text-xs font-bold text-gray-400 mb-1">Notes</p>
                  <p className="text-sm text-gray-600">{payment.notes || 'Thank you for your payment.'}</p>
                </div>
                <div className="text-center">
                  <div className="w-40 h-12 border-b border-gray-300 mb-2"></div>
                  <p className="text-xs font-semibold text-gray-500 uppercase">Authorized Signatory</p>
                </div>
              </div>

            </div>
         </div>
      </div>
    </div>
  );
}
