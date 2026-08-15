// The Plan screen's canonical ordering (Plan.jsx sections memo): sortOrder
// ascending with 0 as the missing default, names breaking ties. Groups and
// categories share the same comparator. Every list of groups or categories
// shown to the user must sort with these — never inline a copy.
export const byOrderThenName = (a, b) =>
  (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name);
export const sortGroups = groups => [...(groups || [])].sort(byOrderThenName);
export const sortCats = cats => [...(cats || [])].sort(byOrderThenName);
