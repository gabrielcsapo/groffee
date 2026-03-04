import { NavLink } from "react-router";

interface NavSection {
  title: string;
  items: { label: string; to: string }[];
}

const sections: NavSection[] = [
  {
    title: "Guide",
    items: [
      { label: "Getting Started", to: "/docs/getting-started" },
      { label: "Architecture", to: "/docs/architecture" },
      { label: "Deployment", to: "/docs/deployment" },
    ],
  },
  {
    title: "Reference",
    items: [{ label: "API Documentation", to: "/docs/api" }],
  },
];

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="space-y-6">
      {sections.map((section) => (
        <div key={section.title}>
          <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2 px-3">
            {section.title}
          </h3>
          <ul className="space-y-0.5">
            {section.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  onClick={onNavigate}
                  end
                  className={({ isActive }) =>
                    `block px-3 py-1.5 text-sm rounded-md hover:no-underline ${
                      isActive
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-text-secondary hover:text-text-primary hover:bg-surface-secondary"
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
