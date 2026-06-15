import { NavLink } from "react-router";
import { sections } from "../nav-data";

/* Sidebar voice mirrors the live product's rail conventions: lowercase
 * monospace section labels, amber left-edge accent on the active row, no
 * filled pill (which read as a chrome from a different system). */
export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="space-y-5 font-mono">
      {sections.map((section) => (
        <div key={section.title}>
          <h3 className="text-[10px] uppercase tracking-[0.14em] text-text-secondary mb-1.5 px-3">
            {section.title}
          </h3>
          <ul className="space-y-0">
            {section.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  onClick={onNavigate}
                  end
                  className={({ isActive }) =>
                    `block pl-3 pr-2 py-1 text-[12px] border-l-[3px] -ml-px no-underline hover:no-underline transition-colors ${
                      isActive
                        ? "border-accent text-accent font-medium bg-accent/8"
                        : "border-transparent text-text-secondary hover:text-text-primary hover:border-border-muted"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
