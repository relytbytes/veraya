// Group a ticket's items into fire rounds by firedAt. Items fired together
// share a timestamp; older data (firedAt null) collapses into the first round.
export function fireRounds<T extends { firedAt: string | null }>(items: T[]) {
  const groups = new Map<string, T[]>();
  for (const it of items) {
    const k = it.firedAt ?? "initial";
    const arr = groups.get(k) ?? [];
    arr.push(it);
    groups.set(k, arr);
  }
  const keys = [...groups.keys()].sort((a, b) => {
    if (a === "initial") return -1;
    if (b === "initial") return 1;
    return new Date(a).getTime() - new Date(b).getTime();
  });
  return keys.map((k) => ({ key: k, firedAt: k === "initial" ? null : k, items: groups.get(k)! }));
}
