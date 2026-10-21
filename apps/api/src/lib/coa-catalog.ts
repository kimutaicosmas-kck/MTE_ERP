/** Chart of accounts metadata — posting codes match `ledger.ts`. */
export type CoaRow = {
  code: string;
  name: string;
  type: "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "COGS" | "EXPENSE";
  parentCode?: string;
  detailType?: string;
  normalBalance?: "DR" | "CR";
  isControl?: boolean;
  allowManualPosting?: boolean;
  reportingGroup?: string;
};

export const COA_CATALOG: CoaRow[] = [
  { code: "10000", name: "Assets", type: "ASSET", isControl: true, allowManualPosting: false, reportingGroup: "Balance Sheet" },
  { code: "11000", name: "Current assets", type: "ASSET", parentCode: "10000", isControl: true, allowManualPosting: false },
  { code: "1000", name: "Cash on hand", type: "ASSET", parentCode: "11000", detailType: "Cash", normalBalance: "DR" },
  { code: "1010", name: "M-Pesa", type: "ASSET", parentCode: "11000", detailType: "Mobile money", normalBalance: "DR" },
  { code: "1020", name: "Bank — KCB", type: "ASSET", parentCode: "11000", detailType: "Bank", normalBalance: "DR" },
  { code: "1130", name: "Petty cash", type: "ASSET", parentCode: "11000", detailType: "Cash", normalBalance: "DR" },
  { code: "1100", name: "Accounts receivable", type: "ASSET", parentCode: "11000", detailType: "AR", normalBalance: "DR", isControl: true },
  { code: "1200", name: "Inventory", type: "ASSET", parentCode: "10000", detailType: "Inventory", normalBalance: "DR", isControl: true },
  { code: "13000", name: "Fixed assets", type: "ASSET", parentCode: "10000", isControl: true, allowManualPosting: false },
  { code: "1400", name: "Accumulated depreciation", type: "ASSET", parentCode: "10000", detailType: "Contra asset", normalBalance: "CR" },
  { code: "2110", name: "VAT input", type: "ASSET", parentCode: "11000", detailType: "Tax", normalBalance: "DR" },

  { code: "20000", name: "Liabilities", type: "LIABILITY", isControl: true, allowManualPosting: false, normalBalance: "CR", reportingGroup: "Balance Sheet" },
  { code: "2000", name: "Accounts payable", type: "LIABILITY", parentCode: "20000", detailType: "AP", normalBalance: "CR", isControl: true },
  { code: "2100", name: "VAT payable", type: "LIABILITY", parentCode: "20000", detailType: "Tax", normalBalance: "CR" },
  { code: "23000", name: "Payroll liabilities", type: "LIABILITY", parentCode: "20000", isControl: true, normalBalance: "CR" },
  { code: "2200", name: "PAYE payable", type: "LIABILITY", parentCode: "23000", normalBalance: "CR" },
  { code: "2210", name: "Statutory payable", type: "LIABILITY", parentCode: "23000", normalBalance: "CR" },
  { code: "2400", name: "Loans", type: "LIABILITY", parentCode: "20000", normalBalance: "CR" },

  { code: "30000", name: "Equity", type: "EQUITY", isControl: true, allowManualPosting: false, normalBalance: "CR", reportingGroup: "Balance Sheet" },
  { code: "3000", name: "Capital", type: "EQUITY", parentCode: "30000", normalBalance: "CR" },
  { code: "3200", name: "Retained earnings", type: "EQUITY", parentCode: "30000", normalBalance: "CR" },

  { code: "40000", name: "Revenue", type: "INCOME", isControl: true, allowManualPosting: false, normalBalance: "CR", reportingGroup: "P&L" },
  { code: "4000", name: "Product sales", type: "INCOME", parentCode: "40000", normalBalance: "CR" },
  { code: "4200", name: "Service revenue", type: "INCOME", parentCode: "40000", normalBalance: "CR" },

  { code: "5000", name: "Cost of goods sold", type: "COGS", normalBalance: "DR", reportingGroup: "P&L" },

  { code: "60000", name: "Expenses", type: "EXPENSE", isControl: true, allowManualPosting: false, normalBalance: "DR", reportingGroup: "P&L" },
  { code: "6000", name: "Operating expenses", type: "EXPENSE", parentCode: "60000", normalBalance: "DR" },
  { code: "6100", name: "Salaries", type: "EXPENSE", parentCode: "60000", normalBalance: "DR" },
  { code: "6200", name: "Rent", type: "EXPENSE", parentCode: "60000", normalBalance: "DR" },
  { code: "6300", name: "Electricity", type: "EXPENSE", parentCode: "60000", normalBalance: "DR" },
  { code: "6400", name: "Fuel", type: "EXPENSE", parentCode: "60000", normalBalance: "DR" },
  { code: "6500", name: "Internet", type: "EXPENSE", parentCode: "60000", normalBalance: "DR" },
  { code: "6600", name: "Marketing", type: "EXPENSE", parentCode: "60000", normalBalance: "DR" },
];
