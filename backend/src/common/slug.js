export function slugify(v, max = 60) {
  return String(v || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
}

/** Return `base`, or base-2, base-3 ... whichever is not in `taken` (a Set). Adds the result to `taken`. */
export function uniqueSlug(base, taken) {
  const b = base || "card";
  let s = b;
  let i = 2;
  while (taken.has(s)) s = `${b}-${i++}`;
  taken.add(s);
  return s;
}
