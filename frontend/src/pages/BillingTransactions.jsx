import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import Table from '../components/Table';
import Input from '../components/Input';
import Button from '../components/Button';
import { 
  CreditCard, Search, Calendar, Filter, RefreshCw, FileText, CheckCircle2, AlertCircle, Clock
} from 'lucide-react';

const BillingTransactions = () => {
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [paymentMode, setPaymentMode] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Fetch Invoices with backend pagination & filtering
  const { data: invoiceResponse, isLoading, refetch } = useQuery({
    queryKey: ['invoicesLedger', page, limit, search, status, paymentMode, startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('page', page);
      params.append('limit', limit);
      if (search) params.append('search', search);
      if (status) params.append('status', status);
      if (paymentMode) params.append('paymentMode', paymentMode);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const res = await api.get(`/operations/invoices?${params.toString()}`);
      return res.data;
    }
  });

  // Fetch Summary Financial Reports (Database Aggregated Source of Truth)
  const { data: reportResponse } = useQuery({
    queryKey: ['billingSummaryReports', startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      const res = await api.get(`/operations/billing/reports?${params.toString()}`);
      return res.data?.data;
    }
  });

  const invoices = invoiceResponse?.data || [];
  const pagination = invoiceResponse?.pagination || { totalPages: 1, totalRecords: 0 };
  const reports = reportResponse?.summary || {};
  const paymentMethods = reportResponse?.paymentMethods || {};
  const collectorBreakdown = reportResponse?.collectorBreakdown || {};

  return (
    <div className="space-y-6 text-left font-sans max-w-7xl mx-auto pb-12">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#2F63F2] uppercase tracking-wider mb-1">
            <CreditCard className="w-4 h-4" />
            Financial Operations
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Billing Transactions & Reconciliation</h1>
          <p className="text-xs text-slate-500 font-normal mt-0.5">
            Authoritative hospital billing ledger, daily collections, invoice audit, and end-of-day financial reconciliation.
          </p>
        </div>

        <Button
          onClick={() => refetch()}
          variant="secondary"
          icon={RefreshCw}
          className="text-xs font-bold uppercase tracking-wider h-9 px-4 shrink-0"
        >
          Refresh Ledger
        </Button>
      </div>

      {/* KPI Financial Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1 shadow-2xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Billed</span>
          <span className="text-lg font-extrabold text-slate-900 font-mono block">
            ₹{(reports.totalBilled || 0).toLocaleString('en-IN')}
          </span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1 shadow-2xs">
          <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block">Collected (Paid)</span>
          <span className="text-lg font-extrabold text-emerald-600 font-mono block">
            ₹{(reports.totalCollected || 0).toLocaleString('en-IN')}
          </span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1 shadow-2xs">
          <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider block">Pending Balance</span>
          <span className="text-lg font-extrabold text-amber-600 font-mono block">
            ₹{(reports.totalPending || 0).toLocaleString('en-IN')}
          </span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1 shadow-2xs">
          <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block">Consultation Revenue</span>
          <span className="text-lg font-extrabold text-blue-600 font-mono block">
            ₹{(reports.consultationRevenue || 0).toLocaleString('en-IN')}
          </span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1 shadow-2xs">
          <span className="text-[10px] font-bold text-purple-600 uppercase tracking-wider block">Reconciliation</span>
          <div className="flex items-center gap-1.5 pt-0.5">
            <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded border uppercase tracking-wider ${
              reports.reconciliationStatus === 'RECONCILED'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}>
              {reports.reconciliationStatus || 'RECONCILED'}
            </span>
          </div>
        </div>
      </div>

      {/* Revenue Breakdowns: Payment Method & Collector Role */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Payment Method Breakdown */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2.5 shadow-2xs text-xs">
          <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wider block border-b pb-2">
            Payment Method Breakdown
          </span>
          <div className="grid grid-cols-3 gap-2 text-center pt-1">
            <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
              <span className="text-[9px] font-bold text-slate-400 uppercase block">Cash</span>
              <span className="font-bold text-slate-800 font-mono">₹{(paymentMethods.Cash || 0).toLocaleString('en-IN')}</span>
            </div>
            <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
              <span className="text-[9px] font-bold text-slate-400 uppercase block">UPI</span>
              <span className="font-bold text-slate-800 font-mono">₹{(paymentMethods.UPI || 0).toLocaleString('en-IN')}</span>
            </div>
            <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
              <span className="text-[9px] font-bold text-slate-400 uppercase block">Card</span>
              <span className="font-bold text-slate-800 font-mono">₹{(paymentMethods.Card || 0).toLocaleString('en-IN')}</span>
            </div>
          </div>
        </div>

        {/* Collector Role Breakdown */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2.5 shadow-2xs text-xs">
          <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wider block border-b pb-2">
            Collector Role Breakdown
          </span>
          <div className="grid grid-cols-3 gap-2 text-center pt-1">
            <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
              <span className="text-[9px] font-bold text-slate-400 uppercase block">Reception</span>
              <span className="font-bold text-slate-800 font-mono">₹{(collectorBreakdown.Reception || 0).toLocaleString('en-IN')}</span>
            </div>
            <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
              <span className="text-[9px] font-bold text-slate-400 uppercase block">Doctor</span>
              <span className="font-bold text-slate-800 font-mono">₹{(collectorBreakdown.Doctor || 0).toLocaleString('en-IN')}</span>
            </div>
            <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
              <span className="text-[9px] font-bold text-slate-400 uppercase block">Pharmacy</span>
              <span className="font-bold text-slate-800 font-mono">₹{(collectorBreakdown.Pharmacy || 0).toLocaleString('en-IN')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Operational Filter Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-2xs">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
          <Filter className="w-4 h-4 text-[#2F63F2]" />
          <span>Ledger Filters & Search</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
          <Input 
            placeholder="Invoice No..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <select 
            className="enterprise-input h-10 text-xs" 
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="Paid">Paid</option>
            <option value="Unpaid">Unpaid</option>
          </select>

          <select 
            className="enterprise-input h-10 text-xs"
            value={paymentMode}
            onChange={(e) => setPaymentMode(e.target.value)}
          >
            <option value="">All Payment Modes</option>
            <option value="Cash">Cash</option>
            <option value="UPI">UPI</option>
            <option value="Card">Card</option>
          </select>

          <input 
            type="date" 
            className="enterprise-input h-10 text-xs"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />

          <input 
            type="date" 
            className="enterprise-input h-10 text-xs"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
      </div>

      {/* Authoritative Ledger Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
        <Table
          headers={[
            { key: 'invoiceNo', label: 'Invoice No', render: (row) => <span className="font-extrabold font-mono text-[#2F63F2] text-xs">{row.invoiceNo}</span> },
            { key: 'patientId.name', label: 'Patient Name', render: (row) => <span className="font-bold text-slate-800 text-xs">{row.patientId?.name || 'Walk-In'}</span> },
            { key: 'patientId.uhid', label: 'Patient ID', render: (row) => <span className="font-mono text-slate-600 text-xs">{row.patientId?.uhid || 'N/A'}</span> },
            { key: 'grandTotal', label: 'Amount', render: (row) => <span className="font-bold font-mono text-slate-900 text-xs">₹{(row.grandTotal || 0).toLocaleString('en-IN')}</span> },
            { key: 'paymentMode', label: 'Mode', render: (row) => <span className="text-xs font-semibold text-slate-700">{row.paymentMode || 'N/A'}</span> },
            { 
              key: 'paymentStatus', 
              label: 'Status', 
              render: (row) => (
                <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border uppercase tracking-wider ${
                  row.paymentStatus === 'Paid'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-rose-50 text-rose-700 border-rose-200'
                }`}>
                  {row.paymentStatus}
                </span>
              ) 
            },
            { key: 'createdAt', label: 'Date', render: (row) => <span className="text-[11px] font-mono text-slate-500">{new Date(row.createdAt).toLocaleDateString('en-IN')}</span> }
          ]}
          data={invoices}
          isLoading={isLoading}
        />

        {/* Server-Side Pagination Bar */}
        <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600 font-sans">
          <span>
            Showing page <strong>{pagination.currentPage}</strong> of <strong>{pagination.totalPages}</strong> ({pagination.totalRecords} total records)
          </span>

          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(prev => Math.max(prev - 1, 1))}
              className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold disabled:opacity-50 cursor-pointer"
            >
              Previous
            </button>

            <button
              disabled={page >= pagination.totalPages}
              onClick={() => setPage(prev => Math.min(prev + 1, pagination.totalPages))}
              className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold disabled:opacity-50 cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      </div>

    </div>
  );
};

export default BillingTransactions;
