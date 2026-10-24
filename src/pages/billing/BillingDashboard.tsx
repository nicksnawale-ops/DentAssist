import React from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { InvoicesList } from './InvoicesList';
import { OutstandingBalances } from './OutstandingBalances';
import { InsuranceClaimsTab } from './InsuranceClaimsTab';
import { FinancialReports } from './FinancialReports';
import { PageHeader } from '../../components/ui/PageHeader';
import { useAuth } from '../../context/AuthContext';

const tabCls =
  'whitespace-nowrap shrink-0 px-4 sm:px-5 h-11 border-b-2 border-transparent text-sm font-medium text-text-muted hover:text-text-main data-[state=active]:border-primary data-[state=active]:text-primary outline-none transition-colors';

export function BillingDashboard() {
  const { user } = useAuth();
  const isManager = user?.role === 'super_admin' || user?.role === 'admin';

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader title="Billing" description="Invoices, payments, insurance claims and collections." />
      <Tabs.Root defaultValue="invoices" className="flex flex-col gap-5">
        <Tabs.List className="flex border-b border-line overflow-x-auto scrollbar-hide" aria-label="Billing sections">
          <Tabs.Trigger value="invoices" className={tabCls}>Invoices</Tabs.Trigger>
          <Tabs.Trigger value="outstanding" className={tabCls}>To collect</Tabs.Trigger>
          <Tabs.Trigger value="claims" className={tabCls}>Insurance</Tabs.Trigger>
          {isManager && <Tabs.Trigger value="reports" className={tabCls}>Reports</Tabs.Trigger>}
        </Tabs.List>
        <Tabs.Content value="invoices" className="outline-none"><InvoicesList /></Tabs.Content>
        <Tabs.Content value="outstanding" className="outline-none"><OutstandingBalances /></Tabs.Content>
        <Tabs.Content value="claims" className="outline-none"><InsuranceClaimsTab /></Tabs.Content>
        {isManager && <Tabs.Content value="reports" className="outline-none"><FinancialReports /></Tabs.Content>}
      </Tabs.Root>
    </div>
  );
}
