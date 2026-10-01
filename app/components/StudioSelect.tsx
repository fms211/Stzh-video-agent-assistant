"use client";

import { CreativeSelect, type CreativeSelectOption } from "./CreativeSelect";

type Props = {
  label: string;
  value: string;
  options: readonly CreativeSelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
  describedBy?: string;
  placeholder?: string;
  className?: string;
};

/** Reuse the keyboard-aware round menu; encode every key so an empty project
 * selection remains a real option without colliding with application IDs. */
export function StudioSelect({ label, value, options, onChange, placeholder, className, ...props }: Props) {
  return <CreativeSelect {...props}
    aria-label={label}
    className={`studio-select${className ? ` ${className}` : ""}`}
    value={`studio:${value}`}
    placeholder={placeholder ?? "请选择"}
    groups={[{ label, options: options.map(option => ({ ...option, value: `studio:${option.value}` })) }]}
    onChange={key => { if (key.startsWith("studio:")) onChange(key.slice(7)); }}
  />;
}
