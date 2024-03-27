import { arraysContainsTheSameElements } from "./arraysContainsTheSameElements";

describe("arraysContainsTheSameElements", () => {
  it("should match two arrays with the same elements, but in different order.", () => {
    const arrayA = ["jeff", "fred", "cecily"];
    const arrayB = ["fred", "cecily", "jeff"];

    const areEqual = arraysContainsTheSameElements(arrayA, arrayB);
    expect(areEqual).toBe(true);
  });

  it("should not match two arrays with different elements.", () => {
    const arrayA = ["jeff", "fred", "cecily"];
    const arrayB = ["fred", "cecily", "jeff", "jim"];

    const areEqual = arraysContainsTheSameElements(arrayA, arrayB);
    expect(areEqual).toBe(false);
  });
});
