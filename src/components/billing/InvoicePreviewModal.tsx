import React, { useRef, useState } from 'react';
import { Invoice } from '../../types';
import { mockPatients } from '../../data/mockPatients';
import { mockClinics } from '../../data/mockClinics';
import { mockPayments } from '../../data/mockPayments';
import { Button } from '../ui/Button';
import { X, Printer, Download, MessageCircle, Building2, CheckCircle2, IndianRupee } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useToast } from '../ui/useToast';
import { RecordPaymentModal } from './RecordPaymentModal';
import { PaymentReceiptModal } from './PaymentReceiptModal';
import { formatCurrency } from '../../utils/currencyConfig';

interface InvoicePreviewModalProps {
  invoice: Invoice;
  onClose: () => void;
}

export function InvoicePreviewModal({ invoice, onClose }: InvoicePreviewModalProps) {
  const patient = mockPatients.find(p => p.id === invoice.patientId);
  const clinic = mockClinics.find(c => c.id === invoice.clinicId);
  const { toast } = useToast();
  
  const patientName = patient ? `${patient.firstName} ${patient.lastName}` : '';
  
  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);
  const [whatsAppSent, setWhatsAppSent] = useState(false);
  const [showRecordPayment, setShowRecordPayment] = useState(false);
  const [previewReceiptFor, setPreviewReceiptFor] = useState<any>(null);
  
  const payments = mockPayments.filter(p => p.invoiceId === invoice.id);
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const balance = Math.max(0, invoice.total - totalPaid);
  
  const handlePrint = () => {
    window.print();
  };

  const handleWhatsAppSend = () => {
    setIsSendingWhatsApp(true);
    setTimeout(() => {
      setIsSendingWhatsApp(false);
      setWhatsAppSent(true);
      toast({
        title: "WhatsApp Message Sent",
        description: `Hi ${patientName}, your invoice #${invoice.invoiceNumber} for ${formatCurrency(invoice.total)} is ready. View/Pay here: https://link.to/pay`,
      });
      setTimeout(() => setWhatsAppSent(false), 3000);
    }, 1500);
  };

  const isPaid = invoice.status === 'Paid' || balance <= 0;

  return (
    <div className="fixed inset-0 z-50 bg-base/90 backdrop-blur-sm flex flex-col p-4 overflow-y-auto print:bg-white print:p-0">
      
      {/* Modal Controls (Hidden when printing) */}
      <div className="flex flex-wrap items-center justify-end gap-2 mb-4 shrink-0 print:hidden sticky top-0 z-50 bg-base/80 p-2 rounded-xl backdrop-blur-md max-w-[21cm] mx-auto w-full border border-line shadow-panel">
         {balance > 0 && (
           <Button size="sm" onClick={() => setShowRecordPayment(true)} className="gap-2 shadow-panel flex-1 sm:flex-none">
             <IndianRupee className="w-4 h-4" /> Record Payment
           </Button>
         )}
         <Button size="sm" variant="outline" onClick={handlePrint} className="bg-surface gap-2 shadow-panel flex-1 sm:flex-none">
           <Printer className="w-4 h-4" /> Print / PDF
         </Button>
         <Button 
           size="sm"
           onClick={handleWhatsAppSend} 
           disabled={isSendingWhatsApp || whatsAppSent}
           className={`gap-2 shadow-panel flex-1 sm:flex-none ${whatsAppSent ? 'bg-success hover:bg-success text-white' : 'bg-[#25D366] hover:bg-[#128C7E] text-white border-transparent'}`}
         >
           {whatsAppSent ? (
             <><CheckCircle2 className="w-4 h-4" /> Sent</>
           ) : isSendingWhatsApp ? (
             <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Sending...</>
           ) : (
             <><MessageCircle className="w-4 h-4" /> WhatsApp</>
           )}
         </Button>
         <button onClick={onClose} aria-label="Close" className="p-2 bg-surface border border-line text-text-muted hover:text-text-main rounded-lg shadow-panel transition-colors">
           <X className="w-5 h-5" />
         </button>
      </div>

      {/* Actual Invoice Document */}
      <div className="bg-white text-gray-900 w-full max-w-[21cm] min-h-[29.7cm] shadow-2xl p-6 sm:p-12 relative flex flex-col mx-auto shrink-0 print:shadow-none print:w-full print:max-w-none print:h-auto print:min-h-0 print:p-0">
         
         {/* Status Watermark */}
         {isPaid && (
           <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 rotate-[-30deg] border-4 border-green-500/20 text-green-500/20 text-8xl font-black pointer-events-none select-none z-0">
             PAID
           </div>
         )}
         
         {/* Header */}
         <div className="flex justify-between items-start border-b-2 border-gray-100 pb-8 relative z-10">
            <div>
               <div className="flex items-center gap-3 mb-2">
                 <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center text-white">
                   <Building2 className="w-6 h-6" />
                 </div>
                 <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{clinic?.name || 'VisionEdge DentAssist Dental'}</h1>
               </div>
                <p className="text-sm text-gray-600 mt-2 max-w-xs">
                  {clinic?.address 
                    ? (typeof clinic.address === 'string' ? clinic.address : `${clinic.address.street}, ${clinic.address.city}, ${clinic.address.state} ${clinic.address.pincode}`) 
                    : '123 Dental Street, Healthcare City'}
                </p>
               <p className="text-sm text-gray-600">Tel: {clinic?.phone || '+91 98765 43210'}</p>
               <p className="text-sm text-gray-600 font-medium mt-1">GSTIN: {clinic?.id === 'c1' ? '27AAAAA0000A1Z5' : 'N/A'}</p>
            </div>
            <div className="text-right">
               <h2 className="text-4xl font-black text-gray-200 mb-4">Invoice</h2>
               <div className="space-y-1 text-sm">
                  <div className="flex justify-end gap-4"><span className="text-gray-500 w-24">Invoice No:</span> <span className="font-bold text-gray-900">{invoice.invoiceNumber}</span></div>
                  <div className="flex justify-end gap-4"><span className="text-gray-500 w-24">Date:</span> <span className="font-medium text-gray-900">{format(parseISO(invoice.createdAt), 'dd MMM yyyy')}</span></div>
                  <div className="flex justify-end gap-4"><span className="text-gray-500 w-24">Due Date:</span> <span className="font-medium text-gray-900">{format(parseISO(invoice.dueDate), 'dd MMM yyyy')}</span></div>
               </div>
            </div>
         </div>

         {/* Bill To */}
         <div className="mt-8 mb-8 relative z-10">
            <h3 className="text-xs font-bold text-gray-400 mb-2">Bill To</h3>
            <p className="font-bold text-gray-900 text-lg">{patientName}</p>
            <p className="text-sm text-gray-600 mt-1">{patient?.phone}</p>
            <p className="text-sm text-gray-600">{patient?.email}</p>
         </div>

         {/* Line Items Table */}
         <div className="mt-8 flex-1 relative z-10">
            <table className="w-full text-left">
               <thead>
                  <tr className="border-b-2 border-gray-900">
                     <th className="py-3 text-sm font-bold text-gray-900 w-12">#</th>
                     <th className="py-3 text-sm font-bold text-gray-900">Description</th>
                     <th className="py-3 text-sm font-bold text-gray-900 text-right w-24">Qty</th>
                     <th className="py-3 text-sm font-bold text-gray-900 text-right w-32">Unit Price</th>
                     <th className="py-3 text-sm font-bold text-gray-900 text-right w-32">Amount</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-gray-100">
                  {invoice.lineItems.map((item, index) => (
                    <tr key={item.id}>
                       <td className="py-4 text-sm text-gray-600">{index + 1}</td>
                       <td className="py-4 text-sm text-gray-900 font-medium">
                         {item.procedureName}
                         {item.toothNumber && <span className="block text-xs text-gray-500 font-normal mt-0.5">Tooth: {item.toothNumber}</span>}
                       </td>
                       <td className="py-4 text-sm text-gray-600 text-right">{item.quantity}</td>
                       <td className="py-4 text-sm text-gray-600 text-right">{formatCurrency(item.unitCost)}</td>
                       <td className="py-4 text-sm text-gray-900 font-bold text-right">{formatCurrency(item.total)}</td>
                    </tr>
                  ))}
               </tbody>
            </table>
         </div>

         {/* Totals Section */}
         <div className="mt-8 flex justify-end relative z-10 border-t border-gray-100 pt-8">
            <div className="w-80 space-y-3">
               <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="font-medium text-gray-900">{formatCurrency(invoice.subtotal)}</span>
               </div>
               
               {invoice.discount > 0 && (
                 <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Discount {invoice.discountType === 'percentage' && `(${invoice.discount}%)`}</span>
                    <span className="font-medium text-red-600">-{formatCurrency((invoice.discountType === 'flat' ? invoice.discount : (invoice.subtotal * invoice.discount / 100)))}</span>
                 </div>
               )}

               <div className="flex justify-between text-sm">
                  <span className="text-gray-500">CGST (9%)</span>
                  <span className="font-medium text-gray-900">{formatCurrency(invoice.taxBreakdown.cgst, {minimumFractionDigits: 2})}</span>
               </div>
               <div className="flex justify-between text-sm pb-3 border-b border-gray-200">
                  <span className="text-gray-500">SGST (9%)</span>
                  <span className="font-medium text-gray-900">{formatCurrency(invoice.taxBreakdown.sgst, {minimumFractionDigits: 2})}</span>
               </div>

               <div className="flex justify-between items-center pt-2">
                  <span className="font-bold text-gray-900 text-lg">Total</span>
                  <span className="font-black text-gray-900 text-2xl">{formatCurrency(invoice.total, {minimumFractionDigits: 2})}</span>
               </div>
               
               {payments.length > 0 && (
                 <>
                   <div className="flex justify-between text-sm text-success pt-2">
                      <span className="font-semibold">Total Paid</span>
                      <span className="font-bold">-{formatCurrency(totalPaid, {minimumFractionDigits: 2})}</span>
                   </div>
                   <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                      <span className="font-bold text-gray-900 text-lg">Balance Due</span>
                      <span className="font-black text-error text-xl">{formatCurrency(balance, {minimumFractionDigits: 2})}</span>
                   </div>
                 </>
               )}
            </div>
         </div>

         {/* Payment History */}
         {payments.length > 0 && (
           <div className="mt-8 relative z-10 bg-gray-50 rounded-xl p-6 border border-gray-100">
             <h4 className="text-sm font-bold text-gray-900 mb-4">Payment History</h4>
             <div className="space-y-3">
               {payments.map(p => (
                 <div key={p.id} className="flex justify-between items-center bg-white p-3 rounded-lg border border-gray-200 shadow-panel">
                   <div className="flex items-center gap-3">
                     <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                       <IndianRupee className="w-4 h-4" />
                     </div>
                     <div>
                       <p className="text-sm font-semibold text-gray-900">{formatCurrency(p.amount)} <span className="text-gray-500 font-normal">via {p.method}</span></p>
                       <p className="text-xs text-gray-500">{format(parseISO(p.paidAt), 'MMM d, yyyy h:mm a')} {p.referenceNumber && `• Ref: ${p.referenceNumber}`}</p>
                     </div>
                   </div>
                   <Button variant="ghost" size="sm" onClick={() => setPreviewReceiptFor(p)} className="text-blue-600 hover:text-blue-700 hover:bg-blue-50">
                     View Receipt
                   </Button>
                 </div>
               ))}
             </div>
           </div>
         )}

         {/* Footer / Notes */}
         <div className="mt-16 pt-8 border-t-2 border-gray-100 relative z-10 flex justify-between items-end">
            <div className="max-w-md">
               <h4 className="text-xs font-bold text-gray-900 mb-2">Payment Instructions</h4>
               <p className="text-sm text-gray-500 leading-relaxed">
                 Please make the payment by the due date. You can pay via UPI to <span className="font-semibold text-gray-700">pay@visionedge</span> or transfer to Account No: XXXXXX9999, IFSC: SBIN000XXXX.
               </p>
               {invoice.notes && (
                 <div className="mt-4 pt-4 border-t border-gray-100">
                   <h4 className="text-xs font-bold text-gray-900 mb-2">Notes</h4>
                   <p className="text-sm text-gray-600 italic">{invoice.notes}</p>
                 </div>
               )}
            </div>
            
            <div className="text-center">
               <div className="w-40 h-24 border-b border-gray-300 mb-2 flex items-end justify-center">
                  <span className="text-gray-300 font-medium italic select-none">Authorized Signatory</span>
               </div>
               <p className="text-xs text-gray-500 font-medium">For {clinic?.name}</p>
            </div>
         </div>

      </div>
      
      {showRecordPayment && (
        <RecordPaymentModal 
          invoice={invoice} 
          onClose={() => setShowRecordPayment(false)} 
          onPaymentRecorded={(amount, method) => {
            console.log('Recorded', amount, method);
            toast({ title: 'Payment Recorded', description: `Successfully recorded ${formatCurrency(amount)} via ${method}.` });
            setShowRecordPayment(false);
          }} 
        />
      )}
      
      {previewReceiptFor && (
        <PaymentReceiptModal 
          invoice={invoice} 
          payment={previewReceiptFor} 
          onClose={() => setPreviewReceiptFor(null)} 
        />
      )}
    </div>
  );
}
