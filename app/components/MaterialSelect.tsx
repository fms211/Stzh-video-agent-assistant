"use client";

import { Children, Fragment, isValidElement, type ReactNode } from "react";
import { StudioSelect } from "./StudioSelect";
import type { CreativeSelectOption } from "./CreativeSelect";

type Props = {
  value: string; children: ReactNode; onValueChange: (value: string) => void;
  "aria-label": string; "aria-describedby"?: string;
  disabled?: boolean; required?: boolean; id?: string; name?: string; className?: string;
};
function text(node: ReactNode): string {
  return Children.toArray(node).map(child => isValidElement<{ children?: ReactNode }>(child) ? text(child.props.children) : String(child)).join("");
}
function options(nodes: ReactNode): CreativeSelectOption[] {
  return Children.toArray(nodes).flatMap(node => {
    if (!isValidElement<{ children?: ReactNode; value?: string; disabled?: boolean; label?: string }>(node)) return [];
    if (node.type === Fragment || node.type === "optgroup") return options(node.props.children);
    if (node.type !== "option") return [];
    return [{ value: String(node.props.value ?? text(node.props.children)), label: node.props.label ?? text(node.props.children), disabled: node.props.disabled }];
  });
}
/** Declarative option lists retain business handlers; React Aria owns menu interaction. */
export function MaterialSelect({ children, onValueChange, "aria-label": label, "aria-describedby": describedBy, ...props }: Props) {
  return <StudioSelect {...props} label={label} describedBy={describedBy} options={options(children)} onChange={onValueChange} />;
}
