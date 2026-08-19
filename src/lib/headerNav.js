// Which routes get the app-header's single-month stepper (‹ Sep › + Closed/
// Future-month pill). Dashboard, Budget, and the Reflect report tabs are all
// month-scoped — EXCEPT Reflect's Spending Breakdown (/reflect/spending),
// which owns a richer date-RANGE picker (ReportFilterBar: presets, arbitrary
// ranges, "All dates"). Showing the single-month header stepper there too gave
// the tab two independent, never-synced month controls, so we suppress it and
// let the range picker be the sole control on that one route.
export function showMonthSel(pathname) {
  const seg = pathname.split('/')[1] || 'dashboard';
  if (seg === 'dashboard' || pathname === '/budget') return true;
  return seg === 'reflect' && pathname !== '/reflect/spending';
}
