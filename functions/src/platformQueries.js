import { FieldPath } from "firebase-admin/firestore";

export async function count(query) {
  return (await query.count().get()).data().count;
}

// Use a document cursor so ties on the ordered field cross page boundaries.
export async function* pages(query) {
  const pageSize = 100;
  let page = await query.limit(pageSize).get();
  while (page.size) {
    yield page.docs;
    if (page.size < pageSize) return;
    page = await query.startAfter(page.docs.at(-1)).limit(pageSize).get();
  }
}

export async function allRows(query) {
  const items = [];
  for await (const docs of pages(query)) items.push(...docs);
  return items;
}

// Some historical child records carry no tenant field. Reference ordering
// compares path segments, so only this organization's descendants match.
export function tenantGroup(org, name) {
  const key = FieldPath.documentId();
  return org.firestore.collectionGroup(name).where(key, ">=", org)
    .where(key, "<", org.parent.doc(org.id + "\u0000"));
}
