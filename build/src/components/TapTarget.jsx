// Accessible tap target. Wraps any clickable element with:
//  - role="button" + tabIndex + Enter/Space keyboard handling
//  - 44×44 minimum hit area (override with minTap={false} for icon clusters)
//  - aria-label so screen readers announce the action, not the visible text
//  - aria-disabled when disabled
// Use this anywhere you'd otherwise put onClick on a <div>.

export const TapTarget = ({
  children,
  onClick,
  label,
  role = "button",
  disabled,
  style = {},
  minTap = true,
  ...rest
}) => {
  const handleKey = (e) => {
    if (disabled || !onClick) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick(e);
    }
  };
  const onClickGuarded = disabled ? undefined : onClick;
  const merged = {
    cursor: disabled ? "not-allowed" : "pointer",
    userSelect: "none",
    WebkitTapHighlightColor: "transparent",
    ...(minTap ? { minWidth: 44, minHeight: 44 } : {}),
    ...style,
  };
  return (
    <div
      role={role}
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      aria-label={label}
      onClick={onClickGuarded}
      onKeyDown={handleKey}
      style={merged}
      {...rest}
    >
      {children}
    </div>
  );
};
