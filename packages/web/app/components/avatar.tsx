// Avatar — renders a user's avatar image when an upload OID is set, falling
// back to the first-letter monogram when not. Sizes are token-based so the
// component renders identically across server and client (no measurement
// hooks). The `?w=<px>` query string is a hint for future server-side image
// processing — today the upload endpoint serves the original bytes and the
// browser scales.

interface AvatarProps {
  user: {
    username: string;
    avatarUploadId?: string | null;
    displayName?: string | null;
  };
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}

const SIZE_TOKENS: Record<
  NonNullable<AvatarProps["size"]>,
  { box: string; text: string; px: number }
> = {
  xs: { box: "w-5 h-5", text: "text-[10px]", px: 40 },
  sm: { box: "w-6 h-6", text: "text-xs", px: 48 },
  md: { box: "w-8 h-8", text: "text-sm", px: 64 },
  lg: { box: "w-12 h-12", text: "text-lg", px: 96 },
  xl: { box: "w-20 h-20", text: "text-3xl", px: 160 },
};

export function Avatar({ user, size = "md", className = "" }: AvatarProps) {
  const tokens = SIZE_TOKENS[size];
  const letter = (user.displayName || user.username || "?").trim().charAt(0).toUpperCase() || "?";

  if (user.avatarUploadId) {
    return (
      <img
        src={`/api/uploads/${user.avatarUploadId}?w=${tokens.px}`}
        alt={`${user.username} avatar`}
        className={`${tokens.box} rounded-full object-cover bg-surface-secondary ${className}`}
      />
    );
  }

  return (
    <div
      className={`${tokens.box} ${tokens.text} rounded-full bg-gradient-to-br from-primary/20 to-primary/5 border border-border flex items-center justify-center font-semibold text-primary ${className}`}
      aria-label={`${user.username} avatar`}
    >
      {letter}
    </div>
  );
}
