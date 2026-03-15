import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

if (!("createObjectURL" in URL)) {
  Object.defineProperty(URL, "createObjectURL", {
    writable: true,
    value: vi.fn(() => "blob:mock")
  });
}

if (!("revokeObjectURL" in URL)) {
  Object.defineProperty(URL, "revokeObjectURL", {
    writable: true,
    value: vi.fn()
  });
}
