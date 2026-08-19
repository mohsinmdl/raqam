// Which routes get the app-header's single-month stepper (‹ Aug › — the current
// month abbreviated to 3 letters — plus a Closed/Future-month pill). The Budget
// screen and the Reflect report tabs are month-scoped and get it. The one
// exception is Reflect's Spending Breakdown (/reflect/spending), which owns its
// own date-RANGE control (ReportFilterBar: preset windows — This Month, Last
// 3/6/12 Months, YTD, Last Year — plus ‹ › stepping and "All Dates"). Rendering
// the single-month stepper there too gave that tab two independent,
// never-synced month controls, so we suppress it and let the range picker be
// the sole control on that route.
//
// The `seg === 'dashboard'` branch (which the root path `/` falls into) is a
// defensive default: there is no live standalone Dashboard page any more — it
// was merged in as Reflect's "Overview" index tab (served at /reflect), and
// both `/dashboard` and `/` redirect into Reflect. Kept so the stepper is
// correct during any transient render at those paths.
export function showMonthSel(pathname) {
  const seg = pathname.split('/')[1] || 'dashboard';
  if (seg === 'dashboard' || pathname === '/budget') return true;
  return seg === 'reflect' && pathname !== '/reflect/spending';
}
