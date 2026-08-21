import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useSearchParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../services/api';
import Table from '../components/Table';
import Modal from '../components/Modal';
import Input from '../components/Input';
import Button from '../components/Button';
import { useBillingSettings } from '../context/BillingSettingsContext';
import { CreditCard, Printer, ChevronDown, ChevronUp, Plus, Minus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const ReceptionistOPDBilling = () => {
  const { billingSettings, workflow, getAppointmentActions, loading: billingSettingsLoading } = useBillingSettings();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const appIdParam = searchParams.get('appId');

  const [selectedApp, setSelectedApp] = useState(null);
  const [billingForm, setBillingForm] = useState({
    consultationFee: 300,
    registrationFee: 0,
    otherCharges: 0,
    discount: 0,
    paymentMode: 'Cash'
  });

  const [showAdditionalCharges, setShowAdditionalCharges] = useState(false);
  const [showDiscounts, setShowDiscounts] = useState(false);

  const [checkoutResult, setCheckoutResult] = useState(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);

  // Fetch today's unpaid appointments to checkout
  const { data: appointments, isLoading: appLoading, refetch } = useQuery({
    queryKey: ['appointments', 'billingIntakeList'],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const res = await api.get(`/operations/appointments?date=${today}`);
      return res.data.data;
    }
  });

  const unpaidApps = appointments?.filter(a => a.paymentStatus !== 'Paid') || [];

  // Fetch specific appointment details if appId is passed
  const { data: activeAppDetail } = useQuery({
    queryKey: ['appointmentDetail', appIdParam],
    queryFn: async () => {
      if (!appIdParam) return null;
      const res = await api.get(`/operations/appointments`);
      const matched = res.data.data.find(a => a._id === appIdParam);
      return matched;
    },
    enabled: !!appIdParam
  });

  useEffect(() => {
    if (activeAppDetail) {
      setSelectedApp(activeAppDetail);
      // Auto adjust consultation fees if emergency
      if (activeAppDetail.consultationType === 'Emergency') {
        setBillingForm(prev => ({ ...prev, consultationFee: 500, registrationFee: 0, otherCharges: 0, discount: 0 }));
      } else if (activeAppDetail.consultationType === 'Follow-Up') {
        setBillingForm(prev => ({ ...prev, consultationFee: 150, registrationFee: 0, otherCharges: 0, discount: 0 }));
      } else {
        setBillingForm(prev => ({ ...prev, consultationFee: 300, registrationFee: 0, otherCharges: 0, discount: 0 }));
      }
    }
  }, [activeAppDetail]);

  // Create Invoice Mutation with Post-Payment Workflow
  const createInvoiceMutation = useMutation({
    mutationFn: async (payload) => {
      const res = await api.post('/operations/invoices', payload);
      return res.data.data;
    },
    onSuccess: (data) => {
      const invNo = data.invoiceNo || data.invoiceNumber || 'OPD-RECEIPT';
      
      // 5. Show Success Feedback Toast
      toast.success(
        <div>
          <p className="font-bold text-xs">✓ Payment completed successfully.</p>
          <p className="text-[11px] opacity-90 font-mono">Receipt No: {invNo}</p>
        </div>,
        { duration: 4000 }
      );

      // Open receipt modal for quick print/reprint actions
      setCheckoutResult(data);
      setIsReceiptOpen(true);

      const currentAppId = selectedApp?._id;

      // 1 & 4. Refresh Checkout Register & Update Status immediately without page reload
      refetch().then((res) => {
        const updatedApps = res.data || [];
        // 6. Automatically load next unpaid patient if one exists
        const nextUnpaid = updatedApps.filter(a => 
          a._id !== currentAppId && 
          a.billingStatus !== 'Paid' && 
          a.paymentStatus !== 'Paid'
        );

        if (nextUnpaid.length > 0) {
          const next = nextUnpaid[0];
          setSelectedApp(next);
          if (next.consultationType === 'Emergency') {
            setBillingForm({ consultationFee: 500, registrationFee: 0, otherCharges: 0, discount: 0, paymentMode: 'Cash' });
          } else if (next.consultationType === 'Follow-Up') {
            setBillingForm({ consultationFee: 150, registrationFee: 0, otherCharges: 0, discount: 0, paymentMode: 'Cash' });
          } else {
            setBillingForm({ consultationFee: 300, registrationFee: 0, otherCharges: 0, discount: 0, paymentMode: 'Cash' });
          }
        } else {
          // Clear calculator if no unpaid patients remain
          setSelectedApp(null);
        }
      });

      // Clear route query params
      navigate('/reception/billing', { replace: true });
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Checkout failed');
    }
  });

  // Calculate totals cleanly handling empty strings & zero
  const consultationFeeNum = parseFloat(billingForm.consultationFee) || 0;
  const registrationFeeNum = parseFloat(billingForm.registrationFee) || 0;
  const otherChargesNum = parseFloat(billingForm.otherCharges) || 0;
  const discountNum = parseFloat(billingForm.discount) || 0;

  const subtotal = consultationFeeNum + registrationFeeNum + otherChargesNum;
  const gstAmount = parseFloat((subtotal * 0.18).toFixed(2));
  const netAmount = parseFloat((subtotal + gstAmount - discountNum).toFixed(2));

  const isSelectedAppPaid = selectedApp && (selectedApp.billingStatus === 'Paid' || selectedApp.paymentStatus === 'Paid');

  const handleCheckoutSubmit = (e) => {
    e.preventDefault();
    if (!selectedApp) {
      toast.error('Select an active checkout patient first');
      return;
    }

    if (isSelectedAppPaid) {
      toast.error('This patient has already completed billing.');
      return;
    }

    const payload = {
      appointmentId: selectedApp._id,
      patientId: selectedApp.patientId?._id,
      paymentMode: billingForm.paymentMode,
      paymentStatus: 'Paid',
      items: [
        { name: 'OPD Consultation Fee', quantity: 1, unitPrice: consultationFeeNum, price: consultationFeeNum }
      ],
      otherCharges: otherChargesNum,
      discount: discountNum,
      subtotal,
      gstAmount,
      netAmount
    };

    if (registrationFeeNum > 0) {
      payload.items.push({ name: 'Registration Card Fee', quantity: 1, unitPrice: registrationFeeNum, price: registrationFeeNum });
    }

    if (otherChargesNum > 0) {
      payload.items.push({ name: 'Clinical Procedures & Others', quantity: 1, unitPrice: otherChargesNum, price: otherChargesNum });
    }

    createInvoiceMutation.mutate(payload);
  };

  const allApps = appointments || [];

  const handlePrintReceipt = (reprint = false) => {
    document.body.classList.add('printing-receipt');
    if (reprint) {
      toast.success('Reprinting OPD receipt...');
    }
    window.print();
    setTimeout(() => {
      document.body.classList.remove('printing-receipt');
    }, 1000);
  };

  if (billingSettingsLoading || appLoading) {
    return (
      <div className="p-8 text-center text-xs font-semibold text-slate-500 space-y-2">
        <div className="w-6 h-6 border-2 border-[#2F63F2] border-t-transparent rounded-full animate-spin mx-auto" />
        <p>Loading billing configuration & OPD register...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 text-left">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">OPD Billing</h1>
        <p className="text-xs text-slate-500 font-medium mt-2">
          Cashier checkout register and billing manager for outpatient consultations.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        
        {/* Left Side: OPD Checkout Register Queue List */}
        <div className="lg:col-span-2">
          <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <span>💰</span> OPD Checkout Register
              </h3>
              <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                Queue: {allApps.length} Patients
              </span>
            </div>
            
            <Table
              headers={[
                { key: 'tokenNumber', label: 'Token', render: (row) => <span className="font-extrabold text-[#2F63F2] font-mono">{row.tokenNumber || 'N/A'}</span> },
                { key: 'patientId.uhid', label: 'Patient ID', render: (row) => <span className="font-bold font-mono text-slate-700">{row.patientId?.uhid}</span> },
                { key: 'patientId.name', label: 'Patient Name', render: (row) => <span className="font-bold text-slate-800">{row.patientId?.name}</span> },
                { key: 'consultationType', label: 'Intake Mode' },
                { 
                  key: 'billingStatus', 
                  label: 'Billing Status', 
                  render: (row) => {
                    const isPaid = row.billingStatus === 'Paid' || row.paymentStatus === 'Paid';
                    return isPaid ? (
                      <span className="text-[9px] font-bold border border-emerald-200 bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-xl uppercase tracking-wider flex items-center gap-1.5 w-fit">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                        PAID
                      </span>
                    ) : (
                      <span className="text-[9px] font-bold border border-rose-200 bg-rose-50 text-rose-600 px-2.5 py-1 rounded-xl uppercase tracking-wider flex items-center gap-1.5 w-fit">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                        UNPAID
                      </span>
                    );
                  } 
                }
              ]}
              data={allApps}
              inlineActions={true}
              actions={[
                {
                  label: 'Process Checkout',
                  icon: CreditCard,
                  variant: 'primary',
                  hidden: (row) => row.billingStatus === 'Paid' || row.paymentStatus === 'Paid',
                  onClick: (row) => {
                    setSelectedApp(row);
                    if (row.consultationType === 'Emergency') {
                      setBillingForm({ consultationFee: 500, registrationFee: 0, otherCharges: 0, discount: 0, paymentMode: 'Cash' });
                    } else if (row.consultationType === 'Follow-Up') {
                      setBillingForm({ consultationFee: 150, registrationFee: 0, otherCharges: 0, discount: 0, paymentMode: 'Cash' });
                    } else {
                      setBillingForm({ consultationFee: 300, registrationFee: 0, otherCharges: 0, discount: 0, paymentMode: 'Cash' });
                    }
                  }
                },
                {
                  label: 'View Receipt',
                  icon: Printer,
                  variant: 'secondary',
                  hidden: (row) => row.billingStatus !== 'Paid' && row.paymentStatus !== 'Paid',
                  onClick: async (row) => {
                    setSelectedApp(row);
                    try {
                      const res = await api.get('/operations/invoices');
                      const invoices = res.data.data || [];
                      const matched = invoices.find(inv => 
                        (inv.appointmentId === row._id || inv.appointmentId?._id === row._id) ||
                        (inv.patientId === row.patientId?._id || inv.patientId?._id === row.patientId?._id)
                      );
                      if (matched) {
                        setCheckoutResult(matched);
                        setIsReceiptOpen(true);
                      } else {
                        toast.error('Receipt record found.');
                      }
                    } catch (err) {
                      toast.error('Could not fetch invoice details.');
                    }
                  }
                }
              ]}
              loading={appLoading}
            />
          </div>
        </div>

        {/* Right Side: Cashier Calculator (Redesigned Compact Layout) */}
        <div className="lg:col-span-1">
          <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-sm space-y-4 text-left">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <span>🛒</span> Cashier Calculator
              </h3>
              {selectedApp && (
                <span className={`text-[10px] font-bold uppercase font-mono px-2 py-0.5 rounded ${
                  isSelectedAppPaid ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                }`}>
                  {isSelectedAppPaid ? 'PAID' : (selectedApp.consultationType || 'OPD')}
                </span>
              )}
            </div>

            {selectedApp ? (
              <form onSubmit={handleCheckoutSubmit} className="space-y-4 text-left font-sans">
                
                {/* 3. Paid Banner (Prevent Duplicate Billing) */}
                {isSelectedAppPaid && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs space-y-1 font-sans">
                    <div className="flex justify-between items-center font-bold text-emerald-800">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        Consultation Billed & Paid
                      </span>
                      <span className="text-[10px] font-mono bg-emerald-100 px-2 py-0.5 rounded text-emerald-700">PAID</span>
                    </div>
                    <p className="text-[11px] text-emerald-600">This patient visit has already been completed. Duplicate billing is disabled.</p>
                  </div>
                )}

                {/* Section 1 — Patient Information Card (Read-Only) */}
                <div className="p-3.5 bg-blue-50/80 border border-blue-100 rounded-xl space-y-1.5 font-sans">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-xs text-slate-900">{selectedApp.patientId?.name}</span>
                    <span className="text-[10px] font-bold bg-[#2F63F2]/10 text-[#2F63F2] border border-[#2F63F2]/20 px-2 py-0.5 rounded font-mono">
                      Token #{selectedApp.tokenNumber}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[11px] text-slate-600 font-mono">
                    <span>ID: <strong className="text-slate-800">{selectedApp.patientId?.uhid}</strong></span>
                    <span className="text-[10px] text-slate-500 font-sans font-medium">Type: {selectedApp.consultationType || 'Walk-In'}</span>
                  </div>
                </div>

                {/* Section 2 — Consultation Fee (Required) */}
                <div>
                  <Input 
                    label="Consultation Fee" 
                    type="number" 
                    value={billingForm.consultationFee} 
                    onChange={(e) => setBillingForm({ ...billingForm, consultationFee: e.target.value })} 
                    required
                    disabled={isSelectedAppPaid}
                    placeholder="300"
                  />
                </div>

                {/* Section 3 — Additional Charges (Collapsed Accordion) */}
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50">
                  <button
                    type="button"
                    onClick={() => setShowAdditionalCharges(!showAdditionalCharges)}
                    className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-bold text-slate-700 hover:bg-slate-100/80 transition-colors text-left cursor-pointer"
                  >
                    <span className="flex items-center gap-1.5 text-[#2F63F2]">
                      {showAdditionalCharges ? <Minus className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                      Additional Charges
                    </span>
                    <div className="flex items-center gap-2">
                      {(registrationFeeNum > 0 || otherChargesNum > 0) && (
                        <span className="text-[10px] font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-mono">
                          +₹{registrationFeeNum + otherChargesNum}
                        </span>
                      )}
                      {showAdditionalCharges ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                    </div>
                  </button>

                  <AnimatePresence>
                    {showAdditionalCharges && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="p-3.5 bg-white border-t border-slate-200 space-y-3"
                      >
                        <Input 
                          label="Registration Card Fee" 
                          type="number" 
                          value={billingForm.registrationFee} 
                          onChange={(e) => setBillingForm({ ...billingForm, registrationFee: e.target.value })} 
                          disabled={isSelectedAppPaid}
                          placeholder="0"
                        />
                        <Input 
                          label="Other Hospital Charges" 
                          type="number" 
                          value={billingForm.otherCharges} 
                          onChange={(e) => setBillingForm({ ...billingForm, otherCharges: e.target.value })} 
                          disabled={isSelectedAppPaid}
                          placeholder="0"
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Section 4 — Discounts (Collapsed Accordion) */}
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50">
                  <button
                    type="button"
                    onClick={() => setShowDiscounts(!showDiscounts)}
                    className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-bold text-slate-700 hover:bg-slate-100/80 transition-colors text-left cursor-pointer"
                  >
                    <span className="flex items-center gap-1.5 text-rose-600">
                      {showDiscounts ? <Minus className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                      Discounts
                    </span>
                    <div className="flex items-center gap-2">
                      {discountNum > 0 && (
                        <span className="text-[10px] font-bold bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full font-mono">
                          -₹{discountNum}
                        </span>
                      )}
                      {showDiscounts ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                    </div>
                  </button>

                  <AnimatePresence>
                    {showDiscounts && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="p-3.5 bg-white border-t border-slate-200 space-y-3"
                      >
                        <Input 
                          label="Discount Amount" 
                          type="number" 
                          value={billingForm.discount} 
                          onChange={(e) => setBillingForm({ ...billingForm, discount: e.target.value })} 
                          disabled={isSelectedAppPaid}
                          placeholder="0"
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Section 5 — Payment Mode (Always Visible) */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider pl-0.5">Payment Mode <span className="text-rose-500">*</span></label>
                  <select
                    className="enterprise-input"
                    value={billingForm.paymentMode}
                    onChange={(e) => setBillingForm({ ...billingForm, paymentMode: e.target.value })}
                    disabled={isSelectedAppPaid}
                    required
                  >
                    <option value="Cash">Cash Handover</option>
                    <option value="UPI">UPI Scanner (GPay/PhonePe)</option>
                    <option value="Card">Card Terminal Swipe</option>
                    <option value="NetBanking">NetBanking Transfer</option>
                  </select>
                </div>

                {/* Section 6 — Bill Summary (Live Update, Always Visible) */}
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs font-mono space-y-2">
                  <h4 className="font-bold border-b border-slate-200 pb-1.5 text-slate-700 uppercase tracking-widest text-[9px]">Bill Summary</h4>
                  <div className="flex justify-between text-slate-700"><span>Consultation Fee</span> <span>₹{consultationFeeNum}</span></div>
                  <div className="flex justify-between text-slate-600"><span>Registration Fee</span> <span>₹{registrationFeeNum}</span></div>
                  <div className="flex justify-between text-slate-600"><span>Other Charges</span> <span>₹{otherChargesNum}</span></div>
                  {discountNum > 0 && <div className="flex justify-between text-rose-600 font-bold"><span>Discount</span> <span>-₹{discountNum}</span></div>}
                  <div className="flex justify-between text-slate-500 text-[10px]"><span>GST (18% included)</span> <span>+₹{gstAmount}</span></div>
                  
                  <div className="flex justify-between items-center text-sm font-extrabold text-slate-900 border-t border-slate-200 pt-2 mt-2">
                    <span className="text-xs uppercase font-sans tracking-wider text-slate-800">Total Payable</span>
                    <span className="text-xl text-[#2F63F2] font-mono font-black">₹{netAmount}</span>
                  </div>
                </div>

                {/* Section 7 — Primary Action / Receipt Quick Action */}
                {isSelectedAppPaid ? (
                  <Button 
                    type="button"
                    onClick={() => {
                      if (checkoutResult) {
                        setIsReceiptOpen(true);
                      } else {
                        toast.success('Consultation is paid.');
                      }
                    }}
                    variant="secondary"
                    icon={Printer}
                    className="w-full py-3 text-xs font-bold uppercase tracking-wider"
                  >
                    View / Print Receipt
                  </Button>
                ) : (
                  <Button 
                    type="submit" 
                    variant="primary" 
                    className="w-full py-3.5 text-xs font-bold uppercase tracking-wider bg-[#2F63F2] hover:bg-blue-700 text-white cursor-pointer shadow-xs" 
                    loading={createInvoiceMutation.isPending}
                  >
                    Complete Payment
                  </Button>
                )}

              </form>
            ) : (
              <div className="p-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-center space-y-2">
                <p className="text-xs font-bold text-slate-600">No unpaid patients waiting.</p>
                <p className="text-[11px] text-slate-400">Select a patient from OPD Checkout Register to process billing.</p>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Cashier Invoice Print Modal (UI Preview) */}
      <Modal isOpen={isReceiptOpen} onClose={() => { setIsReceiptOpen(false); setCheckoutResult(null); }} title="🧾 Print OPD Consultation Receipt">
        {checkoutResult && (
          <div className="space-y-6 text-center">
            <div className="p-6 bg-slate-50 border border-slate-200 rounded-xl space-y-4 max-w-sm mx-auto font-mono text-left text-xs">
              <h2 className="text-sm font-bold text-center border-b pb-2 text-slate-800 uppercase tracking-widest">VillZone HIMS</h2>
              <div className="text-[10px] space-y-1 text-slate-500">
                <p><strong>Invoice ID:</strong> {checkoutResult.invoiceNo || checkoutResult.invoiceNumber || 'OPD-RECEIPT'}</p>
                <p><strong>Date:</strong> {checkoutResult.createdAt ? new Date(checkoutResult.createdAt).toLocaleString() : new Date().toLocaleString()}</p>
                <p><strong>Patient Name:</strong> {checkoutResult.patientId?.name || selectedApp?.patientId?.name || 'N/A'}</p>
                <p><strong>Phone:</strong> {checkoutResult.patientId?.mobileNumber || selectedApp?.patientId?.mobileNumber || 'N/A'}</p>
              </div>

              <div className="border-t border-b py-2 space-y-1.5">
                {checkoutResult.items && checkoutResult.items.length > 0 ? (
                  checkoutResult.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-[11px] text-slate-800">
                      <span>{item.name}</span>
                      <span className="font-bold">₹{item.unitPrice ?? item.price ?? item.amount ?? 0}</span>
                    </div>
                  ))
                ) : (
                  <div className="flex justify-between text-[11px] text-slate-800">
                    <span>OPD Consultation Fee</span>
                    <span className="font-bold">₹{checkoutResult.totalAmount ?? checkoutResult.subtotal ?? 300}</span>
                  </div>
                )}
              </div>

              <div className="space-y-1 text-[11px] font-bold text-slate-700">
                <div className="flex justify-between">
                  <span>Subtotal:</span> 
                  <span>₹{checkoutResult.totalAmount ?? checkoutResult.subtotal ?? 0}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>GST Tax (18%):</span> 
                  <span>₹{checkoutResult.tax ?? checkoutResult.gstAmount ?? 0}</span>
                </div>
                {(checkoutResult.discount > 0) && (
                  <div className="flex justify-between text-rose-600">
                    <span>Discounts:</span> 
                    <span>- ₹{checkoutResult.discount}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-black text-slate-900 border-t border-slate-200 pt-1.5 mt-1">
                  <span>Net Paid:</span>
                  <span className="text-[#2F63F2]">₹{checkoutResult.grandTotal ?? checkoutResult.netAmount ?? 0}</span>
                </div>
              </div>

              <div className="border-t pt-2 text-center text-[10px] text-slate-400">
                Mode: {checkoutResult.paymentMode || 'Cash'} | Cashier Verified
              </div>
            </div>

            <div className="flex gap-3 justify-center">
              <Button onClick={() => handlePrintReceipt(false)} variant="primary" icon={Printer} className="text-xs font-bold uppercase tracking-wider bg-[#2F63F2] hover:bg-blue-700">
                Print Receipt
              </Button>
              <Button onClick={() => handlePrintReceipt(true)} variant="secondary" icon={Printer} className="text-xs font-bold uppercase tracking-wider">
                Reprint Receipt
              </Button>
              <Button onClick={() => { setIsReceiptOpen(false); setCheckoutResult(null); }} variant="secondary" className="text-xs font-bold uppercase tracking-wider">
                Done
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Dedicated Printable Receipt Portal (Rendered directly under document.body for perfect print output) */}
      {isReceiptOpen && checkoutResult && createPortal(
        <div className="printable-receipt-container">
          <div className="text-center border-b border-black pb-3 mb-3">
            <h2 className="text-base font-bold tracking-widest uppercase text-black">VILLZONE HIMS</h2>
            <p className="text-[10px] uppercase tracking-wider text-slate-600">OPD Consultation Receipt</p>
          </div>

          <div className="text-[11px] space-y-1 border-b border-black pb-2 mb-2">
            <div className="flex justify-between"><span>Invoice ID:</span> <strong>{checkoutResult.invoiceNo || checkoutResult.invoiceNumber || 'OPD-RECEIPT'}</strong></div>
            <div className="flex justify-between"><span>Date & Time:</span> <span>{checkoutResult.createdAt ? new Date(checkoutResult.createdAt).toLocaleString() : new Date().toLocaleString()}</span></div>
            <div className="flex justify-between"><span>Patient Name:</span> <strong>{checkoutResult.patientId?.name || selectedApp?.patientId?.name || 'N/A'}</strong></div>
            <div className="flex justify-between"><span>Phone / UHID:</span> <span>{checkoutResult.patientId?.mobileNumber || selectedApp?.patientId?.mobileNumber || selectedApp?.patientId?.uhid || 'N/A'}</span></div>
          </div>

          {/* Line Items */}
          <div className="border-b border-black pb-2 mb-2 space-y-1 text-[11px]">
            <div className="flex justify-between font-bold border-b border-slate-300 pb-1">
              <span>Description</span>
              <span>Amount</span>
            </div>
            {checkoutResult.items && checkoutResult.items.length > 0 ? (
              checkoutResult.items.map((item, idx) => (
                <div key={idx} className="flex justify-between">
                  <span>{item.name} (x{item.quantity || 1})</span>
                  <span>₹{item.unitPrice ?? item.price ?? item.amount ?? 0}</span>
                </div>
              ))
            ) : (
              <div className="flex justify-between">
                <span>OPD Consultation Fee</span>
                <span>₹{checkoutResult.totalAmount ?? checkoutResult.subtotal ?? 300}</span>
              </div>
            )}
          </div>

          {/* Financial Breakdown */}
          <div className="text-[11px] space-y-1 border-b border-black pb-2 mb-3">
            <div className="flex justify-between"><span>Subtotal:</span> <span>₹{checkoutResult.totalAmount ?? checkoutResult.subtotal ?? 0}</span></div>
            <div className="flex justify-between"><span>GST Tax (18%):</span> <span>₹{checkoutResult.tax ?? checkoutResult.gstAmount ?? 0}</span></div>
            {(checkoutResult.discount > 0) && (
              <div className="flex justify-between text-rose-700"><span>Discounts:</span> <span>- ₹{checkoutResult.discount}</span></div>
            )}
            <div className="flex justify-between text-sm font-bold pt-1.5 border-t border-slate-400">
              <span>TOTAL PAID:</span>
              <span>₹{checkoutResult.grandTotal ?? checkoutResult.netAmount ?? 0}</span>
            </div>
          </div>

          <div className="text-center text-[10px] space-y-0.5">
            <p>Payment Mode: <strong>{checkoutResult.paymentMode || 'Cash'}</strong> | Status: <strong>PAID</strong></p>
            <p className="text-[9px] text-slate-500">Thank you for visiting VillZone HIMS. Wish you speedy recovery!</p>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
};

export default ReceptionistOPDBilling;
