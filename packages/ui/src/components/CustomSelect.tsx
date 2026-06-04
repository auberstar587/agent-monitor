import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import type { CSSProperties } from "react";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface CustomSelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  style?: CSSProperties;
  disabled?: boolean;
  title?: string;
  variant?: "default" | "badge";
}

export default function CustomSelect({
  value,
  options,
  onChange,
  placeholder = "选择...",
  className = "",
  style,
  disabled = false,
  title,
  variant = "default",
}: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const [menuRect, setMenuRect] = useState({ top: 0, left: 0, width: 180 });
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const selected = useMemo(
    () => options.find((option) => option.value === value),
    [options, value],
  );

  const updatePosition = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenuRect({
      top: rect.bottom + 6,
      left: rect.left,
      width: Math.max(rect.width, 176),
    });
  };

  useLayoutEffect(() => {
    if (open) updatePosition();
  }, [open, value, options.length]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      const menu = document.querySelector("[data-custom-select-menu='true']");
      if (menu?.contains(target)) return;
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const handleReposition = () => updatePosition();

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [open]);

  const handleSelect = (option: SelectOption) => {
    if (option.disabled) return;
    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div
      ref={rootRef}
      className={`custom-select custom-select--${variant} ${open ? "open" : ""} ${className}`}
      style={style}
    >
      <button
        ref={triggerRef}
        type="button"
        className="custom-select-trigger"
        onClick={() => !disabled && setOpen((current) => !current)}
        disabled={disabled}
        title={title}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={selected ? "custom-select-value" : "custom-select-placeholder"}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown size={13} className="custom-select-chevron" />
      </button>

      {open && createPortal(
        <div
          data-custom-select-menu="true"
          className="custom-select-menu"
          style={{ top: menuRect.top, left: menuRect.left, width: menuRect.width }}
          role="listbox"
        >
          {options.map((option) => {
            const active = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                className={`custom-select-option ${active ? "active" : ""}`}
                onClick={() => handleSelect(option)}
                disabled={option.disabled}
                role="option"
                aria-selected={active}
              >
                <span>{option.label}</span>
                {active && <Check size={13} />}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}
