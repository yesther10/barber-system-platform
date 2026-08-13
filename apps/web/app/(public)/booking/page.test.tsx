import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import BookingPage from "./page";

describe("booking page", () => {
  it("sends guests to login with an internal booking handoff only", () => {
    const html = renderToStaticMarkup(<BookingPage />);

    expect(html).toContain('href="/login?next=%2Fbooking"');
  });
});
