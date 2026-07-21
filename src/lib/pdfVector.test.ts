import { describe, expect, it, vi } from "vitest";
import { drawSeamlessRoundedFill } from "./pdfVector";

describe("drawSeamlessRoundedFill", () => {
  it("compose un fond arrondi continu avec des primitives remplies", () => {
    const pdf = { rect: vi.fn(), circle: vi.fn() };

    drawSeamlessRoundedFill(pdf as never, 10, 20, 100, 60, 12);

    expect(pdf.rect).toHaveBeenCalledTimes(2);
    expect(pdf.circle).toHaveBeenCalledTimes(4);
    expect(pdf.rect.mock.calls.every((call) => call.at(-1) === "F")).toBe(true);
    expect(pdf.circle.mock.calls.every((call) => call.at(-1) === "F")).toBe(true);
  });

  it("utilise un rectangle simple lorsque les coins sont carrés", () => {
    const pdf = { rect: vi.fn(), circle: vi.fn() };

    drawSeamlessRoundedFill(pdf as never, 10, 20, 100, 60, 0);

    expect(pdf.rect).toHaveBeenCalledWith(10, 20, 100, 60, "F");
    expect(pdf.circle).not.toHaveBeenCalled();
  });
});
