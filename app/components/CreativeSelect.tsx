"use client";

import {
  Button,
  Header,
  ListBox,
  ListBoxItem,
  ListBoxSection,
  Popover,
  Select,
  SelectValue,
} from "react-aria-components";

export type CreativeSelectOption = {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
};

export type CreativeSelectGroup = {
  label: string;
  options: readonly CreativeSelectOption[];
};

type Props = {
  "aria-label": string;
  value: string | null;
  placeholder: string;
  groups: readonly CreativeSelectGroup[];
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
  describedBy?: string;
};

/** 统一的深色玻璃 Select；react-aria-components 提供键盘、typeahead、Escape 与焦点返回。 */
export function CreativeSelect({ "aria-label": ariaLabel, value, placeholder, groups, onChange, disabled, id, className, describedBy }: Props) {
  return (
    <Select
      aria-label={ariaLabel}
      className={`creative-select${className ? ` ${className}` : ""}`}
      isDisabled={disabled}
      aria-describedby={describedBy}
      placeholder={placeholder}
      selectedKey={value ?? null}
      onSelectionChange={(key) => onChange(key === null ? "" : String(key))}
    >
      <Button id={id} className="creative-select__trigger">
        <SelectValue />
        <span aria-hidden="true" className="creative-select__chevron">⌄</span>
      </Button>
      <Popover className="creative-select__popover" offset={8}>
        <ListBox aria-label={ariaLabel} className="creative-select__listbox">
          {groups.map((group) => (
            <ListBoxSection key={group.label} className="creative-select__group">
              <Header className="creative-select__group-label">{group.label}</Header>
              {group.options.map((option) => (
                <ListBoxItem key={option.value} id={option.value} isDisabled={option.disabled} textValue={option.label} className="creative-select__option">
                  <span>{option.label}</span>
                  {option.description ? <small>{option.description}</small> : null}
                </ListBoxItem>
              ))}
            </ListBoxSection>
          ))}
        </ListBox>
      </Popover>
    </Select>
  );
}
