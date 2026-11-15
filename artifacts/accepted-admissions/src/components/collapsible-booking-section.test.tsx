import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import {
  bookingSectionStartsCollapsed,
  CollapsibleBookingSection,
} from "./collapsible-booking-section";
import { scrollToPortalBooking } from "@/lib/portal-sat";

const MICHELLE = "b21bc32a-82c3-4252-a702-daa3fcdd23af";
const SOPHIA_SLEIMAN = "bf530aa6-faaa-43df-b3cf-140026f3313e";

afterEach(() => cleanup());

describe("collapsed pay / book section", () => {
  test("only Michelle Makarem and Sophia Sleiman start collapsed", () => {
    expect(bookingSectionStartsCollapsed(MICHELLE)).toBe(true);
    expect(bookingSectionStartsCollapsed(SOPHIA_SLEIMAN)).toBe(true);
    expect(bookingSectionStartsCollapsed("6f4c2a80-1b7e-4d3a-9c55-0e8a7b2d4f19")).toBe(false);
    expect(bookingSectionStartsCollapsed("some-other-student")).toBe(false);
    expect(bookingSectionStartsCollapsed(null)).toBe(false);
    expect(bookingSectionStartsCollapsed(undefined)).toBe(false);
  });

  test("collapsed students see a closed header that expands on click", () => {
    render(
      <CollapsibleBookingSection collapsed title="Pay and book a session with a tutor">
        <div id="booking-schedule">Booking schedule</div>
      </CollapsibleBookingSection>,
    );
    const details = screen.getByTestId("collapsible-booking-section") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(screen.getByTestId("collapsible-booking-summary").textContent).toMatch(
      /Pay and book a session with a tutor/,
    );
    const toggle = screen.getByTestId("collapsible-booking-toggle");
    expect(toggle.textContent).toBe("Press to Book");
    expect(screen.getByTestId("collapsible-booking-summary").contains(toggle)).toBe(true);
    fireEvent.click(screen.getByTestId("collapsible-booking-summary"));
    details.open = true;
    fireEvent(details, new Event("toggle"));
    expect(details.open).toBe(true);
    expect(screen.getByTestId("collapsible-booking-toggle").textContent).toBe("Hide");
    expect(screen.getByText("Booking schedule")).toBeTruthy();
    details.open = false;
    fireEvent(details, new Event("toggle"));
    expect(screen.getByTestId("collapsible-booking-toggle").textContent).toBe("Press to Book");
  });

  test("other students render the booking section unchanged with no wrapper", () => {
    render(
      <CollapsibleBookingSection collapsed={false} title="Pay and book a session with a tutor">
        <div id="booking-schedule">Booking schedule</div>
      </CollapsibleBookingSection>,
    );
    expect(screen.queryByTestId("collapsible-booking-section")).toBeNull();
    expect(screen.queryByText("Press to Book")).toBeNull();
    expect(screen.getByText("Booking schedule")).toBeTruthy();
  });

  test("jumping to the booking schedule opens the collapsed section", () => {
    render(
      <CollapsibleBookingSection collapsed title="Pay and book a session with a tutor">
        <div id="booking-schedule">Booking schedule</div>
      </CollapsibleBookingSection>,
    );
    const node = document.getElementById("booking-schedule")!;
    node.scrollIntoView = () => {};
    const details = screen.getByTestId("collapsible-booking-section") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(scrollToPortalBooking()).toBe(true);
    expect(details.open).toBe(true);
    fireEvent(details, new Event("toggle"));
    expect(screen.getByTestId("collapsible-booking-toggle").textContent).toBe("Hide");
  });
});
