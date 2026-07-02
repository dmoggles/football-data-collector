import { useCallback, useEffect, useRef, useState } from "react";

export type SearchableOption = {
  value: string;
  label: string;
};

type SearchableSelectProps = {
  value: string;
  options: SearchableOption[];
  placeholder: string;
  disabled?: boolean;
  className?: string;
  onChange: (nextValue: string) => void;
};

export function SearchableSelect({
  value,
  options,
  placeholder,
  disabled = false,
  className,
  onChange,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const selected = options.find((option) => option.value === value);
    setQuery(selected?.label ?? "");
  }, [options, value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOptionLabel = options.find((option) => option.value === value)?.label ?? "";
  const normalizedQuery = query.trim().toLowerCase();
  const shouldFilter = Boolean(
    normalizedQuery && normalizedQuery !== selectedOptionLabel.trim().toLowerCase(),
  );
  const filteredOptions = shouldFilter
    ? options.filter((option) => option.label.toLowerCase().includes(normalizedQuery))
    : options;

  const selectOption = useCallback(
    (nextValue: string) => {
      const selected = options.find((option) => option.value === nextValue);
      onChange(nextValue);
      setQuery(selected?.label ?? "");
      setIsOpen(false);
      setActiveIndex(-1);
    },
    [onChange, options],
  );

  return (
    <div className={`searchable-select ${disabled ? "disabled" : ""} ${className ?? ""}`} ref={rootRef}>
      <input
        value={query}
        onFocus={() => {
          if (!disabled) {
            setIsOpen(true);
            setActiveIndex(0);
          }
        }}
        onChange={(event) => {
          const nextQuery = event.target.value;
          setQuery(nextQuery);
          setIsOpen(true);
          setActiveIndex(0);
          const exact = options.find((option) => option.label.toLowerCase() === nextQuery.trim().toLowerCase());
          onChange(exact?.value ?? "");
        }}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            if (!isOpen) { setIsOpen(true); setActiveIndex(0); return; }
            setActiveIndex((current) => Math.min(current + 1, filteredOptions.length - 1));
            return;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            if (!isOpen) { setIsOpen(true); setActiveIndex(Math.max(filteredOptions.length - 1, 0)); return; }
            setActiveIndex((current) => Math.max(current - 1, 0));
            return;
          }
          if (event.key === "Enter" && isOpen) {
            event.preventDefault();
            if (activeIndex >= 0 && filteredOptions[activeIndex]) {
              selectOption(filteredOptions[activeIndex].value);
            }
            return;
          }
          if (event.key === "Escape") { setIsOpen(false); setActiveIndex(-1); return; }
          if (event.key === "Tab") { setIsOpen(false); setActiveIndex(-1); }
        }}
        placeholder={placeholder}
        disabled={disabled}
      />
      {isOpen && !disabled ? (
        <div className="searchable-select-menu">
          {filteredOptions.length === 0 ? <p className="searchable-select-empty">No matches</p> : null}
          {filteredOptions.map((option, index) => (
            <button
              className={`searchable-select-option ${
                option.value === value || index === activeIndex ? "active" : ""
              }`}
              key={option.value}
              type="button"
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => selectOption(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
