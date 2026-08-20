// Wave D: the desktop needs-category banner (Transactions.jsx) must not
// visibly increment for a row that was JUST saved — while a row sits in
// lastSaved it's already showing its own accent "Categorize?" chip in place
// of the amber pill (see Row), so counting it in the banner too would read as
// the save itself creating a new mistake. Pure set-difference, extracted so
// the exclusion is unit-tested without mounting the screen; once the row's
// saved-state ends (lastSaved no longer has it) the count includes it again
// on the next render, no separate reconciliation needed.
export function needsCategoryBannerCount(needsCat, lastSaved) {
  if (!needsCat || needsCat.size === 0) return 0;
  if (!lastSaved || lastSaved.size === 0) return needsCat.size;
  let n = 0;
  for (const id of needsCat) if (!lastSaved.has(id)) n++;
  return n;
}
