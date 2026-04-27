import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorBoundary, SectionErrorBoundary } from "@/components/ErrorBoundary";

// Component that throws on demand
function Boom({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error("kaboom");
  return <div>healthy</div>;
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    // React logs the caught error; silence it for clean test output
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("renders children when no error is thrown", () => {
    render(
      <ErrorBoundary>
        <Boom shouldThrow={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("healthy")).toBeInTheDocument();
  });

  it("renders fallback UI and an error ID when a child throws", () => {
    render(
      <ErrorBoundary context="UnitTest">
        <Boom shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
    expect(screen.getByText(/Error ID:/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /go home/i })).toBeInTheDocument();
  });

  it("invokes onError callback with the error", () => {
    const onError = vi.fn();
    render(
      <ErrorBoundary onError={onError}>
        <Boom shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect((onError.mock.calls[0][0] as Error).message).toBe("kaboom");
  });

  it("retry button clears the error state", () => {
    function Toggle() {
      const [throws, setThrows] = (globalThis as any).__toggleState ?? [true, () => {}];
      return <Boom shouldThrow={throws} />;
    }
    // Use a local controllable component instead
    let shouldThrow = true;
    function Controllable() {
      if (shouldThrow) throw new Error("first");
      return <div>recovered</div>;
    }
    const { rerender } = render(
      <ErrorBoundary>
        <Controllable />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();

    // Flip the throw flag, then click retry to reset state
    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    rerender(
      <ErrorBoundary>
        <Controllable />
      </ErrorBoundary>,
    );
    expect(screen.getByText("recovered")).toBeInTheDocument();
  });

  it("renders custom fallback when provided", () => {
    render(
      <ErrorBoundary fallback={<div>my-fallback</div>}>
        <Boom shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("my-fallback")).toBeInTheDocument();
  });
});

describe("SectionErrorBoundary", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("renders compact fallback with custom message", () => {
    render(
      <SectionErrorBoundary fallbackMessage="Sidebar broke">
        <Boom shouldThrow={true} />
      </SectionErrorBoundary>,
    );
    expect(screen.getByText("Sidebar broke")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reload/i })).toBeInTheDocument();
  });

  it("renders children when healthy", () => {
    render(
      <SectionErrorBoundary>
        <Boom shouldThrow={false} />
      </SectionErrorBoundary>,
    );
    expect(screen.getByText("healthy")).toBeInTheDocument();
  });
});
