import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";

const baseProps = {
  activeDestination: "home" as const,
  clubLogoUrl: null,
  isWorkspaceLoading: false,
  onNavigate: vi.fn(),
  onTeamChange: vi.fn(),
  selectedTeamId: "team-1",
  selectedTeamName: "TapLine U14",
  teams: [
    { id: "team-1", display_name: "TapLine U14" },
    { id: "team-2", display_name: "TapLine U16" },
  ],
};

describe("AppShell", () => {
  it("exposes the same five destinations to adaptive navigation", () => {
    render(<AppShell {...baseProps}><p>Page content</p></AppShell>);

    expect(screen.getAllByRole("button", { name: "Home" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Fixtures" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Match" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Stats" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "More" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Home" })[0]).toHaveAttribute("aria-current", "page");
  });

  it("navigates and changes workspace context", () => {
    const onNavigate = vi.fn();
    const onTeamChange = vi.fn();
    render(<AppShell {...baseProps} onNavigate={onNavigate} onTeamChange={onTeamChange}><p>Page</p></AppShell>);

    fireEvent.click(screen.getAllByRole("button", { name: "Fixtures" })[0]);
    fireEvent.change(screen.getAllByRole("combobox", { name: "Current team" })[0], { target: { value: "team-2" } });

    expect(onNavigate).toHaveBeenCalledWith("fixtures");
    expect(onTeamChange).toHaveBeenCalledWith("team-2");
  });

  it("removes application chrome in immersive mode", () => {
    render(<AppShell {...baseProps} immersive><p>Live collection</p></AppShell>);

    expect(screen.getByText("Live collection")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Primary navigation" })).not.toBeInTheDocument();
  });
});
