"use client";

import { useEffect, useRef, useState } from "react";
import { UNSAFE_PortalProvider } from "react-aria/PortalProvider";
import { LiquidGlassSurface } from "./LiquidGlassSurface";

import {
  Button,
  FieldError,
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
  required?: boolean;
  name?: string;
  id?: string;
  className?: string;
  describedBy?: string;
};

/** 统一选择菜单；react-aria-components 提供键盘、校验、Escape 与焦点返回。 */
export function CreativeSelect({ "aria-label": ariaLabel, value, placeholder, groups, onChange, disabled, required, name, id, className, describedBy }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [portal, setPortal] = useState<HTMLElement | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [fieldsetDisabled, setFieldsetDisabled] = useState(false);
  useEffect(() => {
    setPortal(host.current?.closest("dialog") ?? undefined);
    const ancestors: HTMLElement[] = [];
    for (let node = host.current?.parentElement; node; node = node.parentElement) ancestors.push(node);
    const sync = () => setFieldsetDisabled(ancestors.some(node => {
      // React Aria temporarily makes the trigger's ancestors inert while its
      // own modal popover is open. That is focus isolation, not form disabling.
      // Native inert still blocks interaction with genuinely hidden modes.
      if (!(node instanceof HTMLFieldSetElement) || !node.disabled) return false;
      const legend = Array.from(node.children).find(child => child.tagName === "LEGEND");
      return !legend?.contains(host.current);
    }));
    sync();
    const observer = new MutationObserver(sync);
    for (const node of ancestors) if (node instanceof HTMLFieldSetElement) observer.observe(node, { attributes: true, attributeFilter: ["disabled"] });
    return () => observer.disconnect();
  }, []);
  useEffect(() => { if (disabled || fieldsetDisabled) setOpen(false); }, [disabled, fieldsetDisabled]);
  return (
    <UNSAFE_PortalProvider getContainer={portal ? () => portal : undefined}>
    <Select
      ref={host}
      name={name}
      isRequired={required}
      validationBehavior="native"
      validate={() => required && (!value || value === "studio:") ? "请选择一项" : null}
      aria-label={ariaLabel}
      className={`creative-select${className ? ` ${className}` : ""}`}
      isDisabled={disabled || fieldsetDisabled}
      isOpen={open && !disabled && !fieldsetDisabled}
      onOpenChange={setOpen}
      aria-describedby={describedBy}
      placeholder={placeholder}
      selectedKey={value ?? null}
      onSelectionChange={(key) => { if (!disabled && !fieldsetDisabled) onChange(key === null ? "" : String(key)); }}
    >
      <Button id={id} className="creative-select__trigger">
        <SelectValue className="creative-select__value" />
        <span aria-hidden="true" className="creative-select__chevron">⌄</span>
      </Button>
      <Popover className="creative-select__popover" offset={8}>
        <LiquidGlassSurface variant="popover" className="liquid-popover-surface" aria-hidden="true">{null}</LiquidGlassSurface>
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
      <FieldError className="creative-select__error">请选择{ariaLabel}。</FieldError>
    </Select>
    </UNSAFE_PortalProvider>
  );
}
