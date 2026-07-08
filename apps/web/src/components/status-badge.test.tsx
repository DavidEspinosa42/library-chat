import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { StatusBadge } from "./status-badge.js";

describe("StatusBadge", () => {
  test("renders 'processing…' for the processing status", () => {
    render(<StatusBadge status="processing" />);
    expect(screen.getByTestId("status-badge").textContent).toBe("processing…");
  });

  test("renders the raw label for ready and failed", () => {
    const { rerender } = render(<StatusBadge status="ready" />);
    expect(screen.getByTestId("status-badge").textContent).toBe("ready");
    rerender(<StatusBadge status="failed" />);
    expect(screen.getByTestId("status-badge").textContent).toBe("failed");
  });

  test("applies a distinct style class per status", () => {
    const { rerender } = render(<StatusBadge status="ready" />);
    const readyClass = screen.getByTestId("status-badge").className;
    rerender(<StatusBadge status="failed" />);
    const failedClass = screen.getByTestId("status-badge").className;
    expect(readyClass).not.toBe(failedClass);
  });
});
