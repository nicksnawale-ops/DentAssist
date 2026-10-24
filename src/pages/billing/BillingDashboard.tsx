import React from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { InvoicesList } from './InvoicesList';
import { OutstandingBalances } from './OutstandingBalances';
import { InsuranceClaimsTab } from './InsuranceClaimsTab';
import { FinancialReports } from './FinancialReports';
import { Wallet, AlertCircle, FileText, BarChart3 } from 'lucide-react';

export function BillingDashboard() {
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-text-main">Billing & Finance</h1>
        <p className="text-sm text-text-muted mt-2">Manage invoices, collections, claims, and view financial reports.</p>
      </div>

      <Tabs.Root defaultValue="invoices" className="flex flex-col gap-6">
        <Tabs.List className="flex border-b border-text-muted/10 overflow-x-auto scrollbar-hide">
          <Tabs.Trigger value="invoices" className="flex items-center gap-2 px-6 py-3 border-b-2 border-transparent text-sm font-medium text-text-muted hover:text-text-main data-[state=active]:border-primary data-[state=active]:text-primary whitespace-nowrap outline-none transition-colors">
            <Wallet className="w-4 h-4" /> All Invoices
          </Tabs.Trigger>
          <Tabs.Trigger value="outstanding" className="flex items-center gap-2 px-6 py-3 border-b-2 border-transparent text-sm font-medium text-text-muted hover:text-text-main data-[state=active]:border-primary data-[state=active]:text-primary whitespace-nowrap outline-none transition-colors">
            <AlertCircle className="w-4 h-4" /> Outstanding
          </Tabs.Trigger>
          <Tabs.Trigger value="claims" className="flex items-center gap-2 px-6 py-3 border-b-2 border-transparent text-sm font-medium text-text-muted hover:text-text-main data-[state=active]:border-primary data-[state=active]:text-primary whitespace-nowrap outline-none transition-colors">
            <FileText className="w-4 h-4" /> Insurance Claims
          </Tabs.Trigger>
          <Tabs.Trigger value="reports" className="flex items-center gap-2 px-6 py-3 border-b-2 border-transparent text-sm font-medium text-text-muted hover:text-text-main data-[state=active]:border-primary data-[state=active]:text-primary whitespace-nowrap outline-none transition-colors">
            <BarChart3 className="w-4 h-4" /> Reports
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="invoices" className="outline-none">
          <InvoicesList />
        </Tabs.Content>
        <Tabs.Content value="outstanding" className="outline-none">
          <OutstandingBalances />
        </Tabs.Content>
        <Tabs.Content value="claims" className="outline-none">
          <InsuranceClaimsTab />
        </Tabs.Content>
        <Tabs.Content value="reports" className="outline-none">
          <FinancialReports />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
