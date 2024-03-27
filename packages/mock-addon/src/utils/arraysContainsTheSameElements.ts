export function arraysContainsTheSameElements(
  a: ReadonlyArray<any>,
  b: ReadonlyArray<any>
): boolean {
  if (a.length !== b.length) {
    return false;
  }

  const sortedA = a.toSorted();
  const sortedB = b.toSorted();

  return !sortedA.some((val, index) => val !== sortedB[index]);
}
